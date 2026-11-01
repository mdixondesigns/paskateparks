/**
 * Content changesets — park content as reviewable files.
 *
 * A changeset (content/changes/NNNN-<slug>.json) describes content changes for
 * one or more parks. The same file is applied to staging (by the agent, so the
 * Vercel preview shows it) and later to production (by the approval-gated
 * "Apply content to production" workflow). See docs/ai-workflow.md.
 *
 * Applying is idempotent: parks are keyed by slug (insert if new, update if
 * not), list fields REPLACE the park's whole list, and photos are keyed by
 * storage path. Applying the same changeset twice is a no-op.
 *
 * This module is pure (no I/O) so it can be unit-tested and run in CI.
 */

import { COUNTIES } from "../../src/lib/counties";
import {
  amenityType,
  helmetsPolicy,
  linkType,
  obstacleType,
  parkStatus,
  parkType,
  ridingSurface,
} from "../../src/db/schema";

export interface PhotoAdd {
  /** Storage path without size suffix, e.g. "parks/fdr/i12-01". */
  path: string;
  alt_text: string;
  credit?: string | null;
  caption?: string | null;
}

export interface ParkChange {
  slug: string;
  /** `parks` columns, snake_case. Omitted keys are left unchanged. */
  fields?: Record<string, unknown>;
  /** Replaces the park's full list when present. */
  obstacles?: string[];
  riding_surfaces?: string[];
  amenities?: Array<{ type: string; present: boolean; notes?: string | null }>;
  /** Order = display order. */
  links?: Array<{ type: string; url: string; label?: string | null }>;
  /** Appended to the gallery (or updated in place if the path already exists). */
  photos_add?: PhotoAdd[];
}

export interface Changeset {
  /** GitHub issue this came from. */
  issue?: number;
  summary: string;
  parks: ParkChange[];
}

type FieldKind = "text" | "int" | "float" | "bool" | "date" | "enum";
interface FieldSpec {
  kind: FieldKind;
  nullable: boolean;
  /** Postgres type to cast to (enums) — used by the applier. */
  pgType?: string;
  values?: readonly string[];
}

const text = (nullable = true): FieldSpec => ({ kind: "text", nullable });
const enumOf = (pgType: string, values: readonly string[], nullable: boolean): FieldSpec => ({
  kind: "enum",
  nullable,
  pgType,
  values,
});

/**
 * Editable `parks` columns. Deliberately excluded: id, slug (the key),
 * wp_post_id, created_at, updated_at, last_revalidated_at, status_changed_at
 * (set automatically when status changes).
 */
export const PARK_FIELDS: Record<string, FieldSpec> = {
  name: text(false),
  status: enumOf("park_status", parkStatus.enumValues, false),
  city: text(false),
  state: text(false),
  established_year: { kind: "int", nullable: true },
  park_type: enumOf("park_type", parkType.enumValues, true),
  square_footage: { kind: "int", nullable: true },
  county: text(),
  street_address: text(),
  zip: text(),
  alias: text(),
  lat: { kind: "float", nullable: true },
  lng: { kind: "float", nullable: true },
  hours: text(),
  description: text(),
  hero_photo_path: text(),
  allows_skateboards: { kind: "bool", nullable: false },
  allows_bikes: { kind: "bool", nullable: false },
  allows_roller_skates: { kind: "bool", nullable: false },
  allows_scooters: { kind: "bool", nullable: false },
  vehicle_rules_notes: text(),
  helmets: enumOf("helmets_policy", helmetsPolicy.enumValues, true),
  other_pads_required: { kind: "bool", nullable: true },
  fee: { kind: "bool", nullable: true },
  programming: { kind: "bool", nullable: true },
  riding_surface_notes: text(),
  riding_surface_photo_path: text(),
  reopen_expected_at: { kind: "date", nullable: true },
};

/** Columns a brand-new park must provide (NOT NULL without a default). */
export const REQUIRED_FOR_NEW_PARK = ["name", "city"] as const;

export const PHOTO_WIDTHS = [400, 800, 1200] as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHOTO_PATH_RE = /^parks\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Generous Pennsylvania bounding box — catches swapped lat/lng and typos.
const PA_LAT: [number, number] = [39.6, 42.4];
const PA_LNG: [number, number] = [-80.6, -74.6];

