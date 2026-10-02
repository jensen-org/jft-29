import { readFileSync, writeFileSync } from "node:fs";
import * as linguist from "linguist-languages";
import { EXTENSION_IDS, PREFERRED_EXTENSIONS, VSCODE_IDS } from "./language-rules.mjs";

const TYPE_RANK = { programming: 0, markup: 1, data: 2, prose: 3 };

function idOf(language, aliases) {
  return aliases[language.name] ?? language.name.toLowerCase().replace(/\s+/g, "");
}

function rank(language, key, field) {
  const first = language[field]?.[0]?.toLowerCase();
  const primary = first?.replace(/^\./, "") === key.replace(/^\./, "") ? 0 : 1;
  return [primary, TYPE_RANK[language.type] ?? 4, language.languageId];
}

function better(a, b, key, field) {
  const left = rank(a, key, field);
  const right = rank(b, key, field);
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return left[i] < right[i];
  }
  return a.name < b.name;
}

const languages = Object.values(linguist).filter((language) => language?.name);
const byName = new Map(languages.map((language) => [language.name, language]));

for (const name of Object.keys(VSCODE_IDS)) {
  if (!byName.has(name)) throw new Error(`VSCODE_IDS names unknown language ${name}`);
}

const extensionWinners = new Map();
for (const language of languages) {
  for (const raw of language.extensions ?? []) {
    const ext = raw.slice(1).toLowerCase();
    const current = extensionWinners.get(ext);
    if (!current || better(language, current, ext, "extensions"))
      extensionWinners.set(ext, language);
  }
}
for (const [ext, name] of Object.entries(PREFERRED_EXTENSIONS)) {
  const language = byName.get(name);
  if (!language) throw new Error(`PREFERRED_EXTENSIONS names unknown language ${name}`);
  extensionWinners.set(ext, language);
}

const fileNameWinners = new Map();
for (const language of languages) {
  for (const raw of language.filenames ?? []) {
    const name = raw.toLowerCase();
    const current = fileNameWinners.get(name);
    if (!current || better(language, current, name, "filenames"))
      fileNameWinners.set(name, language);
  }
}

function table(winners, literal = {}) {
  const entries = [...winners.entries()].map(([key, language]) => [
    key,
    idOf(language, VSCODE_IDS),
  ]);
  return Object.fromEntries(
    [...entries, ...Object.entries(literal)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

const output = `export const FILE_NAMES: Record<string, string> = ${JSON.stringify(table(fileNameWinners), null, 2)};

export const EXTENSIONS: Record<string, string> = ${JSON.stringify(table(extensionWinners, EXTENSION_IDS), null, 2)};
`;

const target = "src/languages/data.generated.ts";
if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8");
  if (current !== output) {
    console.error(`${target} is stale, run bun run gen:languages`);
    process.exit(1);
  }
  console.log("languages: generated table is current");
} else {
  writeFileSync(target, output);
}
