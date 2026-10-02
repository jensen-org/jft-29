import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const failures = [];

if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
  failures.push("package.json must not declare dependencies");
}
const peers = Object.keys(manifest.peerDependencies ?? {});
if (peers.some((name) => name !== "vue")) {
  failures.push("vue is the only allowed peer dependency");
}

function sources(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|vue)$/.test(path) ? [path] : [];
  });
}

const bare = /(?:from|import)\s*\(?\s*["']([^./"'][^"']*)["']/g;
for (const file of sources("src").filter((path) => !path.endsWith(".generated.ts"))) {
  for (const match of readFileSync(file, "utf8").matchAll(bare)) {
    if (match[1] !== "vue") failures.push(`${file} imports ${match[1]}`);
  }
}

const optIn =
  /(?:from|import)\s*\(?\s*["'][^"']*(?:\/icons\/material|\/languages|\.generated)(?:\/index)?(?:\.js)?["']/;
for (const file of sources("src")) {
  const inOptIn =
    file.startsWith(join("src", "icons")) || file.startsWith(join("src", "languages"));
  if (!inOptIn && optIn.test(readFileSync(file, "utf8"))) {
    failures.push(`${file} imports an opt in module, only src/icons and src/languages may`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("deps: no runtime dependency, vue is the only peer");
