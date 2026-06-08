// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import GetReadyChecklist from "./GetReadyChecklist";

const baseItem = {
  id: "mouse-holes",
  description: "Three mouse holes on the bow hand",
  emoji: "🐭",
  category: "bow-hand",
};

describe("GetReadyChecklist image fallback", () => {
  it("renders the image when the item has one", () => {
    render(<GetReadyChecklist items={[{ ...baseItem, image: "/api/img/mouse-holes" }]} />);
    expect(screen.getByAltText("Three mouse holes on the bow hand")).toBeTruthy();
  });

  it("renders the emoji (not an image) when the item has no image", () => {
    render(<GetReadyChecklist items={[{ ...baseItem, image: null }]} />);
    expect(screen.queryByAltText("Three mouse holes on the bow hand")).toBeNull();
    expect(screen.getByText("🐭")).toBeTruthy();
  });
});
