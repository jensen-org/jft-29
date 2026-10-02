import { describe, expect, it } from "vitest";
import { trimTrailing } from "../../src/core/paths";

describe("trimTrailing", () => {
  it("drops trailing slashes and keeps the root", () => {
    expect(trimTrailing("/p/src///")).toBe("/p/src");
    expect(trimTrailing("/p")).toBe("/p");
    expect(trimTrailing("///")).toBe("/");
    expect(trimTrailing("/")).toBe("/");
  });

  it("stays linear on a long run of slashes that does not end the string", () => {
    const hostile = `a${"/".repeat(200_000)}b`;
    const started = performance.now();
    expect(trimTrailing(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
