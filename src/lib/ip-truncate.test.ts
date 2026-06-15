import { describe, expect, it } from "vitest";

import { truncateIp } from "./ip-truncate";

describe("truncateIp — IPv4", () => {
  it("truncates a typical IPv4 to /24", () => {
    expect(truncateIp("192.168.1.5")).toBe("192.168.1.0/24");
  });
  it("preserves the network portion exactly", () => {
    expect(truncateIp("203.0.113.99")).toBe("203.0.113.0/24");
  });
  it("handles 0-octet addresses", () => {
    expect(truncateIp("10.0.0.0")).toBe("10.0.0.0/24");
  });
  it("rejects out-of-range octets", () => {
    expect(truncateIp("192.168.1.300")).toBeNull();
  });
  it("rejects negative octets", () => {
    expect(truncateIp("192.168.-1.5")).toBeNull();
  });
  it("rejects too-many octets", () => {
    expect(truncateIp("1.2.3.4.5")).toBeNull();
  });
});

describe("truncateIp — IPv6", () => {
  it("truncates an uncompressed IPv6 to /64", () => {
    expect(truncateIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
      "2001:db8:85a3:0::/64",
    );
  });
  it("handles :: compression at the end", () => {
    expect(truncateIp("2001:db8:85a3::")).toBe("2001:db8:85a3:0::/64");
  });
  it("handles :: at the start", () => {
    expect(truncateIp("::1")).toBe("0:0:0:0::/64");
  });
  it("handles :: in the middle", () => {
    expect(truncateIp("2001:db8::8a2e:370:7334")).toBe("2001:db8:0:0::/64");
  });
  it("unwraps IPv4-mapped IPv6 to v4 /24", () => {
    expect(truncateIp("::ffff:192.168.1.5")).toBe("192.168.1.0/24");
  });
  it("rejects double-double-colon", () => {
    expect(truncateIp("1::2::3")).toBeNull();
  });
  it("rejects zone identifiers", () => {
    expect(truncateIp("fe80::1%eth0")).toBeNull();
  });
  it("rejects too-many groups", () => {
    expect(truncateIp("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});

describe("truncateIp — input handling", () => {
  it("returns null for null", () => {
    expect(truncateIp(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(truncateIp(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(truncateIp("")).toBeNull();
  });
  it("returns null for whitespace-only", () => {
    expect(truncateIp("   ")).toBeNull();
  });
  it("trims surrounding whitespace", () => {
    expect(truncateIp("  192.168.1.5  ")).toBe("192.168.1.0/24");
  });
  it("takes the leftmost client from x-forwarded-for list", () => {
    expect(truncateIp("192.168.1.5, 10.0.0.1, 172.16.0.1")).toBe("192.168.1.0/24");
  });
  it("returns null for garbage with no separators", () => {
    expect(truncateIp("not-an-ip")).toBeNull();
  });
});
