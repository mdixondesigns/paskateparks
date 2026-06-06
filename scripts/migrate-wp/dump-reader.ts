/**
 * Minimal mysqldump reader.
 *
 * Goal: given a mysqldump file and a table name, yield every row from every
 * INSERT INTO `<table>` VALUES (...) statement as a `string[]` (with `null`
 * for SQL NULLs). We DON'T need a general SQL parser — mysqldump output
 * follows a tight, predictable shape.
 *
 * Shape we handle:
 *   INSERT INTO `wp_posts` VALUES (1,1,'2024-...',...,'park','',0),(2,...);
 *   - Single line per INSERT statement, possibly very long (hundreds of KB)
 *   - Line terminator may be LF (Unix dumps) or CRLF (Windows-encoded dumps)
 *   - Each tuple wrapped in (...)
 *   - String values single-quoted; backslash-escaped single quotes ('\'') and
 *     backslashes ('\\') inside
 *   - Non-string values are bare (integer, decimal, NULL)
 *
 * What we DO NOT handle:
 *   - Multi-line CREATE TABLE statements (we don't parse those)
 *   - Triggers, views, stored procedures (not in WP dumps)
 *   - Binary BLOB columns with smuggled NULs (none in our data)
 *
 * Posture: this is a one-shot migration helper. We prefer FAIL-LOUD over
 * silent partial output — a parser bug that returns "0 rows" or "47 rows
 * instead of 48" is the worst kind of bug for a migration. Every divergence
 * from the expected shape throws with offset + context for debugging.
 */

import { readFileSync } from "node:fs";

/**
 * Pull the concatenated VALUES blob (everything between `VALUES ` and the
 * terminating `;` at end-of-line) across every INSERT statement for the
 * given table. Returns a single string with all tuples in order — feed
 * it to {@link iterRows}.
 *
 * Handles both LF (`;\n`) and CRLF (`;\r\n`) statement terminators.
 * Throws if a discovered INSERT statement isn't terminated with `;` at
 * end-of-line — that signals dump format drift we don't want to swallow.
 */
export function extractTableValues(dumpText: string, table: string): string {
  const needle = `INSERT INTO \`${table}\` VALUES `;
  const chunks: string[] = [];
  let pos = 0;
  while (true) {
    const idx = dumpText.indexOf(needle, pos);
    if (idx === -1) break;
    const valuesStart = idx + needle.length;

    // mysqldump writes one INSERT per LINE. Strings containing newlines
    // have them encoded as `\n` escapes inside quotes, never literal LF
    // inside the values list. So the next real newline = end of statement.
    let lineEnd = dumpText.indexOf("\n", valuesStart);
    if (lineEnd === -1) lineEnd = dumpText.length;
    let valuesEnd = lineEnd;
    // Peel back the optional \r (CRLF dumps).
    if (valuesEnd > valuesStart && dumpText[valuesEnd - 1] === "\r") valuesEnd--;
    // The character just before EOL must be `;`. Fail loud if not — that
    // means the dump shape isn't what we expect and silent truncation is
    // a bigger risk than a clear error here.
    if (valuesEnd <= valuesStart || dumpText[valuesEnd - 1] !== ";") {
      const ctxStart = Math.max(0, valuesEnd - 30);
      const ctxEnd = Math.min(dumpText.length, valuesEnd + 5);
      throw new Error(
        `extractTableValues(${table}): INSERT at offset ${idx} did not end with ';' at line end. ` +
          `Last ~35 chars before EOL: ${JSON.stringify(dumpText.slice(ctxStart, ctxEnd))}`,
      );
    }
    valuesEnd--; // skip the terminating ';'

    chunks.push(dumpText.slice(valuesStart, valuesEnd));
    pos = lineEnd;
  }
  return chunks.join("\n");
}

