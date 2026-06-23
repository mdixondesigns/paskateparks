// Required by Next.js parallel routes. The @modal slot renders `default.tsx`
// on every non-intercepted route — returning null keeps the slot empty on
// pages that don't open a modal (about, county, obstacle, standalone park,
// etc). Without this file, Next 404s the slot on every non-/park navigation
// and every page renders an error. Not optional.
export default function ModalDefault() {
  return null;
}
