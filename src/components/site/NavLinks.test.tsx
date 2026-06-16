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
  it("renders Map → /map and About → /about", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  });

  it("on /map: Map link is aria-current=page, About is not", () => {
    renderAt("/map");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });

  it("on a nested /map/... route: Map still counts as current", () => {
    renderAt("/map/details");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  });

  it("on /about: About link is aria-current=page, Map is not", () => {
    renderAt("/about");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Map" })).not.toHaveAttribute("aria-current");
  });

  it("on the homepage /: neither nav link is marked current", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Map" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });

  it("on an unrelated route (/park/fdr-skatepark): neither nav link is marked current", () => {
    renderAt("/park/fdr-skatepark");
    expect(screen.getByRole("link", { name: "Map" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });

  it("tolerates a null pathname (SSR pre-hydration)", () => {
    cleanup();
    renderAt(null);
    expect(screen.getByRole("link", { name: "Map" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "About" })).not.toHaveAttribute("aria-current");
  });
});
