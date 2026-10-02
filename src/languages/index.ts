import { extensionsOf } from "../core/icons.js";
import type { TreePlugin } from "../core/types.js";
import { EXTENSIONS, FILE_NAMES } from "./data.generated.js";

export interface LanguageTable {
  fileNames?: Record<string, string>;
  extensions?: Record<string, string>;
}

function own(table: Record<string, string> | undefined, key: string): string | undefined {
  return table && Object.hasOwn(table, key) ? table[key] : undefined;
}

export function detectLanguage(name: string, overrides: LanguageTable = {}): string | undefined {
  const lowered = name.toLowerCase();
  const byName = own(overrides.fileNames, lowered) ?? own(FILE_NAMES, lowered);
  if (byName) return byName;
  for (const ext of extensionsOf(name)) {
    const found = own(overrides.extensions, ext) ?? own(EXTENSIONS, ext);
    if (found) return found;
  }
  return undefined;
}

export function languagePlugin(overrides: LanguageTable = {}): TreePlugin {
  return {
    name: "language",
    decorate(node) {
      if (node.kind !== "file") return;
      const language = detectLanguage(node.name, overrides);
      if (language) node.languageId = language;
    },
  };
}
