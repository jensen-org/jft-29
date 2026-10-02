import { extensionsOf } from "../core/icons.js";
import type { TreePlugin } from "../core/types.js";

export interface LanguageTable {
  fileNames?: Record<string, string>;
  extensions?: Record<string, string>;
}

const FILE_NAMES: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  "cmakelists.txt": "cmake",
  ".gitignore": "ignore",
  ".dockerignore": "ignore",
  ".env": "dotenv",
  ".bashrc": "shellscript",
  ".zshrc": "shellscript",
  "package.json": "json",
  "tsconfig.json": "jsonc",
  "cargo.toml": "toml",
  "go.mod": "go.mod",
};

const EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  "d.ts": "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  rs: "rust",
  go: "go",
  py: "python",
  pyi: "python",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  fish: "fish",
  ps1: "powershell",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  lua: "lua",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  scala: "scala",
  clj: "clojure",
  r: "r",
  pl: "perl",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto3",
  tf: "terraform",
  zig: "zig",
  nix: "nix",
  vim: "vim",
  ini: "ini",
  txt: "plaintext",
  csv: "csv",
  diff: "diff",
  patch: "diff",
};

export function detectLanguage(name: string, overrides: LanguageTable = {}): string | undefined {
  const lowered = name.toLowerCase();
  const byName = overrides.fileNames?.[lowered] ?? FILE_NAMES[lowered];
  if (byName) return byName;
  for (const ext of extensionsOf(name)) {
    const found = overrides.extensions?.[ext] ?? EXTENSIONS[ext];
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
