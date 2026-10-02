import { type BundledIcons, bundledIcons } from "./bundled.js";
import { SYMBOLS_FILES, SYMBOLS_THEME } from "./symbols.generated.js";

export type SymbolsIcons = BundledIcons;

const BUNDLED_BASE = new URL("./symbols/", import.meta.url).href;

export function symbolsIcons(baseUrl: string = BUNDLED_BASE): SymbolsIcons {
  return bundledIcons(SYMBOLS_THEME, SYMBOLS_FILES, baseUrl);
}
