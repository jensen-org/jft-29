import { type BundledIcons, bundledIcons } from "./bundled.js";
import { MATERIAL_FILES, MATERIAL_THEME } from "./material.generated.js";

export type MaterialIcons = BundledIcons;

const BUNDLED_BASE = new URL("./material/", import.meta.url).href;

export function materialIcons(baseUrl: string = BUNDLED_BASE): MaterialIcons {
  return bundledIcons(MATERIAL_THEME, MATERIAL_FILES, baseUrl);
}
