import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useGeolocation } from "./use-geolocation";

// Mocked Geolocation lets us drive the state machine deterministically.
type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (err: {
  code: number;
  PERMISSION_DENIED: 1;
  POSITION_UNAVAILABLE: 2;
  TIMEOUT: 3;
}) => void;

interface MockGeolocation {
  getCurrentPosition: ReturnType<typeof vi.fn>;
}

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function installGeolocation(mock: MockGeolocation) {
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    geolocation: mock,
  });
}

describe("useGeolocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports supported=false when navigator.geolocation is undefined", () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, geolocation: undefined });
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.supported).toBe(false);
  });

  it("reports supported=true once mounted with geolocation available", async () => {
    installGeolocation({ getCurrentPosition: vi.fn() });
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.status).toBe("idle");
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("request() is a noop when unsupported", () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, geolocation: undefined });
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.request());
    expect(result.current.status).toBe("idle");
  });

  it("calls getCurrentPosition with explicit D10 options (timeout/maxAge/!highAccuracy)", async () => {
    const mock: MockGeolocation = { getCurrentPosition: vi.fn() };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(mock.getCurrentPosition).toHaveBeenCalledTimes(1);
    const opts = mock.getCurrentPosition.mock.calls[0]?.[2] as PositionOptions | undefined;
    expect(opts?.timeout).toBe(10_000);
    expect(opts?.maximumAge).toBe(60_000);
    expect(opts?.enableHighAccuracy).toBe(false);
  });

  it("transitions idle → pending → idle + location on a successful fix", async () => {
    let resolveSuccess: Success | null = null;
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        resolveSuccess = success;
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.status).toBe("pending");
    act(() => {
      resolveSuccess?.({ coords: { latitude: 39.95, longitude: -75.16 } });
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.location).toEqual({ lat: 39.95, lng: -75.16 });
    expect(result.current.error).toBeNull();
  });

  it("on PERMISSION_DENIED: status='denied', error='denied'", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((_s: Success, fail: Failure) => {
        fail({
          code: PERMISSION_DENIED,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.status).toBe("denied");
    expect(result.current.error).toBe("denied");
  });

  it("on TIMEOUT: status='error', error='timeout' (retry-clickable)", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((_s: Success, fail: Failure) => {
        fail({
          code: TIMEOUT,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("timeout");
  });

  it("on POSITION_UNAVAILABLE: status='error', error='unavailable'", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((_s: Success, fail: Failure) => {
        fail({
          code: POSITION_UNAVAILABLE,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("unavailable");
  });

  it("P1-B: rejects NaN coordinates as invalid (no location update)", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: Number.NaN, longitude: 0 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("invalid");
    expect(result.current.location).toBeNull();
  });

  it("P1-B: rejects out-of-bounds latitude (>90) as invalid", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 200, longitude: 0 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.error).toBe("invalid");
  });

  it("P1-B: rejects out-of-bounds longitude (<-180) as invalid", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 0, longitude: -200 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.error).toBe("invalid");
  });

  it("P1-B: rejects out-of-bounds latitude (<-90) as invalid (symmetric coverage)", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: -100, longitude: 0 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.error).toBe("invalid");
  });

  it("P1-B: rejects out-of-bounds longitude (>180) as invalid (symmetric coverage)", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 0, longitude: 200 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.error).toBe("invalid");
  });

  it("P1-B: accepts boundary coords (lat=-90, lng=-180)", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: -90, longitude: -180 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.location).toEqual({ lat: -90, lng: -180 });
    expect(result.current.error).toBeNull();
  });

  it("P1-B: accepts boundary coords (lat=90, lng=180)", async () => {
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 90, longitude: 180 } });
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.location).toEqual({ lat: 90, lng: 180 });
    expect(result.current.error).toBeNull();
  });

  it("clears the prior error when starting a new request", async () => {
    let mode: "fail" | "succeed" = "fail";
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success, fail: Failure) => {
        if (mode === "fail") {
          fail({
            code: TIMEOUT,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        } else {
          success({ coords: { latitude: 39.95, longitude: -75.16 } });
        }
      }),
    };
    installGeolocation(mock);
    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.request());
    expect(result.current.error).toBe("timeout");
    mode = "succeed";
    act(() => result.current.request());
    expect(result.current.error).toBeNull();
    expect(result.current.location).toEqual({ lat: 39.95, lng: -75.16 });
  });
});
