"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  parkId: number;
  parkName: string;
  onClose: () => void;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

// D28 Suggest-an-Edit modal — client island, lazy-loaded by SuggestEditButton.
// POSTs to /api/suggestions. Inline success per phase-9 5A: swap to thank-you
// screen, auto-close after 2s.
//
// Spam protection (v1, per E5 amendment): honeypot field named `referralSource`
// (renamed from "website" per CMT-4 outside voice — "website" is on common bot
// wordlists). The field is off-screen + aria-hidden + tabindex=-1. Bots that
// fill every input get caught server-side; the server silently returns 200.
//
// Modal a11y:
//   • role="dialog" + aria-modal + aria-labelledby
//   • focus moves to the first input on open; ESC and backdrop close
//   • returns focus to the trigger on close (handled by SuggestEditButton)

const AUTO_CLOSE_MS = 2_000;

export function SuggestEditModal({ parkId, parkName, onClose }: Props) {
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Focus the first field on mount.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // ESC closes the modal. Eng-review D2 / D6.3: SuggestEditModal can be
  // rendered inside the park-detail native <dialog> (intercept-route modal).
  // Pressing ESC there normally triggers BOTH this handler AND the outer
  // dialog's user-agent default action (cancel + close). The fix is
  // `e.preventDefault()` on the keydown — that suppresses the dialog's UA
  // action so only this inner modal closes. `stopPropagation` is
  // belt-and-suspenders for any future listeners further up the chain.
  // Both calls are harmless on the standalone park page (no outer dialog).
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (state === "submitting") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onClose, state]);

  // Auto-close after success.
  useEffect(() => {
    if (state !== "success") return;
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [state, onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setErrorMessage(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      parkId,
      name: String(formData.get("name") ?? "").trim() || undefined,
      email: String(formData.get("email") ?? "").trim() || undefined,
      changeDescription: String(formData.get("changeDescription") ?? "").trim(),
      reason: String(formData.get("reason") ?? "").trim() || undefined,
      referralSource: String(formData.get("referralSource") ?? ""), // honeypot
    };

    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(humanError(data.error, res.status));
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setErrorMessage("Could not reach the server. Please try again.");
      setState("error");
    }
  }

  function onBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && state !== "submitting") onClose();
  }

  return (
    <div
      role="presentation"
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-modal-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        {state === "success" ? (
          <div className="text-center">
            <h2
              id="suggest-modal-title"
              className="mb-2 text-xl font-semibold"
            >
              Thanks!
            </h2>
            <p className="text-sm text-gray-700">
              We&rsquo;ll review your suggestion. This window will close in a moment.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <header className="mb-4 flex items-start justify-between">
              <h2
                id="suggest-modal-title"
                className="text-xl font-semibold"
              >
                Suggest an edit
              </h2>
              <button
                type="button"
                onClick={onClose}
                disabled={state === "submitting"}
                aria-label="Close"
                className="text-2xl leading-none text-gray-500 hover:text-gray-900 disabled:opacity-50"
              >
                ×
              </button>
            </header>

            <p className="mb-4 text-sm text-gray-600">
              What should we know about <strong>{parkName}</strong>?
            </p>

            {/* HONEYPOT — off-screen + aria-hidden + tabindex=-1 + autocomplete off.
                Bots that fill every field trip the check; humans never see it. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              <label htmlFor="suggest-referral-source">
                Where did you hear about this site?
              </label>
              <input
                id="suggest-referral-source"
                name="referralSource"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                defaultValue=""
              />
            </div>

            <div className="mb-3">
              <label
                htmlFor="suggest-description"
                className="mb-1 block text-sm font-medium"
              >
                What should change? <span className="text-red-600">*</span>
              </label>
              <textarea
                id="suggest-description"
                name="changeDescription"
                required
                maxLength={2000}
                rows={4}
                ref={firstFieldRef as unknown as React.RefObject<HTMLTextAreaElement>}
                className="w-full rounded border border-gray-400 px-3 py-2 text-sm"
                placeholder="e.g. The bathroom is permanent (was Porta), or there's a new pool bowl on the east side."
              />
            </div>

            <div className="mb-3">
              <label
                htmlFor="suggest-reason"
                className="mb-1 block text-sm font-medium"
              >
                How do you know? <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="suggest-reason"
                name="reason"
                type="text"
                maxLength={2000}
                className="w-full rounded border border-gray-400 px-3 py-2 text-sm"
                placeholder="e.g. I skate here every week."
              />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="suggest-name"
                  className="mb-1 block text-sm font-medium"
                >
                  Name <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  id="suggest-name"
                  name="name"
                  type="text"
                  maxLength={200}
                  autoComplete="name"
                  className="w-full rounded border border-gray-400 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="suggest-email"
                  className="mb-1 block text-sm font-medium"
                >
                  Email <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  id="suggest-email"
                  name="email"
                  type="email"
                  maxLength={320}
                  autoComplete="email"
                  className="w-full rounded border border-gray-400 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {errorMessage ? (
              <p
                role="alert"
                className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full rounded bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "submitting" ? "Sending…" : "Send suggestion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function humanError(code: string | undefined, status: number): string {
  switch (code) {
    case "missing_change_description":
      return "Please tell us what should change.";
    case "change_description_too_long":
      return "That description is too long. Please keep it under 2000 characters.";
    case "park_not_found":
      return "This park is no longer in our directory.";
    case "malformed_json":
    case "invalid_parkId":
      return "Something looks wrong with the form. Please try again.";
    default:
      return status >= 500
        ? "Our server hit a snag. Please try again in a minute."
        : "Could not submit your suggestion. Please try again.";
  }
}
