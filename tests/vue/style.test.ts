import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/vue/style.css", "utf8");

describe("stylesheet theming", () => {
  it("follows the host color scheme, not the operating system preference", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("derives text and tone colors from light-dark", () => {
    for (const name of ["--jft-fg", "--jft-fg-muted", "--jft-tone-added", "--jft-tone-info"]) {
      expect(css).toMatch(new RegExp(`${name}:\\s*light-dark\\(`));
    }
  });
});
