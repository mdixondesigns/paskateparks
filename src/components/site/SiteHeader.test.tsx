import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteHeader } from "./SiteHeader";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("SiteHeader", () => {
  it("renders the wordmark as a link to the homepage", () => {
    render(<SiteHeader />);
    const wordmark = screen.getByRole("link", { name: /pa skateparks/i });
    expect(wordmark).toHaveAttribute("href", "/");
  });

  it("wraps nav links in a <nav aria-label='Primary'>", () => {
    const { container } = render(<SiteHeader />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("aria-label", "Primary");
  });

  it("ships no 'use client' directive (keeps wordmark + layout on the server)", () => {
    const source = readFileSync(resolve(__dirname, "SiteHeader.tsx"), "utf8");
    expect(source.split("\n", 1)[0]).not.toMatch(/^['"]use client['"]/);
  });
});
