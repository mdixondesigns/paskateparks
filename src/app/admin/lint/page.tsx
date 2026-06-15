import Link from "next/link";

import { dbPooled } from "@/db/pooled";
import {
  getAllLintChips,
  type Chip,
  type ChipError,
} from "@/lib/lint-checks";

// Owner-facing data-quality dashboard (phase 9 4A — all 4 chips ship in v1).
//
// Protected by middleware.ts /admin/* auth gate — no auth check needed here.
// The 4 chip queries run in parallel via getAllLintChips() — total page
// latency is bounded by the slowest single query, currently <50ms each.
//
// `dynamic = "force-dynamic"` so each page load reflects current data, NOT
// the build-time snapshot.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin · Data lint",
  robots: { index: false, follow: false },
};

export default async function AdminLintPage() {
  const results = await getAllLintChips(dbPooled);
  const errors = results.filter((r): r is { ok: false; error: ChipError } => !r.ok);

  return (
    <main
      id="main"
      style={{
        maxWidth: "48rem",
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Data lint</h1>
        <p style={{ color: "#666", margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
          Four data-quality checks. Warnings indicate drift that breaks
          production if accumulated; info chips are owner-actionable backlogs.
        </p>
        {errors.length > 0 ? (
          <p
            role="alert"
            style={{
              marginTop: "1rem",
              padding: "0.5rem 0.75rem",
              background: "#fff5f5",
              border: "1px solid #c00",
              borderRadius: "4px",
              fontSize: "0.875rem",
              color: "#600",
            }}
          >
            {errors.length} of {results.length} checks failed to run. Likely
            cause: the Supabase project is paused/throttled. Check the dashboard
            and retry.
          </p>
        ) : null}
      </header>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        {results.map((result, i) =>
          result.ok ? (
            <ChipCard key={result.chip.key} chip={result.chip} />
          ) : (
            <ErrorCard key={`err-${i}`} error={result.error} />
          ),
        )}
      </div>
    </main>
  );
}

function ErrorCard({ error }: { error: ChipError }) {
  return (
    <section
      style={{
        border: "1px solid #c00",
        borderRadius: "6px",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          background: "#fff5f5",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #c00",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
          {error.title} <span style={{ color: "#900" }}>· failed</span>
        </h2>
      </header>
      <div style={{ padding: "1rem", fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
        <p style={{ margin: 0, color: "#600", whiteSpace: "pre-wrap" }}>
          {error.error}
        </p>
      </div>
    </section>
  );
}

function ChipCard({ chip }: { chip: Chip }) {
  const borderColor = chip.severity === "warning" ? "#c00" : "#666";
  const headerBg = chip.severity === "warning" ? "#fff5f5" : "#f5f5f5";

  return (
    <section
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: "6px",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          background: headerBg,
          padding: "0.75rem 1rem",
          borderBottom: `1px solid ${borderColor}`,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.125rem" }}>{chip.title}</h2>
        <span
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {chip.count}
        </span>
      </header>
      <div style={{ padding: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#444" }}>
          {chip.description}
        </p>
        {chip.rows.length === 0 ? (
          <p style={{ margin: 0, color: "#080", fontSize: "0.875rem" }}>
            ✓ No issues.
          </p>
        ) : (
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.25rem",
              fontSize: "0.875rem",
              maxHeight: chip.rows.length > 20 ? "16rem" : "none",
              overflowY: chip.rows.length > 20 ? "auto" : "visible",
            }}
          >
            {chip.rows.map((row) => (
              <li key={row.id}>
                <Link href={`/park/${row.slug}`} prefetch={false}>
                  {row.name}
                </Link>{" "}
                <span style={{ color: "#666" }}>— {row.city}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
