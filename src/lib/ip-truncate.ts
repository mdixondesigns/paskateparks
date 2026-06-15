// PII reduction per STACK-PIVOT.md finding #11: truncate the submitter IP to
// the /24 equivalent before inserting into suggestions. /24 keeps useful
// abuse-triage signal ("which slash-24 keeps spamming?") without storing
// the precision needed to fingerprint a single device or household.
//
// IPv4:  a.b.c.d                  → a.b.c.0/24   (drop last 8 bits)
// IPv6:  a:b:c:d:e:f:g:h          → a:b:c:d::/64 (drop last 64 bits)
//
// We use /64 for IPv6 because that's the standard subnet size assigned to
// an end-user — it's the v6 analog of "the household" (the same scope /24
// roughly captures for v4 ISPs). Postgres CIDR accepts both.
//
// The function returns the CIDR string for direct insertion into a Postgres
// CIDR column. Returns null for malformed input (caller stores null IP).

export function truncateIp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // x-forwarded-for can be a list "client, proxy1, proxy2"; take the leftmost.
  const candidate = (trimmed.split(",")[0] ?? "").trim();
  if (candidate.length === 0) return null;

  // IPv6-mapped IPv4 (::ffff:1.2.3.4) → unwrap to the v4 form
  const v4Mapped = candidate.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v4Mapped?.[1]) return truncateIpv4(v4Mapped[1]);

  if (candidate.includes(":")) return truncateIpv6(candidate);
  if (candidate.includes(".")) return truncateIpv4(candidate);
  return null;
}

function truncateIpv4(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

/**
 * Truncate an IPv6 address to its /64. Handles the `::` compressed form by
 * expanding to 8 groups before keeping the first 4.
 */
function truncateIpv6(ip: string): string | null {
  // Reject zone identifiers (fe80::1%eth0) — not valid in CIDR storage.
  if (ip.includes("%")) return null;

  // Split on `::` to expand zero-compression. At most one `::` is allowed.
  const doubleColonCount = (ip.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  let groups: string[];
  if (ip.includes("::")) {
    const parts = ip.split("::");
    const head = parts[0] ?? "";
    const tail = parts[1] ?? "";
    const headParts = head.length > 0 ? head.split(":") : [];
    const tailParts = tail.length > 0 ? tail.split(":") : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    groups = [...headParts, ...Array(missing).fill("0"), ...tailParts];
  } else {
    groups = ip.split(":");
  }

  if (groups.length !== 8) return null;

  for (const g of groups) {
    if (g.length === 0 || g.length > 4 || !/^[0-9a-fA-F]+$/.test(g)) return null;
  }

  // Keep the first 4 groups (high 64 bits), zero the rest.
  const high = groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+/, "") || "0");
  return `${high.join(":")}::/64`;
}
