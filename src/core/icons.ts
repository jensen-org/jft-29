import type { EntryKind } from "./types.js";

export interface IconThemeManifest {
  iconDefinitions?: Record<string, unknown>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  fileNames?: Record<string, string>;
  fileExtensions?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  languageIds?: Record<string, string>;
  light?: Partial<IconThemeManifest>;
  highContrast?: Partial<IconThemeManifest>;
}

export interface IconQuery {
  name: string;
  kind: EntryKind;
  expanded?: boolean;
  isRoot?: boolean;
  languageId?: string;
}

export type IconVariant = "dark" | "light" | "highContrast";

export interface IconResolver {
  resolve(query: IconQuery): string | undefined;
}

type Table = Record<string, string> | undefined;

function lookup(table: Table, key: string): string | undefined {
  if (!table) return undefined;
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function merged(manifest: IconThemeManifest, variant: IconVariant): IconThemeManifest {
  if (variant === "dark") return manifest;
  const override = manifest[variant];
  return override ? { ...manifest, ...override } : manifest;
}

export function extensionsOf(name: string): string[] {
  const lowered = name.toLowerCase();
  const found: string[] = [];
  let at = lowered.indexOf(".");
  while (at !== -1) {
    const ext = lowered.slice(at + 1);
    if (ext) found.push(ext);
    at = lowered.indexOf(".", at + 1);
  }
  return found;
}

export function createIconResolver(
  manifest: IconThemeManifest,
  variant: IconVariant = "dark",
): IconResolver {
  const theme = merged(manifest, variant);
  return {
    resolve({ name, kind, expanded = false, isRoot = false, languageId }) {
      const lowered = name.toLowerCase();
      if (kind === "dir") {
        const named = expanded
          ? (lookup(theme.folderNamesExpanded, lowered) ?? lookup(theme.folderNames, lowered))
          : lookup(theme.folderNames, lowered);
        if (named) return named;
        if (isRoot) {
          const root = expanded ? theme.rootFolderExpanded : theme.rootFolder;
          if (root) return root;
        }
        return expanded ? (theme.folderExpanded ?? theme.folder) : theme.folder;
      }
      const byName = lookup(theme.fileNames, lowered);
      if (byName) return byName;
      for (const ext of extensionsOf(name)) {
        const byExt = lookup(theme.fileExtensions, ext);
        if (byExt) return byExt;
      }
      if (languageId) {
        const byLanguage = lookup(theme.languageIds, languageId);
        if (byLanguage) return byLanguage;
      }
      return theme.file;
    },
  };
}
