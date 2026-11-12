// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Student } from "./students";

let pathname = "/plans";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import TabBar from "./TabBar";

const PRIMARY: Student = { id: "xiami", name: "Xiami", emoji: "🎻", kind: "primary" };

afterEach(cleanup);

describe("TabBar", () => {
  it("shows the tabs on an ordinary page", () => {
    pathname = "/plans";
    render(<TabBar activeStudent={PRIMARY} otherStudent={null} />);
    expect(screen.getByText("Plans")).toBeTruthy();
  });

  it("stays out of the way on the printable plan page", () => {
    pathname = "/plans/print";
    render(<TabBar activeStudent={PRIMARY} otherStudent={null} />);
    expect(screen.queryByText("Plans")).toBeNull();
  });
});
