import type { EntryKind } from "./types.js";

export interface IconThemeManifest {
  iconDefinitions?: Record<string, unknown>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  rootFolder?: string;
  rootFolderExpanded?: string;
  rootFolderNames?: Record<string, string>;
  rootFolderNamesExpanded?: Record<string, string>;
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

const TABLES = [
  "fileNames",
  "fileExtensions",
  "folderNames",
  "folderNamesExpanded",
  "rootFolderNames",
  "rootFolderNamesExpanded",
  "languageIds",
] as const;

function merged(manifest: IconThemeManifest, variant: IconVariant): IconThemeManifest {
  if (variant === "dark") return manifest;
  const override = manifest[variant];
  if (!override) return manifest;
  const result: IconThemeManifest = { ...manifest, ...override };
  for (const table of TABLES) {
    if (manifest[table] && override[table]) {
      result[table] = { ...manifest[table], ...override[table] };
    }
  }
  return result;
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
        if (isRoot) {
          const rootNamed = expanded
            ? (lookup(theme.rootFolderNamesExpanded, lowered) ??
              lookup(theme.rootFolderNames, lowered))
            : lookup(theme.rootFolderNames, lowered);
          if (rootNamed) return rootNamed;
          const root = expanded ? theme.rootFolderExpanded : theme.rootFolder;
          if (root) return root;
        }
        const named = expanded
          ? (lookup(theme.folderNamesExpanded, lowered) ?? lookup(theme.folderNames, lowered))
          : lookup(theme.folderNames, lowered);
        if (named) return named;
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
