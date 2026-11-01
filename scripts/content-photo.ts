/**
 * Resize photos and upload them to STAGING storage for a content changeset.
 *
 *   pnpm content:photo <park-slug> <issue-number> <image> [image…]
 *
 * Each image is auto-rotated (phone EXIF orientation), resized to 400/800/1200px
 * JPEGs (same settings as the WordPress migration), and uploaded to
 * parks/<slug>/i<issue>-NN@<width>w.jpg. Prints the storage paths to put in the
 * changeset's photos_add. Numbering continues after any existing i<issue>-NN
 * photos, so re-running adds rather than overwrites.
 *
 * Production gets these files later, copied by `pnpm content:apply --production`.
 */

import { readFile } from "node:fs/promises";
import sharp from "sharp";

import { listFolder, loadStagingEnv, sizedFile, uploadObject } from "./content/apply";
import { PHOTO_WIDTHS } from "./content/changeset";

const JPEG_QUALITY = 82;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function main() {
  const [slug, issueArg, ...files] = process.argv.slice(2);
  const issue = Number(issueArg);
  if (!slug || !SLUG_RE.test(slug) || !Number.isInteger(issue) || files.length === 0) {
    console.error("Usage: pnpm content:photo <park-slug> <issue-number> <image> [image…]");
    process.exit(1);
  }

  const env = loadStagingEnv();
  const folder = `parks/${slug}`;
  const prefix = `i${issue}-`;
  const taken = (await listFolder(env, folder))
    .map((name) => new RegExp(`^${prefix}(\\d+)@`).exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  let next = taken.length > 0 ? Math.max(...taken) + 1 : 1;

  const results: Array<{ file: string; path: string; width: number; height: number }> = [];
  for (const file of files) {
    const input = await readFile(file);
    const rotated = sharp(input).rotate(); // apply EXIF orientation, then strip it
    const meta = await sharp(await rotated.clone().toBuffer()).metadata();
    const storagePath = `${folder}/${prefix}${String(next).padStart(2, "0")}`;

    for (const width of PHOTO_WIDTHS) {
      const buf = await rotated
        .clone()
        .resize({ width, withoutEnlargement: true })
        .jpeg({ mozjpeg: true, quality: JPEG_QUALITY })
        .toBuffer();
      await uploadObject(env, sizedFile(storagePath, width), buf);
    }
    results.push({ file, path: storagePath, width: meta.width ?? 0, height: meta.height ?? 0 });
    if ((meta.width ?? 0) < 1200) {
      console.warn(`! ${file} is only ${meta.width}px wide — it will look soft on large screens`);
    }
    next++;
  }

  console.log("Uploaded to STAGING. Use these paths in photos_add:");
  for (const r of results) console.log(`  ${r.path}   ← ${r.file} (${r.width}×${r.height})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
