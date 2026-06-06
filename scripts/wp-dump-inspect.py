#!/usr/bin/env python3
"""
Phase 5 inspection helper — answers the questions we need to know
BEFORE writing the migration parser:

  1. How many published parks / builders / shops?
  2. What meta_keys does a real park have? (ACF field name discovery)
  3. What custom taxonomies exist + their term counts?
  4. How does wp_wpgmza (lat/lng) link to wp_posts (the park)?
  5. Where do photos live (wp_postmeta -> attachment ID -> uploads path)?

Disposable. Replaced by the real migration script once we know the shape.
"""

from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

DUMP = Path(__file__).resolve().parent.parent / "data" / "wp-export" / "mysql.sql"


# A mysqldump VALUES line looks like:
#   INSERT INTO `wp_posts` VALUES (1,1,'2024-...,'...',...),(2,...),(3,...);
# We need to tokenize one tuple at a time, respecting single-quoted strings
# (which can contain commas, parens, and escaped backslashes).
def iter_rows(text: str):
    """Yield each tuple as a list of raw column values (strings/None/numbers as-is text)."""
    i = 0
    n = len(text)
    while i < n:
        # Skip whitespace
        while i < n and text[i] in " \t\r\n,;":
            i += 1
        if i >= n:
            return
        if text[i] != "(":
            # End of VALUES block
            return
        i += 1  # skip '('
        cols: list[str | None] = []
        while True:
            # Read one column
            if text[i] == "'":
                # Quoted string
                i += 1
                start = i
                buf = []
                while i < n:
                    c = text[i]
                    if c == "\\" and i + 1 < n:
                        buf.append(text[i + 1])
                        i += 2
                        continue
                    if c == "'":
                        break
                    buf.append(c)
                    i += 1
                cols.append("".join(buf))
                i += 1  # skip closing '
            else:
                # Unquoted: NULL or number
                start = i
                while i < n and text[i] not in ",)":
                    i += 1
                raw = text[start:i].strip()
                cols.append(None if raw == "NULL" else raw)
            if text[i] == ",":
                i += 1
                continue
            if text[i] == ")":
                i += 1
                yield cols
                break


def extract_table_values(text: str, table: str) -> str:
    """Return the concatenated VALUES blob across all INSERT statements for one table."""
    needle = f"INSERT INTO `{table}` VALUES "
    chunks = []
    pos = 0
    while True:
        idx = text.find(needle, pos)
        if idx == -1:
            break
        idx += len(needle)
        # Find the end of this INSERT (the terminating semicolon at end of line)
        end = text.find(";\n", idx)
        if end == -1:
            end = len(text)
        chunks.append(text[idx:end])
        pos = end
    return "\n".join(chunks)


