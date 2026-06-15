"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";

// Lazy-load the modal body (form state + fetch logic, ~3-5KB gzipped) so
// initial park-page TTI is unaffected. ssr:false because the modal only
// matters after a user interaction — there's nothing to render server-side.
const SuggestEditModal = dynamic(
  () => import("./SuggestEditModal").then((m) => m.SuggestEditModal),
  { ssr: false },
);

interface Props {
  parkId: number;
  parkSlug: string;
  parkName: string;
}

// Section 14 — Suggest an Edit per D28.
// Phase 9 (locked 5A): button trigger + lazy-loaded SuggestEditModal.
// Closed park profiles still render at /park/<slug> but the button is hidden
// on permanently_closed parks (no point suggesting edits to a historical record;
// that filtering happens in ParkProfile — we don't render the button at all).
export function SuggestEditButton({ parkId, parkSlug, parkName }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function close() {
    setOpen(false);
    // Return focus to the trigger after close — a11y best practice for modals.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <section aria-labelledby="suggest-heading" className="px-4 py-4">
      <h2 id="suggest-heading" className="sr-only">
        Suggest an edit
      </h2>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Suggest an edit to ${parkName}`}
        data-park-slug={parkSlug}
        className="block w-full rounded border px-4 py-3 text-left hover:bg-gray-50"
      >
        Know this park? Suggest an edit →
      </button>
      {open ? (
        <SuggestEditModal parkId={parkId} parkName={parkName} onClose={close} />
      ) : null}
    </section>
  );
}
