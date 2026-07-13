import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PrivacyPage from "./page";

// CMT-1 from plan-eng-review: a site that asks for location must have real
// privacy copy about location. These tests guard the copy from regressing
// back to a one-line placeholder, plus the account/processor disclosures added
// after user-accounts-v1 shipped.

describe("/privacy page (CMT-1: real geolocation handling copy)", () => {
  it("renders an h1", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: /privacy/i })).toBeInTheDocument();
  });

  it("includes a 'Your location' section header", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 2, name: /your location/i })).toBeInTheDocument();
  });

  it("explicitly states location is used in-browser only", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/inside your browser/i)).toBeInTheDocument();
  });

  it("explicitly states we do not store/transmit/share location", () => {
    render(<PrivacyPage />);
    const para = screen.getByText(/do not send your location to our servers/i);
    expect(para).toBeInTheDocument();
    expect(para.textContent).toMatch(/do not store/i);
    expect(para.textContent).toMatch(/do not transmit/i);
    expect(para.textContent).toMatch(/do not share/i);
  });

  it("provides a contact email", () => {
    render(<PrivacyPage />);
    const link = screen.getByRole("link", { name: /mike@paskateparks.com/i });
    expect(link).toHaveAttribute("href", "mailto:mike@paskateparks.com");
  });

  it("states no third-party analytics or tracking cookies", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 2, name: /cookies/i })).toBeInTheDocument();
    expect(screen.getByText(/does not run third-party analytics/i)).toBeInTheDocument();
  });

  it("discloses accounts + the processors we send data to", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 2, name: /accounts/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Supabase/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Vercel/)).toBeInTheDocument();
    expect(screen.getByText(/Resend/)).toBeInTheDocument();
  });

  it("renders inside the <main id='main'> landmark", () => {
    const { container } = render(<PrivacyPage />);
    expect(container.querySelector("main#main")).not.toBeNull();
  });
});
