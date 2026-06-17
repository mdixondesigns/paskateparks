import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Lightbox, type LightboxPhoto } from "./Lightbox";

// jsdom does not implement showModal/close on HTMLDialogElement. Stub them
// so the component's useEffect can call through without throwing. We track
// the open state on the dialog manually so .open reflects reality.
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
  { id: 1, storagePath: "parks/test/photo-01", caption: "First", credit: "by A", altText: null },
  { id: 2, storagePath: "parks/test/photo-02", caption: null, credit: null, altText: "second alt" },
  { id: 3, storagePath: "parks/test/photo-03", caption: "Third", credit: null, altText: null },
];

function renderLightbox(overrides: Partial<React.ComponentProps<typeof Lightbox>> = {}) {
  const onIndexChange = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <Lightbox
      open
      parkName="Test Park"
      photos={PHOTOS}
      index={0}
      onIndexChange={onIndexChange}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...utils, onIndexChange, onClose };
}

describe("Lightbox", () => {
  it("returns null when index is out of range", () => {
    const { container } = render(
      <Lightbox open photos={PHOTOS} parkName="x" index={99} onIndexChange={() => {}} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("dialog has aria-label naming the park", () => {
    const { container } = renderLightbox();
    const dialog = container.querySelector("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Test Park photo viewer");
  });

  it("ArrowRight advances index", () => {
    const { container, onIndexChange } = renderLightbox({ index: 0 });
    fireEvent.keyDown(container.querySelector("dialog")!, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("ArrowRight from last wraps to first", () => {
    const { container, onIndexChange } = renderLightbox({ index: 2 });
    fireEvent.keyDown(container.querySelector("dialog")!, { key: "ArrowRight" });
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("ArrowLeft retreats index", () => {
    const { container, onIndexChange } = renderLightbox({ index: 1 });
    fireEvent.keyDown(container.querySelector("dialog")!, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("ArrowLeft from first wraps to last", () => {
    const { container, onIndexChange } = renderLightbox({ index: 0 });
    fireEvent.keyDown(container.querySelector("dialog")!, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("Previous / Next buttons mirror keyboard behavior", () => {
    const { onIndexChange } = renderLightbox({ index: 1 });
    fireEvent.click(screen.getByRole("button", { name: /previous photo/i }));
    expect(onIndexChange).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: /next photo/i }));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("Close button calls onClose", () => {
    const { onClose } = renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: /close photo viewer/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("single-photo gallery hides Previous + Next buttons", () => {
    render(
      <Lightbox
        open
        parkName="Test"
        photos={[PHOTOS[0]!]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /previous photo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next photo/i })).toBeNull();
  });

  it("renders counter 'N of M'", () => {
    renderLightbox({ index: 1 });
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("renders caption + credit when present", () => {
    renderLightbox({ index: 0 });
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("by A")).toBeInTheDocument();
  });

  it("omits caption/credit block when photo has neither", () => {
    const { container } = renderLightbox({ index: 1 });
    expect(container.textContent).not.toContain("First");
    expect(container.textContent).not.toContain("by A");
  });

  it("emits neighbor preload <link> for index-1 and index+1 at 1200w", () => {
    renderLightbox({ index: 1 });
    // React 19 hoists <link> elements to document.head automatically.
    const links = document.head.querySelectorAll("link[rel='preload'][as='image']");
    expect(links).toHaveLength(2);
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("photo-01@1200w.jpg"))).toBe(true);
    expect(hrefs.some((h) => h?.includes("photo-03@1200w.jpg"))).toBe(true);
  });

  it("does not emit neighbor preload for single-photo gallery", () => {
    render(
      <Lightbox
        open
        parkName="Test"
        photos={[PHOTOS[0]!]}
        index={0}
        onIndexChange={() => {}}
        onClose={() => {}}
      />,
    );
    expect(document.head.querySelectorAll("link[rel='preload']")).toHaveLength(0);
  });

  it("touch swipe right (positive dx) goes to previous", () => {
    const { container, onIndexChange } = renderLightbox({ index: 1 });
    const swipeArea = container.querySelector("[onTouchStart], div.relative.flex.flex-1") as HTMLDivElement
      ?? container.querySelectorAll("div")[2]!;
    fireEvent.touchStart(swipeArea, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(swipeArea, { changedTouches: [{ clientX: 200, clientY: 210 }] });
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("touch swipe left (negative dx) goes to next", () => {
    const { container, onIndexChange } = renderLightbox({ index: 1 });
    const swipeArea = container.querySelectorAll("div")[2]!;
    fireEvent.touchStart(swipeArea, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(swipeArea, { changedTouches: [{ clientX: 100, clientY: 210 }] });
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it("vertical swipe (Δy > 80) is ignored", () => {
    const { container, onIndexChange } = renderLightbox({ index: 1 });
    const swipeArea = container.querySelectorAll("div")[2]!;
    fireEvent.touchStart(swipeArea, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(swipeArea, { changedTouches: [{ clientX: 200, clientY: 300 }] });
    expect(onIndexChange).not.toHaveBeenCalled();
  });
});
