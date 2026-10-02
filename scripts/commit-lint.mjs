import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

export const SCOPES = [
  "core",
  "vue",
  "editor",
  "git",
  "languages",
  "icons",
  "playground",
  "deps",
  "ci",
  "docs",
  "scripts",
  "security",
  "release",
  "hooks",
];

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<subject>.+)$/;

export function lint(message) {
  const header = message.split("\n").find((line) => line.trim() !== "" && !line.startsWith("#"));
  if (header === undefined) return ["the commit message is empty"];
  if (/^(Merge|Revert) /.test(header)) return [];
  const match = HEADER.exec(header);
  if (!match) return [`header must look like type(scope): subject, got "${header}"`];
  const { type, scope, subject } = match.groups;
  const problems = [];
  if (!TYPES.includes(type)) problems.push(`type "${type}" is not one of ${TYPES.join(", ")}`);
  if (scope !== undefined && !SCOPES.includes(scope)) {
    problems.push(`scope "${scope}" is not one of ${SCOPES.join(", ")}`);
  }
  if (header.length > 100) problems.push(`header is ${header.length} characters, the limit is 100`);
  if (subject.endsWith(".")) problems.push("subject must not end with a period");
  if (/^[A-Z]/.test(subject)) problems.push("subject must start in lower case");
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("commit-lint: pass the commit message file");
    process.exit(2);
  }
  const problems = lint(readFileSync(file, "utf8"));
  if (problems.length > 0) {
    console.error(problems.map((problem) => `commit-lint: ${problem}`).join("\n"));
    process.exit(1);
  }
}
