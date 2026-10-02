import { spawnSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "commit-lint-"));

function run(message: string): { status: number | null; stderr: string } {
  const file = join(dir, "message");
  writeFileSync(file, message);
  const result = spawnSync("node", ["scripts/commit-lint.mjs", file], { encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
}

describe("commit message lint", () => {
  it.each([
    "feat(icons): add an opt in theme",
    "fix: handle a missing root",
    "chore(deps)!: drop a dependency",
    "Merge pull request #1 from jensen-org/develop",
    'Revert "feat: add a thing"',
    "docs: explain hooks\n\nA body line.\n# a comment git strips",
  ])("accepts %j", (message) => {
    expect(run(message).status).toBe(0);
  });

  it.each([
    ["", "empty"],
    ["add a thing", "header must look like"],
    ["feature: add a thing", 'type "feature"'],
    ["feat(unknown): add a thing", 'scope "unknown"'],
    ["feat: Add a thing", "lower case"],
    ["feat: add a thing.", "period"],
    [`feat: ${"x".repeat(100)}`, "limit is 100"],
  ])("rejects %j", (message, reason) => {
    const result = run(message);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(reason === "empty" ? "empty" : reason);
  });
});

describe("git hooks", () => {
  it.each(["pre-commit", "commit-msg", "pre-push"])("%s is executable", (hook) => {
    expect(statSync(`.githooks/${hook}`).mode & 0o111).not.toBe(0);
  });
});
