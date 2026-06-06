import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { extractTableValues, iterRows, readDump } from "./dump-reader";

describe("iterRows — unit", () => {
  it("parses a single simple tuple", () => {
    const rows = [...iterRows("(1,2,3)")];
    expect(rows).toEqual([["1", "2", "3"]]);
  });

  it("parses multiple tuples separated by ),(", () => {
    const rows = [...iterRows("(1,'a'),(2,'b'),(3,'c')")];
    expect(rows).toEqual([
      ["1", "a"],
      ["2", "b"],
      ["3", "c"],
    ]);
  });

  it("returns null for SQL NULL", () => {
    expect([...iterRows("(1,NULL,'x')")]).toEqual([["1", null, "x"]]);
  });

  it("decodes backslash escapes in strings", () => {
    expect([...iterRows("(1,'O\\'Brien')")]).toEqual([["1", "O'Brien"]]);
    expect([...iterRows("(1,'line1\\nline2')")]).toEqual([["1", "line1\nline2"]]);
    expect([...iterRows("(1,'a\\\\b')")]).toEqual([["1", "a\\b"]]);
  });

  it("decodes every mysqldump escape we support", () => {
    // Single tuple exercising the full escape table (codex finding #4).
    // Source string is literally: \\ \' \" \n \r \t \b \0 \Z and one unknown \q
    const input = "(1,'\\\\ \\' \\\" \\n \\r \\t \\b \\0 \\Z \\q')";
    const [row] = [...iterRows(input)];
    expect(row).toEqual([
      "1",
      "\\ ' \" \n \r \t \b \0 \x1A q",
    ]);
  });

  it("throws on unterminated quoted string", () => {
    // Missing closing single quote — used to walk to EOF silently.
    expect(() => [...iterRows("(1,'never ends")]).toThrow(/unterminated/i);
  });

  it("throws on unexpected non-tuple text between values", () => {
    // After a clean (1,'a') tuple, stray text where the next '(' should be.
    expect(() => [...iterRows("(1,'a') unexpected garbage (2,'b')")]).toThrow(
      /expected '\('/,
    );
  });

  it("throws on malformed tuple body (missing , or ) after column)", () => {
    // Missing comma between two quoted cols — caught by the "unexpected
    // character" branch after the first close-quote. Pinned so regressions
    // are obvious. (Unquoted columns accept embedded whitespace by design —
    // mysqldump never emits whitespace there, but the parser is lenient.)
    expect(() => [...iterRows("('a' 'b')")]).toThrow(/unexpected character/);
  });

  it("handles a literal `'` adjacent escape sequence (codex challenge case)", () => {
    // Adversarial: a quoted string whose decoded content looks like SQL itself.
    // We must not be fooled into terminating early.
    const dangerous = "');INSERT INTO `wp_posts` VALUES (999,'malicious";
    const escaped = dangerous.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const sql = `(1,'${escaped}',2)`;
    const [row] = [...iterRows(sql)];
    expect(row).toEqual(["1", dangerous, "2"]);
  });

  it("preserves commas inside quoted strings", () => {
    expect([...iterRows("(1,'Philadelphia, PA',2)")]).toEqual([
      ["1", "Philadelphia, PA", "2"],
    ]);
  });

  it("preserves parens inside quoted strings", () => {
    expect([...iterRows("(1,'(test)(seed)')")]).toEqual([["1", "(test)(seed)"]]);
  });

  it("preserves PHP-serialized strings as opaque blobs", () => {
    const blob = "a:1:{i:0;s:3:\"256\";}";
    const escaped = blob.replace(/"/g, '\\"');
    const sql = `(1,'${escaped}')`;
    const [row] = [...iterRows(sql)];
    expect(row).toEqual(["1", blob]);
  });

  it("ignores trailing whitespace/semicolon", () => {
    expect([...iterRows("(1,'a'),(2,'b');\n  ")]).toEqual([
      ["1", "a"],
      ["2", "b"],
    ]);
  });
});

describe("extractTableValues — unit", () => {
  it("returns empty when table is absent", () => {
    expect(extractTableValues("CREATE TABLE foo;\n", "wp_posts")).toBe("");
  });

  it("concatenates VALUES blobs across multiple INSERT statements", () => {
    const dump =
      "INSERT INTO `wp_posts` VALUES (1,'a');\nGarbage in between.\nINSERT INTO `wp_posts` VALUES (2,'b');\n";
    const blob = extractTableValues(dump, "wp_posts");
    expect([...iterRows(blob)]).toEqual([
      ["1", "a"],
      ["2", "b"],
    ]);
  });

  it("does not match other tables with the same prefix", () => {
    const dump =
      "INSERT INTO `wp_postmeta` VALUES (1,1,'k','v');\nINSERT INTO `wp_posts` VALUES (1,'real');\n";
    const blob = extractTableValues(dump, "wp_posts");
    expect([...iterRows(blob)]).toEqual([["1", "real"]]);
  });

  it("handles CRLF line endings (Windows-encoded dumps)", () => {
    // Codex finding #1: `;\n` lookup used to silently collapse CRLF dumps
    // into one giant blob, then iterRows would explode at the wrong offset.
    const dump =
      "INSERT INTO `wp_posts` VALUES (1,'a');\r\n" +
      "INSERT INTO `wp_posts` VALUES (2,'b');\r\n";
    const blob = extractTableValues(dump, "wp_posts");
    expect([...iterRows(blob)]).toEqual([
      ["1", "a"],
      ["2", "b"],
    ]);
  });

  it("handles a CRLF dump with no trailing newline on the last INSERT", () => {
    // EOF immediately after `;` — historically a common mysqldump artifact.
    const dump = "INSERT INTO `wp_posts` VALUES (1,'tail');";
    const blob = extractTableValues(dump, "wp_posts");
    expect([...iterRows(blob)]).toEqual([["1", "tail"]]);
  });

  it("throws when an INSERT statement doesn't end with `;` at EOL", () => {
    // Codex finding #2: silent truncation is the worst kind of migration bug.
    // If the dump format ever drifts (missing semicolon, mid-line cut, etc.),
    // we want an error, not 47-of-48 rows.
    const dump = "INSERT INTO `wp_posts` VALUES (1,'oops')\n"; // missing ';'
    expect(() => extractTableValues(dump, "wp_posts")).toThrow(/did not end with ';'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests — run against the real WPEngine dump if it's present.
// Skipped automatically when data/wp-export/mysql.sql isn't checked out (CI).
// ─────────────────────────────────────────────────────────────────────────────
const DUMP_PATH = resolve(process.cwd(), "data/wp-export/mysql.sql");
const haveDump = existsSync(DUMP_PATH);

describe.skipIf(!haveDump)("WPEngine dump integration", () => {
  const text = haveDump ? readDump(DUMP_PATH) : "";

  it("finds exactly 48 published parks", () => {
    const blob = extractTableValues(text, "wp_posts");
    let count = 0;
    for (const row of iterRows(blob)) {
      // wp_posts col 7 = post_status, col 20 = post_type
      if (row[20] === "park" && row[7] === "publish") count++;
    }
    expect(count).toBe(48);
  });

  it("finds 14 published builders and 20 published shops", () => {
    const blob = extractTableValues(text, "wp_posts");
    let builders = 0;
    let shops = 0;
    for (const row of iterRows(blob)) {
      if (row[7] === "publish") {
        if (row[20] === "builder") builders++;
        if (row[20] === "shop") shops++;
      }
    }
    expect(builders).toBe(14);
    expect(shops).toBe(20);
  });

  it("finds 48 lat/lng markers in wp_wpgmza, all with non-empty lat/lng", () => {
    const blob = extractTableValues(text, "wp_wpgmza");
    let total = 0;
    let withCoords = 0;
    for (const row of iterRows(blob)) {
      total++;
      // schema: 0 id, ..., 7 lat, 8 lng, ..., 10 title
      if (row[7] && row[8] && row[7] !== "" && row[8] !== "") withCoords++;
    }
    expect(total).toBe(48);
    expect(withCoords).toBe(48);
  });

  it("every wpgmza marker title substring-matches a published park title", () => {
    // This is the join we'll rely on at migration time; if it ever breaks,
    // the migration script needs a fallback. Pin the invariant here so we
    // notice immediately.
    const postsBlob = extractTableValues(text, "wp_posts");
    const gmzaBlob = extractTableValues(text, "wp_wpgmza");

    const parkTitles: string[] = [];
    for (const row of iterRows(postsBlob)) {
      if (row[20] === "park" && row[7] === "publish") {
        parkTitles.push((row[5] ?? "").toLowerCase().trim());
      }
    }

    const unmatched: string[] = [];
    for (const row of iterRows(gmzaBlob)) {
      const title = (row[10] ?? "").toLowerCase().trim();
      if (!title) continue;
      const matched = parkTitles.some(
        (pt) => pt.length > 0 && (pt.includes(title) || title.includes(pt)),
      );
      if (!matched) unmatched.push(title);
    }

    expect(unmatched).toEqual([]);
  });
});
