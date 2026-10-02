import { describe, expect, it } from "vitest";
import { bundledIcons } from "../../src/icons/bundled";

describe("bundled icons", () => {
  const { iconTheme, iconUrl } = bundledIcons({ file: "file" }, { latex: "latex.clone" }, "/i");

  it("exposes the theme it was given", () => {
    expect(iconTheme).toEqual({ file: "file" });
  });

  it("uses the mapped file name when the id differs from it", () => {
    expect(iconUrl("latex")).toBe("/i/latex.clone.svg");
    expect(iconUrl("rust")).toBe("/i/rust.svg");
  });

  it("ignores inherited object keys and a trailing slash on the base", () => {
    expect(iconUrl("constructor")).toBe("/i/constructor.svg");
    expect(bundledIcons({}, {}, "/i/").iconUrl("a")).toBe("/i/a.svg");
  });
});
