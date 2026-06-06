/**
 * Photo pipeline — phase 5 step 4.
 *
 * For each ParkPayload's photos: read the original from disk, Sharp-resize to
 * 3 widths (400/800/1200) with mozJPEG encoding, upload to Supabase Storage at
 * the canonical path. Idempotent on re-run via the A3 existence-check: if all
 * 3 sized files already exist in Storage for a photo, the whole resize+upload
 * round-trip is skipped.
 *
 * Canonical storage path convention (kept in sync with src/components/park/
 * ResponsiveImage.tsx and the inserter in step 5):
 *
 *   parks/<slug>/photo-<NN>@<width>w.jpg
 *
 * where <NN> is the photo's zero-padded sort_order (00, 01, ..., 99). The
 * sort_order matches `park_photos.sort_order` in Postgres — the photo strip
 * renders in that order.
 *
 * Format is JPEG (mozJPEG-encoded) per the F2 amendment in phase 5.
 *
 * Concurrency: serial per park, but the 3 sizes for one photo are Sharp-encoded
 * AND uploaded in parallel. Total runtime against the real 925-photo dump:
 * roughly 90-180 seconds end-to-end depending on connection.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import type { ParkPayload } from "./types";

const WIDTHS = [400, 800, 1200] as const;
const JPEG_QUALITY = 82;
const BUCKET = "photos";

// ─── Path helper — shared by pipeline + inserter ──────────────────────────────

/**
 * Storage path WITHOUT size/extension suffix.
 * Matches `ResponsiveImage`'s `storagePath` prop convention; the component
 * appends `@400w.jpg`, `@800w.jpg`, `@1200w.jpg` at render time.
 */
export function storagePathForPhoto(parkSlug: string, sortOrder: number): string {
  return `parks/${parkSlug}/photo-${String(sortOrder).padStart(2, "0")}`;
}

/** Just the filename portion (`photo-00@400w.jpg`) — used for existence checks. */
function fileNameForSize(sortOrder: number, width: number): string {
  return `photo-${String(sortOrder).padStart(2, "0")}@${width}w.jpg`;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export interface PhotoPipelineOptions {
  /** Absolute path to the `wp-content/uploads` folder copied from the WPEngine
   *  archive. Photo paths in ParkPayload.photos are relative to this. */
  uploadsRoot: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  /** If true, do everything except actually upload. Useful for "what would happen". */
  dryRun?: boolean;
  /** Optional per-park progress callback. */
  onProgress?: (info: { parksDone: number; parksTotal: number; lastSlug: string }) => void;
}

export interface PhotoPipelineResult {
  parksProcessed: number;
  /** Photos where at least one size was newly uploaded. */
  photosUploaded: number;
  /** Photos where all 3 sizes were already in Storage — no work done. */
  photosSkipped: number;
  /** Individual size-files written this run (3 per uploaded photo). */
  filesUploaded: number;
  /** Individual size-files that were already present. */
  filesSkipped: number;
  /** Errors encountered. Migration continues past errors; user reviews at end. */
  errors: Array<{ parkSlug: string; photoSortOrder: number; error: string }>;
}

export async function runPhotoPipeline(
  parks: ParkPayload[],
  opts: PhotoPipelineOptions,
): Promise<PhotoPipelineResult> {
  const sb = createClient(opts.supabaseUrl, opts.supabaseSecretKey);
  const result: PhotoPipelineResult = {
    parksProcessed: 0,
    photosUploaded: 0,
    photosSkipped: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    errors: [],
  };

  for (const park of parks) {
    try {
      await processOnePark(sb, park, opts, result);
    } catch (e) {
      result.errors.push({
        parkSlug: park.slug,
        photoSortOrder: -1,
        error: `unexpected: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    result.parksProcessed++;
    opts.onProgress?.({
      parksDone: result.parksProcessed,
      parksTotal: parks.length,
      lastSlug: park.slug,
    });
  }

  return result;
}

async function processOnePark(
  sb: SupabaseClient,
  park: ParkPayload,
  opts: PhotoPipelineOptions,
  result: PhotoPipelineResult,
): Promise<void> {
  if (park.photos.length === 0) return;

  // List the park's folder ONCE per park to learn what's already uploaded.
  // Cheap (single API call) and saves up to 3×N existence-check round-trips.
  const folder = `parks/${park.slug}`;
  const existingNames = new Set<string>();
  const { data: existingFiles, error: listError } = await sb.storage
    .from(BUCKET)
    .list(folder, { limit: 1000 });
  if (listError) {
    // "folder doesn't exist" is normal for first-run parks — treat as empty.
    // Real errors (auth, network) should surface.
    const msg = listError.message ?? String(listError);
    if (!/not found|does not exist/i.test(msg)) {
      result.errors.push({
        parkSlug: park.slug,
        photoSortOrder: -1,
        error: `list ${folder}: ${msg}`,
      });
      return;
    }
  } else {
    for (const f of existingFiles ?? []) existingNames.add(f.name);
  }

  for (const photo of park.photos) {
    const needed = WIDTHS.filter(
      (w) => !existingNames.has(fileNameForSize(photo.sortOrder, w)),
    );
    if (needed.length === 0) {
      result.photosSkipped++;
      result.filesSkipped += WIDTHS.length;
      continue;
    }

    // Read original from disk.
    const srcPath = resolve(opts.uploadsRoot, photo.wpFilePath);
    let srcBuffer: Buffer;
    try {
      srcBuffer = await readFile(srcPath);
    } catch (e) {
      result.errors.push({
        parkSlug: park.slug,
        photoSortOrder: photo.sortOrder,
        error: `read ${photo.wpFilePath}: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    // Sharp-resize the needed widths in parallel.
    let resized: Array<{ width: number; buf: Buffer }>;
    try {
      resized = await Promise.all(
        needed.map(async (width) => {
          const buf = await sharp(srcBuffer)
            .resize({ width, withoutEnlargement: true })
            .jpeg({ mozjpeg: true, quality: JPEG_QUALITY })
            .toBuffer();
          return { width, buf };
        }),
      );
    } catch (e) {
      result.errors.push({
        parkSlug: park.slug,
        photoSortOrder: photo.sortOrder,
        error: `sharp resize ${photo.wpFilePath}: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    // Upload resized buffers in parallel. Each missing size = one upload.
    if (opts.dryRun) {
      result.filesUploaded += resized.length;
      result.filesSkipped += WIDTHS.length - resized.length;
      result.photosUploaded++;
      continue;
    }

    const uploads = await Promise.all(
      resized.map(async ({ width, buf }) => {
        const name = fileNameForSize(photo.sortOrder, width);
        const fullPath = `${folder}/${name}`;
        const { error } = await sb.storage.from(BUCKET).upload(fullPath, buf, {
          contentType: "image/jpeg",
          cacheControl: "31536000", // 1 year — paths are content-addressed by sort_order
          upsert: false,
        });
        return { width, fullPath, error };
      }),
    );

    let anyError = false;
    for (const u of uploads) {
      if (u.error) {
        anyError = true;
        result.errors.push({
          parkSlug: park.slug,
          photoSortOrder: photo.sortOrder,
          error: `upload ${u.fullPath}: ${u.error.message}`,
        });
      } else {
        result.filesUploaded++;
      }
    }
    result.filesSkipped += WIDTHS.length - resized.length;
    if (!anyError) result.photosUploaded++;
  }
}
