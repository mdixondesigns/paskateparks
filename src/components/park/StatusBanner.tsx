import type { ParkWithRelations } from "@/lib/park-query";

interface Props {
  status: ParkWithRelations["status"];
  reopenExpectedAt: ParkWithRelations["reopenExpectedAt"];
}

// Section 2 — status banner per D11.
// Silent when "open"; prominent role="alert" when temporarily or permanently closed.
// Permanently closed pages stay live as a historical record (per D11).
export function StatusBanner({ status, reopenExpectedAt }: Props) {
  if (status === "open") return null;

  const isTemp = status === "temporarily_closed";
  const label = isTemp ? "NOTE FROM THE EDITOR" : "THIS PARK IS NO LONGER OPEN";
  const body = isTemp
    ? reopenExpectedAt
      ? `This park is temporarily closed. Expected to reopen by ${reopenExpectedAt}.`
      : "This park is temporarily closed. We'll update when we know more."
    : "We're keeping this page as a historical record of what was here.";

  return (
    <aside
      role="alert"
      aria-live="polite"
      className="border-y px-4 py-3"
      data-status={status}
    >
      <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-sm">{body}</p>
    </aside>
  );
}
