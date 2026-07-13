import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ConnectSection } from "./ConnectSection";
import { SupportSection } from "./SupportSection";
import type { ParkWithRelations } from "@/lib/park-query";

type Link = ParkWithRelations["links"][number];

function link(partial: Pick<Link, "type" | "url"> & Partial<Link>): Link {
  return {
    id: 1,
    parkId: 1,
    label: null,
    sortOrder: 0,
    ...partial,
  };
}

describe("Connect/Support partitioning per D21/D23", () => {
  it("ConnectSection renders only connect-type links", () => {
    render(
      <ConnectSection
        links={[
          link({ id: 1, type: "website", url: "https://x.example" }),
          link({ id: 2, type: "instagram", url: "https://instagram.com/x" }),
          link({ id: 3, type: "gofundme", url: "https://gofundme.com/x" }),
          link({ id: 4, type: "patreon", url: "https://patreon.com/x" }),
        ]}
      />,
    );
    expect(screen.getByText("Website")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.queryByText("GoFundMe")).not.toBeInTheDocument();
    expect(screen.queryByText("Patreon")).not.toBeInTheDocument();
  });

  it("SupportSection renders only support-type links", () => {
    render(
      <SupportSection
        links={[
          link({ id: 1, type: "website", url: "https://x.example" }),
          link({ id: 2, type: "gofundme", url: "https://gofundme.com/x" }),
          link({ id: 3, type: "patreon", url: "https://patreon.com/x" }),
        ]}
      />,
    );
    expect(screen.queryByText("Website")).not.toBeInTheDocument();
    expect(screen.getByText("GoFundMe")).toBeInTheDocument();
    expect(screen.getByText("Patreon")).toBeInTheDocument();
  });

  it("ConnectSection hides silently when no matching links", () => {
    const { container } = render(
      <ConnectSection
        links={[link({ id: 1, type: "gofundme", url: "https://gofundme.com/x" })]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("SupportSection hides silently when no matching links", () => {
    const { container } = render(
      <SupportSection
        links={[link({ id: 1, type: "website", url: "https://x.example" })]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the per-link label override when present (e.g. @handle for IG)", () => {
    render(
      <ConnectSection
        links={[
          link({
            id: 1,
            type: "instagram",
            url: "https://instagram.com/fdrskatepark",
            label: "@fdrskatepark",
          }),
        ]}
      />,
    );
    expect(screen.getByText(/@fdrskatepark/)).toBeInTheDocument();
  });

  it("renders a platform icon in each link row", () => {
    const { container } = render(
      <ConnectSection links={[link({ id: 1, type: "facebook", url: "https://fb.com/x" })]} />,
    );
    expect(container.querySelector("a svg")).toBeInTheDocument();
  });

  it("keeps the platform name in the link's accessible name even when a handle is the visible label", () => {
    render(
      <ConnectSection
        links={[
          link({
            id: 1,
            type: "instagram",
            url: "https://instagram.com/fdrskatepark",
            label: "@fdrskatepark",
          }),
        ]}
      />,
    );
    // Visible text is the handle; the platform word is not spelled out visually...
    expect(screen.getByText("@fdrskatepark")).toBeInTheDocument();
    expect(screen.queryByText("Instagram")).not.toBeInTheDocument();
    // ...but the accessible name still announces the platform for screen readers.
    expect(
      screen.getByRole("link", { name: /Instagram: @fdrskatepark/i }),
    ).toBeInTheDocument();
  });
});
