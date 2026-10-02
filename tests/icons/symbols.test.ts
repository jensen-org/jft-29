import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createIconResolver } from "../../src/core/icons";
import { symbolsIcons } from "../../src/icons/symbols";
import { SYMBOLS_THEME } from "../../src/icons/symbols.generated";

const { iconTheme, iconUrl } = symbolsIcons("/icons/symbols");
const query = (name: string, kind: "file" | "dir" = "file") => ({ name, kind });

describe("symbols icons", () => {
  const icons = createIconResolver(iconTheme);

  it("resolves files, folders and the defaults", () => {
    expect(icons.resolve(query("index.ts"))).toBe("ts");
    expect(icons.resolve(query("main.rs"))).toBe("rust");
    expect(icons.resolve(query("src", "dir"))).toBe("folder-orange-code");
    expect(icons.resolve(query("zzz", "dir"))).toBe("folder");
    expect(icons.resolve(query("unknown.zzzz"))).toBe("document");
  });

  it("builds a url under the given base", () => {
    expect(iconUrl("ts")).toBe("/icons/symbols/ts.svg");
    expect(symbolsIcons("/icons/symbols/").iconUrl("rust")).toBe("/icons/symbols/rust.svg");
  });

  it("has an svg file for every definition the theme can return", () => {
    const root = "node_modules/vscode-symbols/src";
    const upstream = JSON.parse(readFileSync(`${root}/symbol-icon-theme.json`, "utf8")) as {
      iconDefinitions: Record<string, { iconPath: string }>;
    };
    const ids = new Set<string>();
    for (const single of [SYMBOLS_THEME.file, SYMBOLS_THEME.folder]) if (single) ids.add(single);
    for (const table of [
      SYMBOLS_THEME.fileNames,
      SYMBOLS_THEME.fileExtensions,
      SYMBOLS_THEME.folderNames,
      SYMBOLS_THEME.languageIds,
    ]) {
      for (const id of Object.values(table ?? {})) ids.add(id);
    }
    const missing = [...ids].filter((id) => {
      const path = upstream.iconDefinitions[id]?.iconPath.trim();
      return !path || !existsSync(`${root}/${path}`);
    });
    expect(ids.size).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
