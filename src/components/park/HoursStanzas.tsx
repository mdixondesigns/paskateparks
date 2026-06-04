interface Props {
  hours: string | null;
}

// Section 4 — hours per D13. Single long-text field; line breaks separate
// stanzas. Hides silently when null.
export function HoursStanzas({ hours }: Props) {
  if (!hours || hours.trim().length === 0) return null;

  return (
    <section aria-labelledby="hours-heading" className="px-4 py-4">
      <h2 id="hours-heading" className="text-xs font-bold uppercase tracking-wider">
        Hours
      </h2>
      <p className="mt-2 whitespace-pre-line">{hours}</p>
    </section>
  );
}
