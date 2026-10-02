import type { IconThemeManifest } from "../core/icons.js";

export interface BundledIcons {
  iconTheme: IconThemeManifest;
  iconUrl: (definition: string) => string;
}

export function bundledIcons(
  theme: IconThemeManifest,
  files: Record<string, string>,
  base: string,
): BundledIcons {
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    iconTheme: theme,
    iconUrl: (definition) =>
      `${root}${Object.hasOwn(files, definition) ? files[definition] : definition}.svg`,
  };
}