def main() -> None:
    text = DUMP.read_text(encoding="utf-8", errors="replace")
    print(f"# WP dump inspection — {DUMP.name} ({len(text)/1024:.0f} KB)")
    print()

    # --- wp_posts -----------------------------------------------------------
    posts_blob = extract_table_values(text, "wp_posts")
    # wp_posts column order (from CREATE TABLE):
    #  0 ID, 1 post_author, 2 post_date, 3 post_date_gmt, 4 post_content,
    #  5 post_title, 6 post_excerpt, 7 post_status, 8 comment_status,
    #  9 ping_status, 10 post_password, 11 post_name (slug), 12 to_ping,
    # 13 pinged, 14 post_modified, 15 post_modified_gmt, 16 post_content_filtered,
    # 17 post_parent, 18 guid, 19 menu_order, 20 post_type, 21 post_mime_type,
    # 22 comment_count
    by_type_status: Counter[tuple[str, str]] = Counter()
    posts_by_id: dict[str, dict] = {}
    for row in iter_rows(posts_blob):
        if len(row) < 23:
            continue
        post_id = row[0] or ""
        post_type = row[20] or ""
        post_status = row[7] or ""
        by_type_status[(post_type, post_status)] += 1
        if post_type in ("park", "builder", "shop") and post_status == "publish":
            posts_by_id[post_id] = {
                "id": post_id,
                "title": row[5],
                "slug": row[11],
                "type": post_type,
                "status": post_status,
                "content": (row[4] or "")[:200],
            }

    print("## wp_posts — counts by (post_type, post_status)")
    for (pt, ps), c in sorted(by_type_status.items(), key=lambda x: -x[1])[:15]:
        print(f"  {c:5d}  {pt:30s}  {ps}")
    print()

    # --- Sample parks --------------------------------------------------------
    park_ids = [pid for pid, p in posts_by_id.items() if p["type"] == "park"]
    builder_ids = [pid for pid, p in posts_by_id.items() if p["type"] == "builder"]
    shop_ids = [pid for pid, p in posts_by_id.items() if p["type"] == "shop"]

    print(f"## Published counts: {len(park_ids)} parks, {len(builder_ids)} builders, {len(shop_ids)} shops")
    print()

    # Pick FDR (or first park) as our reference
    fdr_id = None
    for pid in park_ids:
        if "fdr" in (posts_by_id[pid]["slug"] or "").lower():
            fdr_id = pid
            break
    if not fdr_id and park_ids:
        fdr_id = park_ids[0]

    if fdr_id:
        p = posts_by_id[fdr_id]
        print(f"## Reference park: id={p['id']}  slug={p['slug']!r}  title={p['title']!r}")
        print(f"   content (first 200 chars): {p['content']!r}")
        print()

    # --- wp_postmeta ---------------------------------------------------------
    # cols: meta_id, post_id, meta_key, meta_value
    meta_blob = extract_table_values(text, "wp_postmeta")
    park_meta_keys: Counter[str] = Counter()
    fdr_meta: list[tuple[str, str]] = []
    photo_meta_keys: Counter[str] = Counter()
    park_id_set = set(park_ids)
    for row in iter_rows(meta_blob):
        if len(row) < 4:
            continue
        post_id, meta_key, meta_value = row[1], row[2] or "", row[3] or ""
        if post_id in park_id_set:
            park_meta_keys[meta_key] += 1
        if post_id == fdr_id:
            fdr_meta.append((meta_key, meta_value[:120]))
        # Photo / attachment hints
        if "wp-attached-file" in meta_key or "thumbnail_id" in meta_key or "photos" in meta_key.lower() or "image" in meta_key.lower() or "gallery" in meta_key.lower():
            photo_meta_keys[meta_key] += 1

    print(f"## Top meta_keys appearing on park posts ({len(park_meta_keys)} distinct):")
    for key, c in park_meta_keys.most_common(40):
        print(f"  {c:4d}  {key}")
    print()

    if fdr_id:
        print(f"## Full meta for reference park (id={fdr_id}):")
        for k, v in fdr_meta:
            print(f"  {k:35s}  {v!r}")
        print()

    print("## Photo / attachment-shaped meta_keys (anywhere):")
    for key, c in photo_meta_keys.most_common(20):
        print(f"  {c:5d}  {key}")
    print()

    # --- Taxonomies ----------------------------------------------------------
    # wp_term_taxonomy cols: term_taxonomy_id, term_id, taxonomy, description, parent, count
    tt_blob = extract_table_values(text, "wp_term_taxonomy")
    taxonomies: Counter[str] = Counter()
    tt_by_id: dict[str, tuple[str, str]] = {}  # term_taxonomy_id -> (taxonomy, term_id)
    for row in iter_rows(tt_blob):
        if len(row) < 3:
            continue
        ttid, term_id, taxonomy = row[0] or "", row[1] or "", row[2] or ""
        taxonomies[taxonomy] += 1
        tt_by_id[ttid] = (taxonomy, term_id)

    print("## wp_term_taxonomy — registered taxonomies + term counts:")
    for tax, c in sorted(taxonomies.items(), key=lambda x: -x[1]):
        print(f"  {c:4d}  {tax}")
    print()

    # --- Terms ---------------------------------------------------------------
    # wp_terms cols: term_id, name, slug, term_group
    terms_blob = extract_table_values(text, "wp_terms")
    terms_by_id: dict[str, tuple[str, str]] = {}  # term_id -> (name, slug)
    for row in iter_rows(terms_blob):
        if len(row) < 3:
            continue
        terms_by_id[row[0] or ""] = (row[1] or "", row[2] or "")

    # Show all obstacle terms
    print("## park_obstacles terms (the 38 we expect):")
    obstacles: list[tuple[str, str]] = []
    for ttid, (tax, tid) in tt_by_id.items():
        if tax == "park_obstacles" and tid in terms_by_id:
            obstacles.append(terms_by_id[tid])
    for name, slug in sorted(obstacles, key=lambda x: x[1]):
        print(f"  {slug:35s}  {name}")
    print(f"  → total: {len(obstacles)}")
    print()

    # Counties
    print("## regions_and_counties terms:")
    counties: list[tuple[str, str]] = []
    for ttid, (tax, tid) in tt_by_id.items():
        if tax == "regions_and_counties" and tid in terms_by_id:
            counties.append(terms_by_id[tid])
    for name, slug in sorted(counties, key=lambda x: x[1]):
        print(f"  {slug:35s}  {name}")
    print(f"  → total: {len(counties)}")
    print()

    # --- wp_wpgmza (lat/lng) -------------------------------------------------
    gmza_blob = extract_table_values(text, "wp_wpgmza")
    print("## wp_wpgmza — first 5 markers (lat/lng):")
    count = 0
    # Schema from earlier inspection:
    # 0 id, 1 map_id, 2 address, 3 description, 4 pic, 5 link, 6 icon,
    # 7 lat, 8 lng, 9 anim, 10 title, 11 infoopen, 12 category, 13 approved,
    # 14 retina, 15 type, 16 did, 17 sticky, 18 other_data, 19 latlng,
    # 20 layergroup
    gmza_rows: list[dict] = []
    for row in iter_rows(gmza_blob):
        if len(row) < 11:
            continue
        gmza_rows.append({
            "id": row[0], "title": row[10], "address": row[2],
            "lat": row[7], "lng": row[8], "link": row[5][:60],
        })
    print(f"  → total markers: {len(gmza_rows)}")
    for g in gmza_rows[:5]:
        print(f"  id={g['id']}  lat={g['lat']!r:18s} lng={g['lng']!r:18s} title={g['title']!r}")
    print()

    # Try to correlate gmza title to a park title (case-insensitive substring)
    print("## How do wpgmza markers link to wp_posts parks?")
    park_titles = {pid: (posts_by_id[pid]["title"] or "").lower() for pid in park_ids}
    title_matched = 0
    address_matched = 0
    for g in gmza_rows:
        gt = (g["title"] or "").lower().strip()
        if not gt:
            continue
        for pid, pt in park_titles.items():
            if pt and (gt in pt or pt in gt):
                title_matched += 1
                break
        else:
            continue
    print(f"  markers matched to a park by title substring: {title_matched} / {len(gmza_rows)}")
    print()


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        pass
