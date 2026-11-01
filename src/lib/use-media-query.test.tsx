import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useMediaQuery } from "./use-media-query";

function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const add = vi.fn((_type: string, cb: () => void) => listeners.add(cb));
  const remove = vi.fn((_type: string, cb: () => void) => listeners.delete(cb));
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: add,
    removeEventListener: remove,
  })) as unknown as typeof window.matchMedia;
  return {
    add,
    remove,
    set(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("returns the current match", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(hover: hover)", true));
    expect(result.current).toBe(false);
  });

  it("updates when the media query changes", () => {
    const mm = installMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(hover: hover)", true));
    expect(result.current).toBe(true);
    act(() => mm.set(false));
    expect(result.current).toBe(false);
  });

  it("removes its listener on unmount", () => {
    const mm = installMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery("(hover: hover)", true));
    expect(mm.add).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    const added = mm.add.mock.calls[0]?.[1];
    expect(mm.remove).toHaveBeenCalledWith("change", added);
  });
});
