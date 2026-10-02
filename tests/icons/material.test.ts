import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createIconResolver } from "../../src/core/icons";
import { materialIcons } from "../../src/icons/material";
import { MATERIAL_FILES, MATERIAL_THEME } from "../../src/icons/material.generated";

const { iconTheme, iconUrl } = materialIcons("/icons/material");
const query = (name: string, kind: "file" | "dir" = "file", expanded = false) => ({
  name,
  kind,
  expanded,
});

describe("material icons", () => {
  it.each(["dark", "light"] as const)("resolves common names in the %s variant", (variant) => {
    const icons = createIconResolver(iconTheme, variant);
    expect(icons.resolve(query("index.ts"))).toBe("typescript");
    expect(icons.resolve(query("main.rs"))).toBe("rust");
    expect(icons.resolve(query("app.vue"))).toBe("vue");
    expect(icons.resolve(query("src", "dir"))).toBe("folder-src");
    expect(icons.resolve(query("src", "dir", true))).toBe("folder-src-open");
    expect(icons.resolve(query("unknown.zzzz"))).toBe("file");
  });

  it("only overrides what the light variant lists", () => {
    const icons = createIconResolver(iconTheme, "light");
    expect(icons.resolve(query("Cargo.toml"))).not.toBe("file");
    expect(icons.resolve(query("a.json"))).toBe(
      createIconResolver(iconTheme).resolve(query("a.json")),
    );
  });

  it("builds a url under the given base, whatever its trailing slash", () => {
    expect(iconUrl("typescript")).toBe("/icons/material/typescript.svg");
    expect(materialIcons("/icons/material/").iconUrl("rust")).toBe("/icons/material/rust.svg");
  });

  it("maps definitions whose file differs from their id", () => {
    const [id, file] = Object.entries(MATERIAL_FILES)[0] ?? [];
    expect(id).toBeDefined();
    expect(iconUrl(id as string)).toBe(`/icons/material/${file}.svg`);
  });

  it("has a vendored svg for every definition the theme can return", () => {
    const ids = new Set<string>();
    const sections = [
      MATERIAL_THEME,
      MATERIAL_THEME.light ?? {},
      MATERIAL_THEME.highContrast ?? {},
    ];
    for (const section of sections) {
      for (const single of [section.file, section.folder, section.folderExpanded]) {
        if (single) ids.add(single);
      }
      for (const table of [section.fileNames, section.fileExtensions, section.folderNames]) {
        for (const id of Object.values(table ?? {})) ids.add(id);
      }
    }
    const missing = [...ids].filter(
      (id) => !existsSync(`node_modules/material-icon-theme/icons/${MATERIAL_FILES[id] ?? id}.svg`),
    );
    expect(missing).toEqual([]);
  });
});
