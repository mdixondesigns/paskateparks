/**
 * Database + storage side of content changesets. See ./changeset.ts for the
 * format and scripts/content-apply.ts for the CLI.
 */

import { config as loadDotenv } from "dotenv";
import type postgres from "postgres";

import { PARK_FIELDS, PHOTO_WIDTHS, type Changeset, type ParkChange } from "./changeset";

export const PROD_REF = "djhuxetdljryleztkdrp";
export const TRACKING_TABLE = "__paskateparks_content_changes";
const BUCKET = "photos";

// ─── Environments ───────────────────────────────────────────────────────────

export interface ProjectEnv {
  DIRECT_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
}

export function loadProjectEnv(file: string): ProjectEnv {
  const parsed = loadDotenv({ path: file, processEnv: {}, quiet: true }).parsed ?? {};
  const missing = ["DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
    (k) => !parsed[k] || parsed[k].includes("[YOUR-"),
  );
  if (missing.length > 0) throw new Error(`${file} is missing: ${missing.join(", ")}`);
  return parsed as unknown as ProjectEnv;
}

export const isProd = (env: ProjectEnv) =>
  env.DIRECT_URL.includes(PROD_REF) || env.NEXT_PUBLIC_SUPABASE_URL.includes(PROD_REF);

/** Staging = .env.local, and it must never point at production. */
export function loadStagingEnv(): ProjectEnv {
  const env = loadProjectEnv(".env.local");
  if (isProd(env)) {
    throw new Error(".env.local points at PRODUCTION. It must point at the staging project.");
  }
  return env;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const objectUrl = (env: ProjectEnv, path: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

const authHeaders = (env: ProjectEnv) => ({
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
});

export const sizedFile = (storagePath: string, width: number) => `${storagePath}@${width}w.jpg`;

export async function uploadObject(env: ProjectEnv, path: string, body: Buffer): Promise<void> {
  const res = await fetch(objectUrl(env, path), {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`upload ${path}: HTTP ${res.status} ${await res.text()}`);
}

/** Returns null when the object doesn't exist. */
export async function downloadObject(env: ProjectEnv, path: string): Promise<Buffer | null> {
  const res = await fetch(objectUrl(env, path), { headers: authHeaders(env) });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`download ${path}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function listFolder(env: ProjectEnv, folder: string): Promise<string[]> {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${folder}/`, limit: 1000 }),
  });
  if (!res.ok) throw new Error(`list ${folder}: HTTP ${res.status}`);
  return ((await res.json()) as Array<{ name: string }>).map((o) => o.name);
}

/**
 * Copy every size of each photo from staging to the target project. Throws
 * before copying anything if a photo is missing from staging.
 */
export async function copyPhotos(
  from: ProjectEnv,
  to: ProjectEnv,
  storagePaths: string[],
): Promise<void> {
  const files = storagePaths.flatMap((p) => PHOTO_WIDTHS.map((w) => sizedFile(p, w)));
  const bodies = new Map<string, Buffer>();
  for (const f of files) {
    const body = await downloadObject(from, f);
    if (!body) throw new Error(`photo ${f} is missing from staging — re-run content:photo`);
    bodies.set(f, body);
  }
  for (const [f, body] of bodies) await uploadObject(to, f, body);
}

// ─── Database ───────────────────────────────────────────────────────────────

