import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import AboutPage from "./page";

describe("/about stub page", () => {
  it("renders an h1 and placeholder copy", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: /about/i })).toBeInTheDocument();
    expect(screen.getByText(/directory of public skateparks/i)).toBeInTheDocument();
  });

  it("renders inside the <main id='main'> landmark", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelector("main#main")).not.toBeNull();
  });
});
