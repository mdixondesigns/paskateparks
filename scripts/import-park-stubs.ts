// Phase 10 prep — import stub parks from data/imports/park-stubs.csv.
//
// Usage:
//   pnpm tsx scripts/import-park-stubs.ts             ← dry-run preview
//   pnpm tsx scripts/import-park-stubs.ts --apply     ← insert into DB
//   pnpm tsx scripts/import-park-stubs.ts --csv path  ← custom path
//
// What it does:
//   1. Parse the CSV (tolerates "Park name" or "name" header from Google Sheets)
//   2. Validate each row (name + city required)
//   3. Derive slug from name if blank
//   4. Normalize status (lowercase to match enum)
//   5. Skip rows whose slug already exists in DB (idempotent on re-run)
//   6. Detect counties not in src/lib/counties.ts and auto-extend the file
//      before insert — otherwise assertCountiesInData would fail the next build
//   7. INSERT only — never updates existing rows. Edit those in Studio.
//
// CSV columns accepted (order doesn't matter beyond required fields):
//   name (or "Park name"), city, county, lat, lng, alias, slug,
//   street_address, zip, park_type, established_year, status, description

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

loadDotenv({ path: ".env.local" });

// ─── Tiny CSV parser ───────────────────────────────────────────────────────
// Handles double-quoted fields with embedded commas and "" escape for a
// literal quote inside a quoted field. Good enough for this CSV shape;
// reach for papaparse if we ever need RFC-4180-strict.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++; // CRLF
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
}

// ─── Schema-aware column normalizer ────────────────────────────────────────
const COLUMN_ALIASES: Record<string, string> = {
  "park name": "name",
  name: "name",
  city: "city",
  county: "county",
  lat: "lat",
  lng: "lng",
  alias: "alias",
  slug: "slug",
  street_address: "street_address",
  zip: "zip",
  park_type: "park_type",
  established_year: "established_year",
  status: "status",
  description: "description",
};

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const VALID_STATUSES = new Set(["open", "temporarily_closed", "permanently_closed"]);
const VALID_PARK_TYPES = new Set(["concrete_park", "diy_park", "indoor_park", "prefab_park"]);

interface ParsedRow {
  rowNum: number;
  name: string;
  slug: string;
  city: string;
  county: string | null;
  lat: number | null;
  lng: number | null;
  alias: string | null;
  street_address: string | null;
  zip: string | null;
  park_type: string | null;
  established_year: number | null;
  status: string;
  description: string | null;
}

interface ParseProblem {
  rowNum: number;
  name: string;
  reason: string;
}

function parseRows(rows: string[][]): { good: ParsedRow[]; problems: ParseProblem[] } {
  const headerRow = rows[0];
  if (!headerRow) throw new Error("CSV has no header row");

  // Map column index → canonical field name
  const idx: Partial<Record<string, number>> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const key = (headerRow[i] ?? "").trim().toLowerCase();
    const canonical = COLUMN_ALIASES[key];
    if (canonical) idx[canonical] = i;
  }

  if (idx.name === undefined) throw new Error("CSV missing required column 'name' (or 'Park name')");
  if (idx.city === undefined) throw new Error("CSV missing required column 'city'");

  const good: ParsedRow[] = [];
  const problems: ParseProblem[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNum = r + 1; // 1-indexed including header for human readability
    const get = (k: string) => {
      const i = idx[k];
      return i === undefined ? "" : (row[i] ?? "").trim();
    };
    const name = get("name");
    if (!name) continue; // blank rows
    const city = get("city");
    if (!city) {
      problems.push({ rowNum, name, reason: "city is required" });
      continue;
    }
    const providedSlug = get("slug");
    const slug = providedSlug || deriveSlug(name);
    if (!slug) {
      problems.push({ rowNum, name, reason: "could not derive a slug (name produced empty kebab-case)" });
      continue;
    }
    // Normalize "Permanently Closed" → "permanently_closed" so the Google
    // Sheets human-readable status column maps to the enum.
    const rawStatus = (get("status").toLowerCase().replace(/\s+/g, "_")) || "open";
    if (!VALID_STATUSES.has(rawStatus)) {
      problems.push({ rowNum, name, reason: `invalid status '${rawStatus}' (allowed: ${[...VALID_STATUSES].join(", ")})` });
      continue;
    }
    const rawParkType = get("park_type").toLowerCase();
    if (rawParkType && !VALID_PARK_TYPES.has(rawParkType)) {
      problems.push({ rowNum, name, reason: `invalid park_type '${rawParkType}' (allowed: ${[...VALID_PARK_TYPES].join(", ")})` });
      continue;
    }
    const latStr = get("lat");
    const lngStr = get("lng");
    let lat: number | null = null;
    let lng: number | null = null;
    if (latStr || lngStr) {
      lat = Number(latStr);
      lng = Number(lngStr);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        problems.push({ rowNum, name, reason: `lat '${latStr}' is not a finite number in [-90, 90]` });
        continue;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        problems.push({ rowNum, name, reason: `lng '${lngStr}' is not a finite number in [-180, 180]` });
        continue;
      }
    }
    const yearStr = get("established_year");
    let establishedYear: number | null = null;
    if (yearStr) {
      establishedYear = Number(yearStr);
      if (!Number.isInteger(establishedYear) || establishedYear < 1900 || establishedYear > 2100) {
        problems.push({ rowNum, name, reason: `established_year '${yearStr}' is not a 4-digit year` });
        continue;
      }
    }

    good.push({
      rowNum,
      name,
      slug,
      city,
      county: get("county") || null,
      lat,
      lng,
      alias: get("alias") || null,
      street_address: get("street_address") || null,
      zip: get("zip") || null,
      park_type: rawParkType || null,
      established_year: establishedYear,
      status: rawStatus,
      description: get("description") || null,
    });
  }

  return { good, problems };
}

