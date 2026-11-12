// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PrintPlanLink from "./PrintPlanLink";

afterEach(cleanup);

describe("PrintPlanLink", () => {
  it("opens the plan's printable page in a new tab", () => {
    render(<PrintPlanLink planId="7" />);
    const link = screen.getByRole("link", { name: /print/i });
    expect(link.getAttribute("href")).toBe("/plans/print?id=7");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
