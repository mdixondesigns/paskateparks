import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { NavLinks } from "./NavLinks";

const pathnameMock = vi.fn<() => string | null>();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

function renderAt(pathname: string | null) {
  pathnameMock.mockReturnValue(pathname);
  return render(<NavLinks />);
}

describe("NavLinks", () => {
  it("renders About → /about", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  });

  it("does NOT render a Map link (Plan A: /map retired in favor of synced layout on /)", () => {
    renderAt("/");
    expect(screen.queryByRole("link", { name: "Map" })).toBeNull();
  });

  it("on /about: About link is aria-current=page", () => {
    renderAt("/about");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
  });

  it("on the homepage /: About link is not marked current", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });

  it("on an unrelated route (/park/fdr-skatepark): About link is not marked current", () => {
    renderAt("/park/fdr-skatepark");
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });

  it("tolerates a null pathname (SSR pre-hydration)", () => {
    cleanup();
    renderAt(null);
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });
});
