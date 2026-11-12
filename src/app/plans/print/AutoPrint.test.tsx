// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import AutoPrint from "./AutoPrint";

afterEach(cleanup);

describe("AutoPrint", () => {
  it("opens the browser print dialog once the page has mounted", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<AutoPrint />);
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
