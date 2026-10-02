import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const THEMES = [
  {
    name: "material",
    constant: "MATERIAL",
    packageDir: "node_modules/material-icon-theme",
    manifest: "dist/material-icons.json",
    dangling: [],
  },
  {
    name: "symbols",
    constant: "SYMBOLS",
    packageDir: "node_modules/vscode-symbols",
    manifest: "src/symbol-icon-theme.json",
    dangling: ["less", "yml"],
  },
];

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

function build(config) {
  const manifestPath = join(config.packageDir, config.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const dropped = new Set();

  function section(source) {
    const result = {};
    for (const key of SINGLES) {
      if (source[key] === undefined) continue;
      if (!manifest.iconDefinitions[source[key]]) {
        throw new Error(`${config.name}: ${key} references ${source[key]} without a definition`);
      }
      result[key] = source[key];
    }
    for (const key of TABLES) {
      if (!source[key]) continue;
      const table = {};
      for (const [name, id] of Object.entries(source[key])) {
        if (manifest.iconDefinitions[id]) {
          table[name] = id;
        } else if (config.dangling.includes(id)) {
          dropped.add(id);
        } else {
          throw new Error(`${config.name}: ${key}.${name} references ${id} without a definition`);
        }
      }
      result[key] = table;
    }
    return result;
  }

  const theme = {
    ...section(manifest),
    light: section(manifest.light ?? {}),
    highContrast: section(manifest.highContrast ?? {}),
  };

  const used = new Set();
  for (const part of [theme, theme.light, theme.highContrast]) {
    for (const key of SINGLES) if (part[key]) used.add(part[key]);
    for (const key of TABLES) for (const id of Object.values(part[key] ?? {})) used.add(id);
  }

  const files = {};
  const sources = {};
  for (const id of [...used].sort()) {
    const source = resolve(dirname(manifestPath), manifest.iconDefinitions[id].iconPath.trim());
    if (!existsSync(source)) throw new Error(`${config.name}: ${source} does not exist`);
    const file = basename(source, ".svg");
    if (sources[file] && sources[file] !== source) {
      throw new Error(`${config.name}: two icons share the file name ${file}`);
    }
    sources[file] = source;
    if (file !== id) files[id] = file;
  }

  const output = `import type { IconThemeManifest } from "../core/icons.js";

export const ${config.constant}_THEME: IconThemeManifest = ${JSON.stringify(theme, null, 1)};

export const ${config.constant}_FILES: Record<string, string> = ${JSON.stringify(files, null, 1)};
`;
  return { output, sources, dropped };
}

const mode = process.argv[2];
let stale = false;
for (const config of THEMES) {
  const { output, sources, dropped } = build(config);
  const target = `src/icons/${config.name}.generated.ts`;
  if (mode === "--check") {
    if (readFileSync(target, "utf8") !== output) {
      console.error(`${target} is stale, run bun run gen:icons`);
      stale = true;
    }
  } else if (mode === "--copy") {
    const out = `dist/icons/${config.name}`;
    mkdirSync(out, { recursive: true });
    for (const [file, source] of Object.entries(sources))
      copyFileSync(source, join(out, `${file}.svg`));
    copyFileSync(join(config.packageDir, "LICENSE"), join(out, "LICENSE"));
  } else {
    mkdirSync("src/icons", { recursive: true });
    writeFileSync(target, output);
    if (dropped.size > 0)
      console.log(`${config.name}: dropped ${[...dropped].join(", ")}, upstream defines no icon`);
  }
}
if (stale) process.exit(1);
if (mode === "--check") console.log("icons: generated themes are current");