const COUNTY_NAMES: ReadonlySet<string> = new Set(COUNTIES.map((c) => c.displayName));

export type ValidationResult = { ok: true; changeset: Changeset } | { ok: false; errors: string[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkField(key: string, value: unknown, spec: FieldSpec, where: string): string | null {
  if (value === null) return spec.nullable ? null : `${where}.${key} cannot be null`;
  switch (spec.kind) {
    case "text":
      return typeof value === "string" ? null : `${where}.${key} must be a string`;
    case "int":
      return Number.isInteger(value) ? null : `${where}.${key} must be an integer`;
    case "float":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `${where}.${key} must be a number`;
    case "bool":
      return typeof value === "boolean" ? null : `${where}.${key} must be true or false`;
    case "date":
      return typeof value === "string" && DATE_RE.test(value)
        ? null
        : `${where}.${key} must be a YYYY-MM-DD date`;
    case "enum":
      return typeof value === "string" && spec.values!.includes(value)
        ? null
        : `${where}.${key} must be one of: ${spec.values!.join(", ")}`;
  }
}

function checkPhotoPath(path: unknown, slug: string, where: string, errors: string[]): void {
  if (typeof path !== "string") {
    errors.push(`${where} must be a string`);
    return;
  }
  const m = PHOTO_PATH_RE.exec(path);
  if (!m) {
    errors.push(`${where} "${path}" must look like parks/<slug>/<name> (no size or extension)`);
  } else if (m[1] !== slug) {
    errors.push(`${where} "${path}" must be under parks/${slug}/`);
  }
}

function checkEnumList(
  list: unknown,
  values: readonly string[],
  where: string,
  errors: string[],
): void {
  if (!Array.isArray(list)) {
    errors.push(`${where} must be an array`);
    return;
  }
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== "string" || !values.includes(v)) {
      errors.push(`${where}: "${String(v)}" is not one of: ${values.join(", ")}`);
    } else if (seen.has(v)) {
      errors.push(`${where}: "${v}" is listed twice`);
    }
    seen.add(String(v));
  }
}

