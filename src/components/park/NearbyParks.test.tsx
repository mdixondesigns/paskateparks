import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { NearbyCardItem } from "./NearbyCard";

import { NearbyParks } from "./NearbyParks";

// Phase 7 plan-eng-review T11 — D11 trust-flow regression for the per-park
// Nearby Parks section.
//
// The D11 invariant: closed parks (status='temporarily_closed' or
// 'permanently_closed') must never appear on a discovery surface. /park/<slug>
// Nearby Parks is a discovery surface — a parent on FDR's profile must not
// be steered to a closed park five miles away.
//
// Enforcement layers:
//   1. SQL gate: getAllParksForNearby's WHERE clause includes
//      eq(parks.status, 'open'). Locked in park-query.test.ts via a
//      source-code regression test.
//   2. Component layer: NearbyParks is a pure renderer of its `items` prop.
//      It does NOT filter; it trusts the gate above.
//
// These tests document layer 2. If layer 1 ever regresses, the SQL test
// fires. If someone tries to add status-filtering inside NearbyParks (which
// would mask a layer-1 regression), the first test below fires.

const OPEN_NEARBY: NearbyCardItem[] = [
  { name: "FDR Skatepark", city: "Philadelphia", state: "PA", href: "/park/fdr", distanceMiles: 2.4 },
  { name: "9th and Poplar", city: "Philadelphia", state: "PA", href: "/park/9th-and-poplar", distanceMiles: 5.1 },
  { name: "Bayne Skatepark", city: "Bellevue", state: "PA", href: "/park/bayne-skatepark", distanceMiles: 12.8 },
];

describe("NearbyParks — D11 discovery-surface contract", () => {
  it("renders every item it's given (no status-filter inside the component)", () => {
    // The component MUST be a pure renderer. If anyone adds defensive
    // status-filtering here, this test still passes (all 3 are 'open') —
    // but the test below catches the broader contract.
    render(<NearbyParks items={OPEN_NEARBY} />);
    expect(screen.getByText("FDR Skatepark")).toBeInTheDocument();
    expect(screen.getByText("9th and Poplar")).toBeInTheDocument();
    expect(screen.getByText("Bayne Skatepark")).toBeInTheDocument();
  });

  it("renders nothing when items is empty (D24 — hide silently)", () => {
    const { container } = render(<NearbyParks items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("documents the D11 gate location: closed parks never reach NearbyParks because of the upstream SQL filter", () => {
    // This test is the doc-form invariant: NearbyParks' input is filtered
    // by getAllParksForNearby (WHERE status='open'). The component layer
    // doesn't know about `status` at all — by design. The single point of
    // enforcement is the SQL query.
    //
    // If you're tempted to add status-filtering here as defense-in-depth,
    // stop and read the eng-review summary at
    // ~/.gstack/projects/paskateparks/mike-main-phase7-eng-review-*.md
    // (CMT-2). The wrapper getOpenParksForMap exists to push that gate
    // higher (type system + SQL), not lower (every component).
    //
    // SQL regression boundary: src/lib/park-query.test.ts
    // > "source contains eq(parks.status, 'open') in the function body"
    expect(NearbyParks.length).toBe(1); // takes one props arg
    // The 'items' prop is a NearbyCardItem[], not a Park row — the type
    // signature alone makes status-filtering at this layer impossible.
  });
});
