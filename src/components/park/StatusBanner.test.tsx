import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatusBanner } from "./StatusBanner";

describe("StatusBanner — D11 conditional rendering", () => {
  it("renders nothing when status is open", () => {
    const { container } = render(
      <StatusBanner status="open" reopenExpectedAt={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a role=alert banner for temporarily_closed", () => {
    render(<StatusBanner status="temporarily_closed" reopenExpectedAt={null} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/NOTE FROM THE EDITOR/i);
    expect(alert).toHaveAttribute("data-status", "temporarily_closed");
  });

  it("includes the expected reopen date when present (temporarily_closed)", () => {
    render(
      <StatusBanner
        status="temporarily_closed"
        // The schema's `date` column comes back as a string at runtime.
        reopenExpectedAt="2026-08-15"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/2026-08-15/);
  });

  it("renders a permanent-closure banner for permanently_closed", () => {
    render(<StatusBanner status="permanently_closed" reopenExpectedAt={null} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/NO LONGER OPEN/i);
    expect(alert).toHaveTextContent(/historical record/i);
    expect(alert).toHaveAttribute("data-status", "permanently_closed");
  });
});
