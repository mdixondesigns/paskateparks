import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NearMeButton } from "./NearMeButton";

// Mocked Geolocation lets us drive the state machine deterministically.
type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (err: { code: number; PERMISSION_DENIED: 1; POSITION_UNAVAILABLE: 2; TIMEOUT: 3 }) => void;

interface MockGeolocation {
  getCurrentPosition: ReturnType<typeof vi.fn>;
}

// GeolocationPositionError numeric codes (per W3C Geolocation API spec).
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function installGeolocation(mock: MockGeolocation) {
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    geolocation: mock,
  });
}

function uninstallGeolocation() {
  vi.unstubAllGlobals();
}

describe("NearMeButton", () => {
  afterEach(() => {
    uninstallGeolocation();
  });

  it("renders nothing when navigator.geolocation is undefined", () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, geolocation: undefined });
    const { container } = render(<NearMeButton onLocation={vi.fn()} onError={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the idle label when geolocation is supported", async () => {
    const mock: MockGeolocation = { getCurrentPosition: vi.fn() };
    installGeolocation(mock);
    render(<NearMeButton onLocation={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /find parks near me/i })).toBeInTheDocument();
  });

  it("calls getCurrentPosition with explicit timeout + maximumAge per D10", async () => {
    const mock: MockGeolocation = { getCurrentPosition: vi.fn() };
    installGeolocation(mock);
    render(<NearMeButton onLocation={vi.fn()} onError={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button"));
    expect(mock.getCurrentPosition).toHaveBeenCalledTimes(1);
    const opts = mock.getCurrentPosition.mock.calls[0]?.[2] as PositionOptions | undefined;
    expect(opts?.timeout).toBe(10_000);
    expect(opts?.maximumAge).toBe(60_000);
    expect(opts?.enableHighAccuracy).toBe(false);
  });

  it("shows the pending label while the request is in flight (aria-busy=true)", async () => {
    const mock: MockGeolocation = { getCurrentPosition: vi.fn() };
    installGeolocation(mock);
    render(<NearMeButton onLocation={vi.fn()} onError={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button"));
    const btn = await screen.findByRole("button", { name: /finding your location/i });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
  });

  it("on grant: calls onLocation(lat, lng) with valid coords and resets to idle", async () => {
    const onLocation = vi.fn();
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 39.95, longitude: -75.16 } });
      }),
    };
    installGeolocation(mock);
    render(<NearMeButton onLocation={onLocation} onError={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(onLocation).toHaveBeenCalledWith(39.95, -75.16));
    expect(await screen.findByRole("button", { name: /find parks near me/i })).toBeInTheDocument();
  });

  it("on permission denied: shows the denied label and disables the button", async () => {
    const onError = vi.fn();
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
    render(<NearMeButton onLocation={vi.fn()} onError={onError} />);
    fireEvent.click(await screen.findByRole("button"));
    expect(await screen.findByRole("button", { name: /location unavailable/i })).toBeDisabled();
    expect(onError).toHaveBeenCalledWith("denied");
  });

  it("on timeout: shows the error label, stays clickable for retry", async () => {
    const onError = vi.fn();
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
    render(<NearMeButton onLocation={vi.fn()} onError={onError} />);
    fireEvent.click(await screen.findByRole("button"));
    const btn = await screen.findByRole("button", { name: /couldn't get location/i });
    expect(btn).not.toBeDisabled();
    expect(onError).toHaveBeenCalledWith("timeout");
  });

  it("on POSITION_UNAVAILABLE: reports as 'unavailable'", async () => {
    const onError = vi.fn();
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
    render(<NearMeButton onLocation={vi.fn()} onError={onError} />);
    fireEvent.click(await screen.findByRole("button"));
    expect(await screen.findByRole("button", { name: /couldn't get location/i })).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("unavailable");
  });

  it("P1-B: rejects NaN coordinates as invalid", async () => {
    const onError = vi.fn();
    const onLocation = vi.fn();
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: Number.NaN, longitude: 0 } });
      }),
    };
    installGeolocation(mock);
    render(<NearMeButton onLocation={onLocation} onError={onError} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("invalid"));
    expect(onLocation).not.toHaveBeenCalled();
  });

  it("P1-B: rejects out-of-bounds latitude (>90) as invalid", async () => {
    const onError = vi.fn();
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 200, longitude: 0 } });
      }),
    };
    installGeolocation(mock);
    render(<NearMeButton onLocation={vi.fn()} onError={onError} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("invalid"));
  });

  it("P1-B: rejects out-of-bounds longitude (<-180) as invalid", async () => {
    const onError = vi.fn();
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 0, longitude: -200 } });
      }),
    };
    installGeolocation(mock);
    render(<NearMeButton onLocation={vi.fn()} onError={onError} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("invalid"));
  });

  it("P1-B: accepts boundary coordinates (lat=90, lng=180)", async () => {
    const onLocation = vi.fn();
    const mock: MockGeolocation = {
      getCurrentPosition: vi.fn((success: Success) => {
        success({ coords: { latitude: 90, longitude: 180 } });
      }),
    };
    installGeolocation(mock);
    render(<NearMeButton onLocation={onLocation} onError={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button"));
    await waitFor(() => expect(onLocation).toHaveBeenCalledWith(90, 180));
  });
});
