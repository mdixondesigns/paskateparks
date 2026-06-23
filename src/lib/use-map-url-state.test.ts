import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseMapUrlState, useMapUrlState } from "./use-map-url-state";

// Mock next/navigation. useRouter().replace is the only mutator; we capture
// its calls to assert what URL the hook wrote. useSearchParams returns a
// URLSearchParams-shaped object — happy-dom's URLSearchParams satisfies the
// .get(key) contract the hook needs.
const replaceMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => currentSearchParams,
}));

beforeEach(() => {
  replaceMock.mockClear();
  currentSearchParams = new URLSearchParams();
  vi.useRealTimers();
});

describe("parseMapUrlState — pure validation", () => {
  it("returns a valid view when lat/lng/zoom are sane", () => {
    const r = parseMapUrlState(new URLSearchParams("lat=40.5&lng=-77.5&zoom=10"));
    expect(r.view).toEqual({ lat: 40.5, lng: -77.5, zoom: 10 });
  });

  it("returns null view when any param is missing", () => {
    expect(parseMapUrlState(new URLSearchParams("lat=40&lng=-77")).view).toBeNull();
    expect(parseMapUrlState(new URLSearchParams("lat=40&zoom=8")).view).toBeNull();
    expect(parseMapUrlState(new URLSearchParams("")).view).toBeNull();
  });

  it("returns null view when any param is NaN", () => {
    expect(parseMapUrlState(new URLSearchParams("lat=abc&lng=-77&zoom=10")).view).toBeNull();
    expect(parseMapUrlState(new URLSearchParams("lat=40&lng=xyz&zoom=10")).view).toBeNull();
    expect(parseMapUrlState(new URLSearchParams("lat=40&lng=-77&zoom=foo")).view).toBeNull();
  });

  it("returns null view when lat/lng are outside PA bounds", () => {
    expect(parseMapUrlState(new URLSearchParams("lat=99&lng=-77&zoom=10")).view).toBeNull();
    expect(parseMapUrlState(new URLSearchParams("lat=40&lng=-200&zoom=10")).view).toBeNull();
    // Edge of Lake Erie shoreline — should pass.
    expect(parseMapUrlState(new URLSearchParams("lat=42.8&lng=-80.0&zoom=10")).view).not.toBeNull();
  });

  it("returns null view when zoom is out of [5,18]", () => {
    expect(parseMapUrlState(new URLSearchParams("lat=40&lng=-77&zoom=2")).view).toBeNull();
    expect(parseMapUrlState(new URLSearchParams("lat=40&lng=-77&zoom=30")).view).toBeNull();
  });

  it("ignores stale filtered=1 from URLs in the wild (legacy param, no longer honored)", () => {
    // The bbox filter shipped briefly in phase 10; older shared links may
    // still carry filtered=1. parseMapUrlState now ignores it — viewport
    // alone determines initialView; the list always reflects the current
    // map center via sort, never a filter.
    const r = parseMapUrlState(new URLSearchParams("lat=40&lng=-77&zoom=10&filtered=1"));
    expect(r.view).toEqual({ lat: 40, lng: -77, zoom: 10 });
  });
});

describe("useMapUrlState — React hook integration", () => {
  it("exposes initialView from URL on mount", () => {
    currentSearchParams = new URLSearchParams("lat=40.5&lng=-77.5&zoom=10");
    const { result } = renderHook(() => useMapUrlState());
    expect(result.current.initialView).toEqual({ lat: 40.5, lng: -77.5, zoom: 10 });
  });

  it("initialView is null when URL params are absent", () => {
    currentSearchParams = new URLSearchParams("");
    const { result } = renderHook(() => useMapUrlState());
    expect(result.current.initialView).toBeNull();
  });

  it("writeViewport does NOT call router.replace when isUserDriven=false (default)", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMapUrlState());
    act(() => {
      result.current.writeViewport({ lat: 40, lng: -77, zoom: 9 });
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("writeViewport calls router.replace after debounce when isUserDriven=true", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMapUrlState());
    act(() => {
      result.current.setUserDriven(true);
      result.current.writeViewport({ lat: 40.5, lng: -77.5, zoom: 10 });
    });
    // Before debounce window
    await vi.advanceTimersByTimeAsync(100);
    expect(replaceMock).not.toHaveBeenCalled();
    // After debounce window
    await vi.advanceTimersByTimeAsync(300);
    expect(replaceMock).toHaveBeenCalledOnce();
    const [url] = replaceMock.mock.calls[0]!;
    expect(url).toContain("lat=40.5000");
    expect(url).toContain("lng=-77.5000");
    expect(url).toContain("zoom=10");
    expect(url).not.toContain("filtered");
  });

  it("rapid writes collapse to one router.replace (debounce)", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMapUrlState());
    act(() => {
      result.current.setUserDriven(true);
      result.current.writeViewport({ lat: 40, lng: -77, zoom: 9 });
      result.current.writeViewport({ lat: 41, lng: -77, zoom: 9 });
      result.current.writeViewport({ lat: 42, lng: -77, zoom: 9 });
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(replaceMock).toHaveBeenCalledOnce();
    const [url] = replaceMock.mock.calls[0]!;
    // Only the last value survives the debounce.
    expect(url).toContain("lat=42.0000");
  });
});
