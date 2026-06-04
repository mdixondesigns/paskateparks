interface Props {
  parkSlug: string;
  parkName: string;
}

// Section 14 — Suggest an Edit per D28.
// Phase 4 placeholder: button that announces itself as opening a dialog.
// Phase 9 wires the actual dialog: focus-trap, Turnstile (per A8 trim), POST to /api/suggestions.
// For now it's a visible no-op so the section renders end-to-end.
export function SuggestEditButton({ parkSlug, parkName }: Props) {
  return (
    <section aria-labelledby="suggest-heading" className="px-4 py-4">
      <h2 id="suggest-heading" className="sr-only">
        Suggest an edit
      </h2>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Suggest an edit to ${parkName}`}
        data-park-slug={parkSlug}
        className="block w-full rounded border px-4 py-3 text-left"
      >
        Suggest an edit →
      </button>
    </section>
  );
}
