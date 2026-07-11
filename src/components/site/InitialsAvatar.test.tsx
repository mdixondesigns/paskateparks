import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { avatarColor, initialsFrom, InitialsAvatar } from "./InitialsAvatar";

describe("avatarColor", () => {
  it("is deterministic — same id always maps to the same color", () => {
    const id = "572475d9-c8dd-46e6-86ac-67ef8ee39eed";
    expect(avatarColor(id)).toEqual(avatarColor(id));
  });

  it("returns a palette entry for any id shape", () => {
    for (const id of ["", "x", "0000", crypto.randomUUID()]) {
      const { bg, fg } = avatarColor(id);
      expect(bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(fg).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("initialsFrom", () => {
  it("two names → first + last initials", () => {
    expect(initialsFrom("Mike Dixon")).toBe("MD");
  });

  it("single name → one initial", () => {
    expect(initialsFrom("Skater")).toBe("S");
  });

  it("three names → first + LAST, not middle", () => {
    expect(initialsFrom("Mary Jo Kopechne")).toBe("MK");
  });

  it("emoji-leading name keeps the emoji whole (surrogate pairs)", () => {
    expect(initialsFrom("🛹 Rider")).toBe("🛹R");
  });

  it("empty / whitespace-only → fallback ?", () => {
    expect(initialsFrom("")).toBe("?");
    expect(initialsFrom("   ")).toBe("?");
  });

  it("lowercases input still renders uppercase initials", () => {
    expect(initialsFrom("mike dixon")).toBe("MD");
  });
});

describe("InitialsAvatar", () => {
  it("renders the initials, hidden from the accessibility tree", () => {
    const { container } = render(
      <InitialsAvatar userId="abc-123" displayName="Mike Dixon" />,
    );
    expect(screen.queryByText("MD")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("respects the 14px font-size floor at small sizes (VISUAL-DESIGN §17)", () => {
    render(<InitialsAvatar userId="abc-123" displayName="Mike Dixon" size={24} />);
    const el = screen.getByText("MD");
    expect(Number.parseInt(el.style.fontSize, 10)).toBeGreaterThanOrEqual(14);
  });
});
