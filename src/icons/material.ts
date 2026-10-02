import type { IconThemeManifest } from "../core/icons.js";
import { MATERIAL_FILES, MATERIAL_THEME } from "./material.generated.js";

export interface MaterialIcons {
  iconTheme: IconThemeManifest;
  iconUrl: (definition: string) => string;
}

const BUNDLED_BASE = new URL("./material/", import.meta.url).href;

export function materialIcons(baseUrl: string = BUNDLED_BASE): MaterialIcons {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    iconTheme: MATERIAL_THEME,
    iconUrl: (definition) => `${base}${MATERIAL_FILES[definition] ?? definition}.svg`,
  };
}
