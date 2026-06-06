import { describe, expect, it } from "vitest";

import { phpUnserialize } from "./php-unserialize";

describe("phpUnserialize", () => {
  it("parses null", () => {
    expect(phpUnserialize("N;")).toBeNull();
  });

  it("parses booleans", () => {
    expect(phpUnserialize("b:0;")).toBe(false);
    expect(phpUnserialize("b:1;")).toBe(true);
  });

  it("parses integers including negative", () => {
    expect(phpUnserialize("i:0;")).toBe(0);
    expect(phpUnserialize("i:42;")).toBe(42);
    expect(phpUnserialize("i:-7;")).toBe(-7);
  });

  it("parses floats", () => {
    expect(phpUnserialize("d:1.5;")).toBe(1.5);
    expect(phpUnserialize("d:-75.151204800000002;")).toBeCloseTo(-75.1512048, 10);
  });

  it("parses ASCII strings", () => {
    expect(phpUnserialize('s:5:"hello";')).toBe("hello");
    expect(phpUnserialize('s:0:"";')).toBe("");
  });

  it("parses UTF-8 strings (byte length, not char length)", () => {
    // "em–dash" — 7 visible characters. The en-dash `–` is 3 UTF-8 bytes
    // (0xE2 0x80 0x93), the other 6 chars are 1 byte each → 9 bytes total.
    // PHP serialize uses BYTE length, not character length. This is the
    // whole point of the Buffer-based parser.
    expect(phpUnserialize('s:9:"em–dash";')).toBe("em–dash");
  });

  it("parses a sequential array (FDR-style gallery)", () => {
    const input = 'a:3:{i:0;s:3:"256";i:1;s:3:"251";i:2;s:3:"252";}';
    expect(phpUnserialize(input)).toEqual(["256", "251", "252"]);
  });

  it("parses an associative array (wpgmza-style location)", () => {
    const input =
      'a:3:{s:7:"address";s:7:"123 Foo";s:3:"lat";d:39.5;s:3:"lng";d:-75.5;}';
    expect(phpUnserialize(input)).toEqual({
      address: "123 Foo",
      lat: 39.5,
      lng: -75.5,
    });
  });

  it("round-trips a realistic FDR gallery slice", () => {
    // Real first-N items from FDR's gallery field
    const input = 'a:5:{i:0;s:3:"256";i:1;s:3:"251";i:2;s:3:"252";i:3;s:3:"254";i:4;s:3:"255";}';
    const out = phpUnserialize(input);
    expect(out).toEqual(["256", "251", "252", "254", "255"]);
  });

  it("handles nested arrays", () => {
    const input = 'a:1:{s:5:"outer";a:2:{i:0;i:1;i:1;i:2;}}';
    expect(phpUnserialize(input)).toEqual({ outer: [1, 2] });
  });

  // Note: PHP objects (`O:`) and references (`R:`) — the `php-serialize`
  // library handles both. We don't assert behavior for them because none
  // appear anywhere in our WP dump (verified by inspection in phase 5 step 1).
  // If they ever did, we'd add coverage at that point.
});
