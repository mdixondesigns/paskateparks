import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import AboutPage from "./page";

describe("/about page", () => {
  it("renders an h1 and the maintainer copy", () => {
    render(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: /about/i })).toBeInTheDocument();
    expect(screen.getByText(/free resource/i)).toBeInTheDocument();
  });

  it("links the contact email and Instagram", () => {
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: /mike@paskateparks\.com/i })).toHaveAttribute(
      "href",
      "mailto:mike@paskateparks.com",
    );
    expect(screen.getByRole("link", { name: "@paskateparks" })).toHaveAttribute(
      "href",
      "https://instagram.com/paskateparks",
    );
  });

  it("renders inside the <main id='main'> landmark", () => {
    const { container } = render(<AboutPage />);
    expect(container.querySelector("main#main")).not.toBeNull();
  });
});
