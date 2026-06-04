import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Phase 1 scaffold — homepage placeholder", () => {
  it("renders the page heading", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Pennsylvania Skateparks/i }),
    ).toBeInTheDocument();
  });

  it("renders inside a <main> landmark with id 'main' (skip-link target)", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main#main");
    expect(main).not.toBeNull();
  });
});
