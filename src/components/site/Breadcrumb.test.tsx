import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Breadcrumb } from "./Breadcrumb";

const TRAIL = [
  { name: "Pennsylvania Skateparks", url: "/" },
  { name: "Bucks County", url: "/county/bucks" },
  { name: "9th and Poplar", url: "/park/9th-and-poplar" },
] as const;

describe("Breadcrumb", () => {
  it("renders nav with aria-label='Breadcrumb'", () => {
    const { container } = render(<Breadcrumb trail={[TRAIL[0], TRAIL[1]]} />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav).toHaveAttribute("aria-label", "Breadcrumb");
  });

  it("by default, renders ancestors as links and the last entry as aria-current", () => {
    render(<Breadcrumb trail={[TRAIL[0], TRAIL[1]]} />);
    expect(screen.getByRole("link", { name: /pennsylvania skateparks/i })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /bucks county/i })).toBeNull();
    const current = screen.getByText(/bucks county/i);
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("with hideCurrent, drops the last entry from visible UI", () => {
    render(<Breadcrumb trail={TRAIL} hideCurrent />);
    expect(screen.getByRole("link", { name: /pennsylvania skateparks/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /bucks county/i })).toHaveAttribute("href", "/county/bucks");
    expect(screen.queryByText(/9th and poplar/i)).toBeNull();
    expect(screen.queryByText((_, el) => el?.getAttribute("aria-current") === "page")).toBeNull();
  });

  it("emits a <script type='application/ld+json'> with the full trail (hideCurrent does NOT shrink JSON-LD)", () => {
    const { container } = render(<Breadcrumb trail={TRAIL} hideCurrent />);
    const script = container.querySelector("script[type='application/ld+json']");
    expect(script).not.toBeNull();
    const payload = JSON.parse(script!.textContent!);
    expect(payload["@type"]).toBe("BreadcrumbList");
    expect(payload.itemListElement).toHaveLength(3);
    expect(payload.itemListElement[2].name).toBe("9th and Poplar");
  });

  it("separator between crumbs is aria-hidden", () => {
    const { container } = render(<Breadcrumb trail={TRAIL} hideCurrent />);
    const seps = container.querySelectorAll("[aria-hidden='true']");
    expect(seps.length).toBe(1);
    expect(seps[0]?.textContent).toContain("/");
  });

  it("returns null on empty trail", () => {
    const { container } = render(<Breadcrumb trail={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