export async function ensureTrackingTable(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ${TRACKING_TABLE} ENABLE ROW LEVEL SECURITY;
  `);
}

export async function appliedFilenames(sql: postgres.Sql): Promise<Set<string>> {
  const rows = await sql.unsafe<{ filename: string }[]>(`SELECT filename FROM ${TRACKING_TABLE}`);
  return new Set(rows.map((r) => r.filename));
}

const PG_CAST: Record<string, string> = {
  text: "text",
  int: "integer",
  float: "double precision",
  bool: "boolean",
  date: "date",
};

function castFor(column: string): string {
  const spec = PARK_FIELDS[column]!;
  return spec.kind === "enum" ? spec.pgType! : PG_CAST[spec.kind]!;
}

export interface ParkReport {
  slug: string;
  action: "created" | "updated";
  changed: string[];
}

async function applyPark(tx: postgres.TransactionSql, p: ParkChange): Promise<ParkReport> {
  const fields = p.fields ?? {};
  const columns = Object.keys(fields);
  const values = columns.map((c) => fields[c]) as postgres.ParameterOrJSON<never>[];
  const changed: string[] = [...columns];

  const [existing] = await tx.unsafe<{ id: number }[]>(`SELECT id FROM parks WHERE slug = $1`, [
    p.slug,
  ]);
  let parkId: number;
  let action: ParkReport["action"];

  if (!existing) {
    const missing = ["name", "city"].filter((c) => typeof fields[c] !== "string");
    if (missing.length > 0) {
      throw new Error(`park "${p.slug}" doesn't exist yet, so it needs: ${missing.join(", ")}`);
    }
    const cols = ["slug", ...columns];
    const params = cols.map((c, i) => (c === "slug" ? `$${i + 1}` : `$${i + 1}::${castFor(c)}`));
    const [row] = await tx.unsafe<{ id: number }[]>(
      `INSERT INTO parks (${cols.join(", ")}) VALUES (${params.join(", ")}) RETURNING id`,
      [p.slug, ...values],
    );
    parkId = row!.id;
    action = "created";
  } else {
    parkId = existing.id;
    action = "updated";
    if (columns.length > 0) {
      const sets = columns.map((c, i) => `${c} = $${i + 2}::${castFor(c)}`);
      if (columns.includes("status")) {
        // SET expressions see the OLD row, so this compares against the old status.
        const n = columns.indexOf("status") + 2;
        sets.push(
          `status_changed_at = CASE WHEN status IS DISTINCT FROM $${n}::park_status THEN now() ELSE status_changed_at END`,
        );
      }
      sets.push("updated_at = now()");
      await tx.unsafe(`UPDATE parks SET ${sets.join(", ")} WHERE id = $1`, [parkId, ...values]);
    }
  }

  if (p.obstacles) {
    await tx.unsafe(`DELETE FROM park_obstacles WHERE park_id = $1`, [parkId]);
    for (const o of p.obstacles) {
      await tx.unsafe(
        `INSERT INTO park_obstacles (park_id, obstacle) VALUES ($1, $2::obstacle_type)`,
        [parkId, o],
      );
    }
    changed.push("obstacles");
  }

  if (p.riding_surfaces) {
    await tx.unsafe(`DELETE FROM park_riding_surfaces WHERE park_id = $1`, [parkId]);
    for (const s of p.riding_surfaces) {
      await tx.unsafe(
        `INSERT INTO park_riding_surfaces (park_id, surface) VALUES ($1, $2::riding_surface)`,
        [parkId, s],
      );
    }
    changed.push("riding_surfaces");
  }

  if (p.amenities) {
    await tx.unsafe(`DELETE FROM park_amenities WHERE park_id = $1`, [parkId]);
    for (const a of p.amenities) {
      await tx.unsafe(
        `INSERT INTO park_amenities (park_id, type, present, notes) VALUES ($1, $2::amenity_type, $3, $4)`,
        [parkId, a.type, a.present, a.notes ?? null],
      );
    }
    changed.push("amenities");
  }

  if (p.links) {
    await tx.unsafe(`DELETE FROM park_links WHERE park_id = $1`, [parkId]);
    for (const [i, l] of p.links.entries()) {
      await tx.unsafe(
        `INSERT INTO park_links (park_id, type, url, label, sort_order) VALUES ($1, $2::link_type, $3, $4, $5)`,
        [parkId, l.type, l.url, l.label ?? null, i],
      );
    }
    changed.push("links");
  }

  for (const ph of p.photos_add ?? []) {
    const [row] = await tx.unsafe<{ id: number }[]>(
      `SELECT id FROM park_photos WHERE storage_path = $1`,
      [ph.path],
    );
    if (row) {
      await tx.unsafe(
        `UPDATE park_photos SET alt_text = $2, credit = $3, caption = $4 WHERE id = $1`,
        [row.id, ph.alt_text, ph.credit ?? null, ph.caption ?? null],
      );
    } else {
      await tx.unsafe(
        `INSERT INTO park_photos (park_id, storage_path, alt_text, credit, caption, sort_order)
         VALUES ($1, $2, $3, $4, $5,
           (SELECT coalesce(max(sort_order), -1) + 1 FROM park_photos WHERE park_id = $1))`,
        [parkId, ph.path, ph.alt_text, ph.credit ?? null, ph.caption ?? null],
      );
    }
  }
  if (p.photos_add?.length) changed.push(`photos (+${p.photos_add.length})`);

  return { slug: p.slug, action, changed };
}

/** Apply one changeset in a single transaction and record it as applied. */
export async function applyChangeset(
  sql: postgres.Sql,
  filename: string,
  cs: Changeset,
): Promise<ParkReport[]> {
  return sql.begin(async (tx) => {
    const reports: ParkReport[] = [];
    for (const p of cs.parks) reports.push(await applyPark(tx, p));
    await tx.unsafe(
      `INSERT INTO ${TRACKING_TABLE} (filename) VALUES ($1)
       ON CONFLICT (filename) DO UPDATE SET applied_at = now()`,
      [filename],
    );
    return reports;
  }) as Promise<ParkReport[]>;
}
