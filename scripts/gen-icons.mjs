import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const packageDir = "node_modules/material-icon-theme";
const manifest = JSON.parse(readFileSync(join(packageDir, "dist/material-icons.json"), "utf8"));

const TABLES = [
  "fileNames",
  "fileExtensions",
  "folderNames",
  "folderNamesExpanded",
  "rootFolderNames",
  "rootFolderNamesExpanded",
  "languageIds",
];
const SINGLES = ["file", "folder", "folderExpanded", "rootFolder", "rootFolderExpanded"];

function pick(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

const theme = {
  ...pick(manifest, [...SINGLES, ...TABLES]),
  light: pick(manifest.light ?? {}, [...SINGLES, ...TABLES]),
  highContrast: pick(manifest.highContrast ?? {}, [...SINGLES, ...TABLES]),
};

const used = new Set();
function collect(section) {
  for (const key of SINGLES) if (section[key]) used.add(section[key]);
  for (const key of TABLES) for (const id of Object.values(section[key] ?? {})) used.add(id);
}
collect(theme);
collect(theme.light);
collect(theme.highContrast);

const files = {};
for (const id of [...used].sort()) {
  const definition = manifest.iconDefinitions[id];
  if (!definition) throw new Error(`theme references ${id} without a definition`);
  const file = basename(definition.iconPath, ".svg");
  if (!existsSync(join(packageDir, "icons", `${file}.svg`))) {
    throw new Error(`${file}.svg is missing from material-icon-theme`);
  }
  if (file !== id) files[id] = file;
}

const output = `import type { IconThemeManifest } from "../core/icons.js";

export const MATERIAL_THEME: IconThemeManifest = ${JSON.stringify(theme, null, 1)};

export const MATERIAL_FILES: Record<string, string> = ${JSON.stringify(files, null, 1)};
`;

const target = "src/icons/material.generated.ts";
const mode = process.argv[2];
if (mode === "--check") {
  if (readFileSync(target, "utf8") !== output) {
    console.error(`${target} is stale, run bun run gen:icons`);
    process.exit(1);
  }
  console.log("icons: generated theme is current");
} else if (mode === "--copy") {
  const out = "dist/icons/material";
  mkdirSync(out, { recursive: true });
  for (const id of used) {
    const file = files[id] ?? id;
    copyFileSync(join(packageDir, "icons", `${file}.svg`), join(out, `${file}.svg`));
  }
  copyFileSync(join(packageDir, "LICENSE"), join(out, "LICENSE"));
} else {
  mkdirSync("src/icons", { recursive: true });
  writeFileSync(target, output);
}
