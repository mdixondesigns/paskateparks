import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders a <footer> landmark", () => {
    const { container } = render(<Footer />);
    expect(container.querySelector("footer")).not.toBeNull();
  });

  it("renders About + Privacy links pointing at the stub pages", () => {
    render(<Footer />);
    const about = screen.getByRole("link", { name: /about/i });
    const privacy = screen.getByRole("link", { name: /privacy/i });
    expect(about).toHaveAttribute("href", "/about");
    expect(privacy).toHaveAttribute("href", "/privacy");
  });

  it("does NOT render a /coaching link in v1 (D11)", () => {
    render(<Footer />);
    expect(screen.queryByRole("link", { name: /coaching/i })).not.toBeInTheDocument();
  });

  it("renders the copyright line with the current year", () => {
    render(<Footer />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`© ${year}`))).toBeInTheDocument();
  });
});