// ─── counties.ts auto-extension ────────────────────────────────────────────

function readKnownCounties(): Set<string> {
  const src = readFileSync("src/lib/counties.ts", "utf8");
  const set = new Set<string>();
  for (const m of src.matchAll(/displayName:\s*"([^"]+)"/g)) {
    set.add(m[1]!);
  }
  return set;
}

function deriveCountySlug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extendCountiesFile(newCounties: string[]): void {
  const path = "src/lib/counties.ts";
  let src = readFileSync(path, "utf8");
  const insertion = newCounties
    .map((name) => `  { slug: "${deriveCountySlug(name)}", displayName: "${name}" },`)
    .join("\n");
  // Insert before the closing "] as const satisfies readonly County[];"
  const marker = "] as const satisfies readonly County[];";
  if (!src.includes(marker)) {
    throw new Error("Could not find COUNTIES array terminator in src/lib/counties.ts");
  }
  src = src.replace(marker, `${insertion}\n${marker}`);
  writeFileSync(path, src, "utf8");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const csvArgIdx = args.indexOf("--csv");
  const csvPath = csvArgIdx >= 0 ? args[csvArgIdx + 1]! : "data/imports/park-stubs.csv";

  if (!existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(2);
  }

  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  console.log(`CSV: ${csvPath}  (${rows.length - 1} data rows)`);

  const { good, problems } = parseRows(rows);
  if (problems.length > 0) {
    console.log(`\nVALIDATION PROBLEMS (${problems.length}) — these rows will be SKIPPED:`);
    for (const p of problems) console.log(`  row ${p.rowNum} "${p.name}": ${p.reason}`);
  }
  console.log(`\nValid rows: ${good.length}`);

  // Match against DB. We try two keys:
  //   1. slug (the canonical id) — direct hit
  //   2. (name, city) normalized — catches the case where the user provided
  //      an explicit slug this round but the row was previously imported
  //      with an auto-derived slug. Without this, slug changes become dupes.
  const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
  try {
    interface DbRow {
      id: number;
      slug: string;
      name: string;
      status: string;
      city: string;
      county: string | null;
      alias: string | null;
      lat: number | null;
      lng: number | null;
      street_address: string | null;
      zip: string | null;
      park_type: string | null;
      established_year: number | null;
      description: string | null;
    }
    const existing = await sql<DbRow[]>`
      SELECT id, slug, name, status, city, county, alias, lat, lng,
             street_address, zip, park_type::text AS park_type,
             established_year, description
      FROM parks
    `;
    const bySlug = new Map(existing.map((r) => [r.slug, r] as const));
    // Loose match — strip leading "the", parenthetical alt names, and
    // common suffixes so "The Roxborough Courts" matches "Roxborough Courts"
    // and "Clearfield (Greentop) Skatepark" matches "Clearfield Skatepark".
    const matchKey = (name: string, city: string) => {
      const n = name
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/^the\s+/i, "")
        // Expand "St." (with period) to "street" so "Wharton St. Warehouse"
        // matches "Wharton Street Warehouse". Bare "St" stays as-is — could
        // be Saint or Street, and the period disambiguates.
        .replace(/\bst\./g, "street")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(skatepark|skate\s*park|skate|park|memorial|community|borough|township|crescent)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return `${n}|${city.toLowerCase().trim()}`;
    };
    const byNameCity = new Map(existing.map((r) => [matchKey(r.name, r.city), r] as const));

    interface UpdatePlan {
      row: ParsedRow;
      dbRow: DbRow;
      changes: Record<string, [unknown, unknown]>; // field → [from, to]
    }
    const toInsert: ParsedRow[] = [];
    const toUpdate: UpdatePlan[] = [];
    const noChange: ParsedRow[] = [];
    const matchedDbIds = new Set<number>();

    for (const r of good) {
      let dbRow = bySlug.get(r.slug);
      if (!dbRow) dbRow = byNameCity.get(matchKey(r.name, r.city));

      if (!dbRow) {
        toInsert.push(r);
        continue;
      }
      matchedDbIds.add(dbRow.id);

      // Compute patch: only overwrite when the CSV value is non-empty AND
      // differs from the DB. Empty CSV values never clobber Studio edits.
      const changes: Record<string, [unknown, unknown]> = {};
      const pairs: Array<[string, unknown, unknown]> = [
        ["slug", r.slug, dbRow.slug],
        ["name", r.name, dbRow.name],
        ["status", r.status, dbRow.status],
        ["city", r.city, dbRow.city],
        ["county", r.county, dbRow.county],
        ["alias", r.alias, dbRow.alias],
        ["lat", r.lat, dbRow.lat],
        ["lng", r.lng, dbRow.lng],
        ["street_address", r.street_address, dbRow.street_address],
        ["zip", r.zip, dbRow.zip],
        ["park_type", r.park_type, dbRow.park_type],
        ["established_year", r.established_year, dbRow.established_year],
        ["description", r.description, dbRow.description],
      ];
      for (const [field, csvVal, dbVal] of pairs) {
        if (csvVal === null || csvVal === "") continue; // never overwrite with blank
        if (csvVal !== dbVal) changes[field] = [dbVal, csvVal];
      }
      if (Object.keys(changes).length === 0) noChange.push(r);
      else toUpdate.push({ row: r, dbRow, changes });
    }

    const leftovers = existing.filter((r) => !matchedDbIds.has(r.id));

    console.log(`No-op (already matches CSV): ${noChange.length}`);
    console.log(`Will UPDATE:                 ${toUpdate.length}`);
    console.log(`Will INSERT:                 ${toInsert.length}`);
    console.log(`DB rows not in CSV:          ${leftovers.length}  (left alone — review manually if needed)`);

    // Detect new counties from BOTH inserts and updates that change county.
    const knownCounties = readKnownCounties();
    const newCountyNames = new Set<string>();
    for (const r of toInsert) {
      if (r.county && !knownCounties.has(r.county)) newCountyNames.add(r.county);
    }
    for (const u of toUpdate) {
      if (u.row.county && !knownCounties.has(u.row.county)) newCountyNames.add(u.row.county);
    }
    if (newCountyNames.size > 0) {
      console.log(`\nNEW COUNTIES to add to src/lib/counties.ts (${newCountyNames.size}):`);
      for (const c of [...newCountyNames].sort()) {
        console.log(`  ${c} → slug "${deriveCountySlug(c)}"`);
      }
    }

    if (toUpdate.length > 0) {
      console.log(`\nUPDATE preview (first 10):`);
      for (const u of toUpdate.slice(0, 10)) {
        const fields = Object.keys(u.changes);
        console.log(`  ${u.dbRow.slug.padEnd(40)} ${fields.join(", ")}`);
        // Surface slug renames + status changes explicitly — they're the most
        // impactful and the easiest to mis-apply.
        if (u.changes.slug) console.log(`      slug: "${u.dbRow.slug}" → "${u.row.slug}"`);
        if (u.changes.name) console.log(`      name: "${u.dbRow.name}" → "${u.row.name}"`);
        if (u.changes.status) console.log(`      status: ${u.dbRow.status} → ${u.row.status}`);
      }
      if (toUpdate.length > 10) console.log(`  …and ${toUpdate.length - 10} more`);
    }

    if (toInsert.length > 0) {
      console.log(`\nINSERT preview (first 5):`);
      for (const p of toInsert.slice(0, 5)) {
        const coords = p.lat !== null ? `${p.lat.toFixed(4)},${p.lng!.toFixed(4)}` : "(no coords)";
        console.log(`  ${p.slug.padEnd(40)} "${p.name}" — ${p.city}  ${coords}`);
      }
      if (toInsert.length > 5) console.log(`  …and ${toInsert.length - 5} more`);
    }

    // Rename heuristic — only flag when there is EXACTLY one leftover in a
    // city AND exactly one INSERT in that city. Anything looser (any leftover
    // sharing a city with any INSERT) falsely flags every park in big cities
    // like Philadelphia as a "rename" of the one new insert there.
    const leftoverCityCount = new Map<string, number>();
    const insertCityCount = new Map<string, number>();
    for (const l of leftovers) leftoverCityCount.set(l.city.toLowerCase(), (leftoverCityCount.get(l.city.toLowerCase()) ?? 0) + 1);
    for (const r of toInsert) insertCityCount.set(r.city.toLowerCase(), (insertCityCount.get(r.city.toLowerCase()) ?? 0) + 1);

    const renameCandidates = leftovers.filter((l) => {
      const c = l.city.toLowerCase();
      return leftoverCityCount.get(c) === 1 && insertCityCount.get(c) === 1;
    });

    if (renameCandidates.length > 0) {
      console.log(`\nLIKELY RENAMES — DB stub is the only one in its city, and exactly one new INSERT shares that city:`);
      for (const old of renameCandidates) {
        const replacement = toInsert.find((r) => r.city.toLowerCase() === old.city.toLowerCase());
        console.log(`  ${old.slug.padEnd(40)} "${old.name}"  →  likely replaced by  "${replacement?.name}" (slug "${replacement?.slug}")`);
      }
      console.log(`  After --apply, delete these old slugs in Supabase Studio if confirmed.`);
    }
    const otherLeftovers = leftovers.length - renameCandidates.length;
    if (otherLeftovers > 0) {
      console.log(`\n(${otherLeftovers} other DB rows are not in this CSV — assumed to be parks the CSV doesn't manage; left unchanged.)`);
    }

    if (!apply) {
      console.log(`\nDRY RUN. Re-run with --apply to commit changes.`);
      return;
    }

    // Apply: extend counties.ts first, then UPDATE, then INSERT.
    if (newCountyNames.size > 0) {
      extendCountiesFile([...newCountyNames].sort());
      console.log(`\n✓ Extended src/lib/counties.ts with ${newCountyNames.size} new counties`);
    }

    let updatedCount = 0;
    for (const u of toUpdate) {
      const changes = u.changes;
      // Build a partial UPDATE — only the changed fields. Postgres tagged
      // template literals can't dynamically pick columns, so we do one
      // explicit UPDATE per row touching only the changed keys.
      // (99 rows; fine. If this scales we batch.)
      const r = u.row;
      await sql`
        UPDATE parks SET
          slug = ${changes.slug ? r.slug : u.dbRow.slug},
          name = ${changes.name ? r.name : u.dbRow.name},
          status = ${changes.status ? r.status : u.dbRow.status},
          city = ${changes.city ? r.city : u.dbRow.city},
          county = ${changes.county ? r.county : u.dbRow.county},
          alias = ${changes.alias ? r.alias : u.dbRow.alias},
          lat = ${changes.lat ? r.lat : u.dbRow.lat},
          lng = ${changes.lng ? r.lng : u.dbRow.lng},
          street_address = ${changes.street_address ? r.street_address : u.dbRow.street_address},
          zip = ${changes.zip ? r.zip : u.dbRow.zip},
          park_type = ${changes.park_type ? r.park_type : u.dbRow.park_type},
          established_year = ${changes.established_year ? r.established_year : u.dbRow.established_year},
          description = ${changes.description ? r.description : u.dbRow.description}
        WHERE id = ${u.dbRow.id}
      `;
      updatedCount++;
    }

    let insertedCount = 0;
    for (const r of toInsert) {
      await sql`
        INSERT INTO parks (
          slug, name, status, city, state, county, alias, lat, lng,
          street_address, zip, park_type, established_year, description
        ) VALUES (
          ${r.slug}, ${r.name}, ${r.status}, ${r.city}, 'PA', ${r.county},
          ${r.alias}, ${r.lat}, ${r.lng}, ${r.street_address}, ${r.zip},
          ${r.park_type}, ${r.established_year}, ${r.description}
        )
      `;
      insertedCount++;
    }
    console.log(`\n✓ Updated ${updatedCount} parks.`);
    console.log(`✓ Inserted ${insertedCount} parks.`);
    if (leftovers.length > 0) {
      console.log(`ℹ ${leftovers.length} DB rows are NOT in this CSV — left unchanged. Review and delete in Studio if any are renames the CSV replaced.`);
    }
    if (newCountyNames.size > 0) {
      console.log(`Run 'pnpm build' to verify assertCountiesInData passes against the extended counties.ts.`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
