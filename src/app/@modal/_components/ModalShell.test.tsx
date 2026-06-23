import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Stub Next's useRouter — ModalShell calls router.back / router.push on close.
const routerBack = vi.fn();
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: routerBack,
    push: routerPush,
    replace: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { ModalShell } from "./ModalShell";

// happy-dom may not implement HTMLDialogElement.showModal / close fully.
// Patch them on the prototype to no-ops that flip the .open property, so
// the effect's showModal() call doesn't throw and dlg.open reads true after
// mount. Also expose closing the dialog via close() for assertions.
beforeEach(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  routerBack.mockClear();
  routerPush.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModalShell", () => {
  it("renders children inside a <dialog> and calls showModal on mount", () => {
    render(
      <ModalShell parkName="FDR Skatepark">
        <div data-testid="profile">Park profile content</div>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByTestId("profile")).toBeInTheDocument();
  });

  it("sets aria-labelledby='park-name' on the dialog (D4 — reuses ParkProfile span)", () => {
    render(
      <ModalShell parkName="FDR Skatepark">
        <div>profile</div>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.getAttribute("aria-labelledby")).toBe("park-name");
  });

  it("close button (X / Back) calls router.back when history is non-empty", () => {
    // window.history.length is 1 by default in happy-dom; stub to >1.
    Object.defineProperty(window.history, "length", { value: 5, configurable: true });
    render(
      <ModalShell parkName="FDR">
        <div>profile</div>
      </ModalShell>,
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(routerBack).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("falls back to router.push('/') when history is empty (D5)", () => {
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    render(
      <ModalShell parkName="FDR">
        <div>profile</div>
      </ModalShell>,
    );
    fireEvent.click(screen.getByLabelText("Close"));
    expect(routerPush).toHaveBeenCalledExactlyOnceWith("/");
    expect(routerBack).not.toHaveBeenCalled();
  });

  it("notFound=true renders the inline 'Park not found' UI without children", () => {
    render(<ModalShell parkName="ghost" notFound />);
    expect(screen.getByText("Park not found")).toBeInTheDocument();
    expect(
      screen.getByText(/isn.t in our directory/i),
    ).toBeInTheDocument();
  });

  it("backdrop click (target === dialog) closes; inner click does not", () => {
    Object.defineProperty(window.history, "length", { value: 5, configurable: true });
    render(
      <ModalShell parkName="FDR">
        <div data-testid="profile">profile</div>
      </ModalShell>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    // Inner content click — should NOT close.
    fireEvent.click(screen.getByTestId("profile"));
    expect(routerBack).not.toHaveBeenCalled();
    // Click on the dialog element itself simulates backdrop.
    fireEvent.click(dialog, { target: dialog });
    expect(routerBack).toHaveBeenCalledTimes(1);
  });
});
