import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const root = "dist/types";
for (const file of walk(root)) {
  if (file.endsWith(".vue.d.ts")) renameSync(file, file.replace(/\.vue\.d\.ts$/, ".d.ts"));
}
for (const file of walk(root)) {
  const source = readFileSync(file, "utf8");
  const next = source.replace(/(["'])(\.{1,2}\/[^"']+)\.vue\1/g, "$1$2.js$1");
  if (next !== source) writeFileSync(file, next);
}