function validatePark(p: unknown, i: number, errors: string[]): void {
  const where = `parks[${i}]`;
  if (!isObject(p)) {
    errors.push(`${where} must be an object`);
    return;
  }
  const allowed = new Set([
    "slug",
    "fields",
    "obstacles",
    "riding_surfaces",
    "amenities",
    "links",
    "photos_add",
  ]);
  for (const k of Object.keys(p)) if (!allowed.has(k)) errors.push(`${where}: unknown key "${k}"`);

  const slug = p.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    errors.push(`${where}.slug must be lowercase words joined by hyphens, e.g. "fdr"`);
    return;
  }
  const w = `parks["${slug}"]`;

  if (p.fields !== undefined) {
    if (!isObject(p.fields)) {
      errors.push(`${w}.fields must be an object`);
    } else {
      for (const [k, v] of Object.entries(p.fields)) {
        const spec = PARK_FIELDS[k];
        if (!spec) {
          errors.push(`${w}.fields: "${k}" is not an editable park field`);
          continue;
        }
        const err = checkField(k, v, spec, `${w}.fields`);
        if (err) errors.push(err);
      }
      const f = p.fields;
      if (typeof f.county === "string" && !COUNTY_NAMES.has(f.county)) {
        errors.push(
          `${w}.fields.county "${f.county}" is not in src/lib/counties.ts — add it there (display name, e.g. "Bucks") or fix the spelling`,
        );
      }
      if (typeof f.lat === "number" && (f.lat < PA_LAT[0] || f.lat > PA_LAT[1])) {
        errors.push(`${w}.fields.lat ${f.lat} is outside Pennsylvania (lat/lng swapped?)`);
      }
      if (typeof f.lng === "number" && (f.lng < PA_LNG[0] || f.lng > PA_LNG[1])) {
        errors.push(`${w}.fields.lng ${f.lng} is outside Pennsylvania (should be negative)`);
      }
      for (const k of ["hero_photo_path", "riding_surface_photo_path"] as const) {
        if (typeof f[k] === "string") checkPhotoPath(f[k], slug, `${w}.fields.${k}`, errors);
      }
    }
  }

  if (p.obstacles !== undefined) {
    checkEnumList(p.obstacles, obstacleType.enumValues, `${w}.obstacles`, errors);
  }
  if (p.riding_surfaces !== undefined) {
    checkEnumList(p.riding_surfaces, ridingSurface.enumValues, `${w}.riding_surfaces`, errors);
  }

  if (p.amenities !== undefined) {
    if (!Array.isArray(p.amenities)) {
      errors.push(`${w}.amenities must be an array`);
    } else {
      checkEnumList(
        p.amenities.map((a) => (isObject(a) ? a.type : undefined)),
        amenityType.enumValues,
        `${w}.amenities[].type`,
        errors,
      );
      p.amenities.forEach((a, j) => {
        if (!isObject(a)) return;
        if (typeof a.present !== "boolean") {
          errors.push(`${w}.amenities[${j}].present must be true or false`);
        }
        if (a.notes !== undefined && a.notes !== null && typeof a.notes !== "string") {
          errors.push(`${w}.amenities[${j}].notes must be a string or null`);
        }
      });
    }
  }

  if (p.links !== undefined) {
    if (!Array.isArray(p.links)) {
      errors.push(`${w}.links must be an array`);
    } else {
      p.links.forEach((l, j) => {
        const lw = `${w}.links[${j}]`;
        if (!isObject(l)) {
          errors.push(`${lw} must be an object`);
          return;
        }
        if (typeof l.type !== "string" || !linkType.enumValues.includes(l.type as never)) {
          errors.push(`${lw}.type must be one of: ${linkType.enumValues.join(", ")}`);
        }
        if (typeof l.url !== "string" || !/^https?:\/\/\S+$/.test(l.url)) {
          errors.push(`${lw}.url must be an http(s) URL`);
        }
        if (l.label !== undefined && l.label !== null && typeof l.label !== "string") {
          errors.push(`${lw}.label must be a string or null`);
        }
      });
    }
  }

  if (p.photos_add !== undefined) {
    if (!Array.isArray(p.photos_add)) {
      errors.push(`${w}.photos_add must be an array`);
    } else {
      const seen = new Set<string>();
      p.photos_add.forEach((ph, j) => {
        const pw = `${w}.photos_add[${j}]`;
        if (!isObject(ph)) {
          errors.push(`${pw} must be an object`);
          return;
        }
        checkPhotoPath(ph.path, slug, `${pw}.path`, errors);
        if (typeof ph.path === "string") {
          if (seen.has(ph.path)) errors.push(`${pw}.path "${ph.path}" is listed twice`);
          seen.add(ph.path);
        }
        if (typeof ph.alt_text !== "string" || ph.alt_text.trim().length < 10) {
          errors.push(`${pw}.alt_text is required (describe the photo for screen readers)`);
        }
        for (const k of ["credit", "caption"] as const) {
          if (ph[k] !== undefined && ph[k] !== null && typeof ph[k] !== "string") {
            errors.push(`${pw}.${k} must be a string or null`);
          }
        }
      });
    }
  }
}

export function validateChangeset(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ["changeset must be a JSON object"] };

  for (const k of Object.keys(input)) {
    if (!["$schema", "issue", "summary", "parks"].includes(k)) {
      errors.push(`unknown top-level key "${k}"`);
    }
  }
  if (input.issue !== undefined && !Number.isInteger(input.issue)) {
    errors.push("issue must be an issue number");
  }
  if (typeof input.summary !== "string" || input.summary.trim() === "") {
    errors.push("summary is required");
  }
  if (!Array.isArray(input.parks) || input.parks.length === 0) {
    errors.push("parks must be a non-empty array");
  } else {
    const slugs = new Set<string>();
    input.parks.forEach((p, i) => {
      validatePark(p, i, errors);
      if (isObject(p) && typeof p.slug === "string") {
        if (slugs.has(p.slug)) errors.push(`park "${p.slug}" appears twice — merge the entries`);
        slugs.add(p.slug);
      }
    });
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, changeset: input as unknown as Changeset };
}

/** Every photo storage path a changeset references (gallery + hero/surface). */
export function referencedPhotoPaths(cs: Changeset): string[] {
  const paths = new Set<string>();
  for (const p of cs.parks) {
    for (const ph of p.photos_add ?? []) paths.add(ph.path);
    for (const k of ["hero_photo_path", "riding_surface_photo_path"]) {
      const v = p.fields?.[k];
      if (typeof v === "string") paths.add(v);
    }
  }
  return [...paths];
}
