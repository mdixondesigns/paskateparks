"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// ModalShell — client wrapper for the native <dialog> lifecycle used by the
// park-detail intercept route. Owns:
//   • showModal() on mount, close() on unmount (Next handles unmount via the
//     parallel-routes back navigation — when the user goes back to /, the
//     @modal slot re-renders default.tsx (null) and this component unmounts).
//   • ESC close (browser-native via <dialog>; the dialog fires onClose).
//   • Backdrop click + X button (desktop).
//   • Back arrow (mobile, via CSS at < 1024px).
//   • aria-labelledby="park-name" (D4 — reuses the existing span ParkProfile
//     renders for its standalone-page aria-labelledby; one source of truth).
//   • Close target: router.back() with a router.push('/') fallback when the
//     history can't safely pop (deep-link → / → modal-B → close case from
//     eng-review D5).
//
// notFound mode: when the intercept route's getParkBySlug returns null we
// render an inline "Park not found" dialog instead of calling Next's
// notFound() — the latter would 404 the homepage shell underneath the modal.

interface Props {
  parkName: string;
  notFound?: boolean;
  children?: React.ReactNode;
}

export function ModalShell({ parkName, notFound = false, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    // No explicit cleanup: when the @modal slot unmounts (browser back, or
    // router.back() called from close()) the <dialog> element leaves the
    // DOM and the browser releases the top layer. Calling dlg.close() here
    // would risk firing onClose during an in-flight navigation and double-
    // popping the history stack.
  }, []);

  // Document title: Next.js parallel-slot routes do NOT contribute their
  // generateMetadata to the document <title> — only the primary route
  // segment does. So while the modal is open we set the title client-side
  // and restore on unmount. The intercept route's generateMetadata still
  // matters for the initial RSC payload + crawler-fed view, but the live
  // tab title needs this effect.
  useEffect(() => {
    if (notFound) return;
    const previousTitle = document.title;
    document.title = `${parkName} — PA Skateparks`;
    return () => {
      document.title = previousTitle;
    };
  }, [parkName, notFound]);

  function close() {
    // history.length includes the current entry; > 1 means there's at least
    // one entry to pop back to. Without a previous entry (deep-link to
    // /park/<slug> direct + opened modal-B from / after client-side nav),
    // router.back() would land on a stale standalone page or leave the
    // site — push('/') as a safer fallback (eng-review D5).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  // Backdrop click — clicking the <dialog> element itself (not its inner
  // content) closes. The content wrapper stops propagation so clicks inside
  // the profile never bubble here. Native <dialog> doesn't get a backdrop
  // click handler for free; this is the canonical pattern.
  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) close();
  }

  // Native <dialog> fires `cancel` on ESC (preventable) and `close` after
  // the cancel default action. We hook close so ESC and dlg.close() both
  // funnel through our close() helper, which handles the router.back/push
  // contract.
  //
  // event.target check is load-bearing: React's synthetic event system fires
  // onClose on the ancestor when a descendant native <dialog> closes (the
  // photo Lightbox lives inside ParkProfile inside this modal), and without
  // this guard, closing the Lightbox would unconditionally close the park
  // modal too. Filtering on event.target === dialogRef.current ensures only
  // this dialog's own close triggers navigation.
  function onDialogClose(event: React.SyntheticEvent<HTMLDialogElement>) {
    if (event.target !== dialogRef.current) return;
    close();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onDialogClose}
      onClick={onDialogClick}
      aria-labelledby="park-name"
      className="park-modal w-full max-w-2xl rounded-lg bg-white p-0 backdrop:bg-black/50"
    >
      {/* Inner wrapper stops backdrop clicks from bubbling to the dialog. */}
      <div className="park-modal__content" onClick={(e) => e.stopPropagation()}>
        {/* Close affordances: top-right X (desktop), top-left ← (mobile).
            Both call close(); CSS at < 1024px hides the X and shows the back
            arrow per T5. aria-label per a11y. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="park-modal__close-x absolute right-3 top-3 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-white text-2xl leading-none shadow lg:flex"
        >
          ×
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Back"
          className="park-modal__back absolute left-3 top-3 z-10 flex h-9 items-center gap-1 rounded-full bg-white px-3 text-sm font-medium shadow lg:hidden"
        >
          <span aria-hidden="true">‹</span>
          Back
        </button>

        {notFound ? (
          <div className="px-6 py-12 text-center">
            <span id="park-name" className="sr-only">
              {parkName}
            </span>
            <h2 className="text-xl font-semibold">Park not found</h2>
            <p className="mt-2 text-sm text-gray-700">
              That park isn&rsquo;t in our directory.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-4 rounded bg-black px-4 py-2 text-sm text-white"
            >
              Close
            </button>
          </div>
        ) : (
          children
        )}
      </div>
    </dialog>
  );
}
