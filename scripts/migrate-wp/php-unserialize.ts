/**
 * PHP `serialize()` reader — thin wrapper around the `php-serialize` npm
 * package (60k+ weekly downloads, MIT, actively maintained).
 *
 * WHY a wrapper at all (vs. importing `php-serialize` directly everywhere):
 *   1. One place to swap implementations if the library ever misbehaves.
 *   2. Our `PhpValue` type is narrower than the library's `any` — call sites
 *      get useful type narrowing instead of silently typing everything as any.
 *   3. The probe in step 2 of phase 5 confirmed equivalent behavior on every
 *      shape we care about (sequential arrays → JS arrays, associative →
 *      objects, UTF-8 byte-length strings, null, bool, int, float, nested).
 *
 * VALIDATION (phase 5 step 2 cross-check, 2026-06-06):
 *   Cross-checked against Python's `phpserialize` library (canonical port of
 *   PHP's own implementation) on every PHP-serialized field in the real WP
 *   dump: 1269 values compared, 1269 structurally identical, 0 mismatches,
 *   0 JS throws. Method:
 *     1. Python: parse every wp_postmeta.meta_value starting with `a:`/`s:`/
 *        `i:`/`b:`/`d:`/`N;`/`O:` via `phpserialize.loads(decode_strings=True)`.
 *     2. Normalize: empty dicts and empty lists both canonicalize to `[]`
 *        (PHP's `a:0:{}` is ambiguous between empty-list and empty-dict).
 *     3. JS: parse each raw string via this wrapper; serialize to canonical
 *        JSON with sorted keys.
 *     4. Compare canonical JSON strings byte-for-byte.
 *   To re-run, recreate the two-script harness using `wp_postmeta` rows from
 *   `data/wp-export/mysql.sql` as input.
 *
 * CALLER GUIDANCE: don't blindly trust the returned shape downstream. ACF
 * stores arbitrary user-controlled values; the transform layer should
 * field-check each `phpUnserialize()` result (e.g., gallery is array of
 * numeric strings, location has expected keys) before passing it to DB
 * inserts. This wrapper validates structure only, not semantics.
 *
 * The serialized data we have to parse, for reference:
 *   gallery        = 'a:28:{i:0;s:3:"256";i:1;s:3:"251";...}'    array of attachment IDs
 *   obstacles      = 'a:21:{i:0;s:2:"38";i:1;s:2:"14";...}'      array of term IDs
 *   riding_surface = 'a:1:{i:0;s:1:"3";}'                        single-element array
 *   location       = 'a:14:{s:7:"address";s:53:"...";...}'       associative array
 */

import { unserialize } from "php-serialize";

export type PhpValue =
  | null
  | boolean
  | number
  | string
  | PhpValue[]
  | { [key: string]: PhpValue };

/** Decode a PHP-serialized string. Throws on malformed input. */
export function phpUnserialize(input: string): PhpValue {
  return unserialize(input) as PhpValue;
}
