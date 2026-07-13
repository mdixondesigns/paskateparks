import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PhotoGallery } from "./PhotoGallery";
import type { LightboxPhoto } from "./Lightbox";

// Stub dialog methods (jsdom doesn't implement showModal/close).
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

afterEach(() => {
  cleanup();
});

const PHOTOS: LightboxPhoto[] = [
  { id: 1, storagePath: "parks/test/p1", caption: "one", credit: null, altText: null },
  { id: 2, storagePath: "parks/test/p2", caption: null, credit: null, altText: "two" },
];

describe("PhotoGallery", () => {
  it("returns null when photos is empty", () => {
    const { container } = render(<PhotoGallery parkName="x" photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one button per photo with descriptive aria-label", () => {
    render(<PhotoGallery parkName="Test Park" photos={PHOTOS} />);
    expect(screen.getByRole("button", { name: /view photo 1 of 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view photo 2 of 2/i })).toBeInTheDocument();
  });

  it("strip is wrapped in a region with photo count in the label", () => {
    render(<PhotoGallery parkName="Test Park" photos={PHOTOS} />);
    const region = screen.getByRole("region");
    expect(region).toHaveAttribute("aria-label", "Test Park photo gallery, 2 photos");
  });

  it("singular 'photo' on count of 1", () => {
    render(<PhotoGallery parkName="Test" photos={[PHOTOS[0]!]} />);
    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-label",
      "Test photo gallery, 1 photo",
    );
  });

  it("dialog is rendered but closed before any thumbnail click", () => {
    const { container } = render(<PhotoGallery parkName="Test" photos={PHOTOS} />);
    const dialog = container.querySelector("dialog");
    // Lightbox renders nothing until open; before any click, dialog should not exist
    // in the DOM because the Lightbox returns null when open=false has a valid index.
    // (Our Lightbox renders the dialog even when open=false, so this asserts not-open.)
    if (dialog) {
      expect(dialog.hasAttribute("open")).toBe(false);
    }
  });

  it("clicking a thumbnail opens the lightbox at that index", () => {
    const { container } = render(<PhotoGallery parkName="Test Park" photos={PHOTOS} />);
    fireEvent.click(screen.getByRole("button", { name: /view photo 2 of 2/i }));
    const dialog = container.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  // Collage caps the visible tiles; the rest are reachable via the overflow tile.
  const MANY: LightboxPhoto[] = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1,
    storagePath: `parks/test/p${i + 1}`,
    caption: null,
    credit: null,
    altText: `photo ${i + 1}`,
  }));

  it("caps the collage at 5 visible tiles with a '+N more' overflow control", () => {
    render(<PhotoGallery parkName="Test" photos={MANY} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    // The 5th tile is the overflow control — labelled "Show all N photos", and
    // it visibly reads "+2 more" (7 total − 5 shown).
    expect(screen.getByRole("button", { name: /show all 7 photos/i })).toBeInTheDocument();
    expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
    // The plain per-photo tiles keep their "view photo" labels.
    expect(screen.getByRole("button", { name: /view photo 1 of 7/i })).toBeInTheDocument();
  });

  it("the overflow control opens the lightbox", () => {
    const { container } = render(<PhotoGallery parkName="Test" photos={MANY} />);
    fireEvent.click(screen.getByRole("button", { name: /show all 7 photos/i }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });

  it("shows every photo as its own tile when the set fits (4)", () => {
    render(<PhotoGallery parkName="Test" photos={MANY.slice(0, 4)} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });
});