/**
 * Tokenize a VALUES blob into per-tuple arrays. Each tuple is `string[] | null[]`
 * — string-typed columns come back as decoded strings (escapes resolved),
 * numeric columns come back as their original digit string (so the caller
 * can choose Number / BigInt / parseFloat as fits), and NULL comes back as
 * JS `null`.
 *
 * We resolve only the escapes mysqldump actually emits with default flags:
 *   \\  → \
 *   \'  → '
 *   \"  → "
 *   \n  → LF
 *   \r  → CR
 *   \t  → TAB
 *   \b  → BS  (0x08)
 *   \0  → NUL (0x00)
 *   \Z  → 0x1A (rare)
 *   any other \X → X (mysqldump's "pass through" behavior)
 *
 * Throws on:
 *   - unterminated quoted string (walked to end of input without closing ')
 *   - unexpected non-delimiter character outside a tuple
 *   - malformed tuple body (missing , or ) after a column)
 */
export function* iterRows(valuesBlob: string): Generator<(string | null)[]> {
  const n = valuesBlob.length;
  let i = 0;

  const skipDelims = () => {
    while (i < n) {
      const c = valuesBlob.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x2c /* , */ || c === 0x3b /* ; */) {
        i++;
        continue;
      }
      break;
    }
  };

  while (i < n) {
    skipDelims();
    if (i >= n) return;
    if (valuesBlob[i] !== "(") {
      // After skipDelims, the only valid next char is '(' (next tuple) or
      // end-of-input. Anything else means stray non-tuple text after the
      // values list — we fail loud rather than silently dropping rows.
      throw new Error(
        `iterRows: expected '(' at offset ${i}, got ${JSON.stringify(valuesBlob[i])} ` +
          `near ${JSON.stringify(valuesBlob.slice(Math.max(0, i - 20), Math.min(n, i + 30)))}`,
      );
    }

    i++; // consume '('
    const cols: (string | null)[] = [];

    while (true) {
      const ch = valuesBlob[i];

      if (ch === "'") {
        // Quoted string — walk until matching unescaped '
        const quoteStart = i;
        i++; // consume opening '
        let out = "";
        let terminated = false;
        while (i < n) {
          const c = valuesBlob[i];
          if (c === "\\" && i + 1 < n) {
            const next = valuesBlob[i + 1];
            switch (next) {
              case "n": out += "\n"; break;
              case "r": out += "\r"; break;
              case "t": out += "\t"; break;
              case "b": out += "\b"; break;
              case "0": out += "\0"; break;
              case "Z": out += "\x1A"; break;
              case "\\": out += "\\"; break;
              case "'": out += "'"; break;
              case '"': out += '"'; break;
              default:  out += next ?? ""; break; // mysqldump pass-through
            }
            i += 2;
            continue;
          }
          if (c === "'") {
            terminated = true;
            break;
          }
          out += c;
          i++;
        }
        if (!terminated) {
          throw new Error(
            `iterRows: unterminated quoted string starting at offset ${quoteStart} ` +
              `(read ${i - quoteStart - 1} characters before end of input). ` +
              `Last 40 chars consumed: ${JSON.stringify(out.slice(-40))}`,
          );
        }
        cols.push(out);
        i++; // consume closing '
      } else {
        // Unquoted: NULL, integer, decimal, scientific-notation float
        const start = i;
        while (i < n) {
          const c = valuesBlob[i];
          if (c === "," || c === ")") break;
          i++;
        }
        const raw = valuesBlob.slice(start, i).trim();
        cols.push(raw === "NULL" ? null : raw);
      }

      // After one column, we expect ',' (more cols) or ')' (tuple done)
      if (valuesBlob[i] === ",") {
        i++;
        continue;
      }
      if (valuesBlob[i] === ")") {
        i++;
        break;
      }
      // Malformed — bail rather than spin forever
      throw new Error(
        `iterRows: unexpected character ${JSON.stringify(valuesBlob[i])} at offset ${i} in tuple ` +
          `starting near ${JSON.stringify(valuesBlob.slice(Math.max(0, i - 20), Math.min(n, i + 20)))}`,
      );
    }

    yield cols;
  }
}

/** Convenience: read file from disk and return its text. */
export function readDump(path: string): string {
  return readFileSync(path, "utf8");
}
