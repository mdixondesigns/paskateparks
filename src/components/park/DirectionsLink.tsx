"use client";

import { useEffect, useState } from "react";

interface Props {
  parkName: string;
  lat: number;
  lng: number;
  fullAddress: string;
}

// Universal cross-platform link — opens the Google Maps app if installed,
// else falls back to Google Maps on the web. Works on Android, desktop, and
// iPhones without the app.
function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function appleMapsUrl(parkName: string, lat: number, lng: number): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(parkName)}&ll=${lat},${lng}`;
}

// Google Maps by default (matches the P0 "parent on Android in a parking
// lot" case and works everywhere with zero JS). iPhones get swapped to
// Apple Maps after mount — their native maps app, and the one most iPhone
// users expect "Get directions" to open. Starting from the Google href on
// both server and initial client render avoids a hydration mismatch.
export function DirectionsLink({ parkName, lat, lng, fullAddress }: Props) {
  const [href, setHref] = useState(() => googleMapsUrl(lat, lng));

  useEffect(() => {
    if (/iPhone/.test(navigator.userAgent)) {
      setHref(appleMapsUrl(parkName, lat, lng));
    }
  }, [parkName, lat, lng]);

  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      aria-label={`Get directions to ${fullAddress} (opens in your maps app)`}
    >
      Get directions →
    </a>
  );
}
