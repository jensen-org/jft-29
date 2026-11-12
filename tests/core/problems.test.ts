import { describe, expect, it, vi } from "vitest";
import { fileUriToPath, Problems } from "../../src/core/problems.js";

const diagnostics = (...severities: (number | undefined)[]) =>
  severities.map((severity) => ({ severity }));

describe("Problems from publishDiagnostics", () => {
  it("counts errors and warnings per file and treats a missing severity as an error", () => {
    const problems = new Problems();
    problems.publish("ra", {
      uri: "file:///p/a.rs",
      diagnostics: diagnostics(1, 1, 2, 3, 4, undefined),
    });
    expect(problems.counts().get("/p/a.rs")).toEqual({ errors: 3, warnings: 1 });
  });

  it("replaces a server's earlier answer and drops the file when it publishes none", () => {
    const problems = new Problems();
    problems.publish("ra", { uri: "file:///p/a.rs", diagnostics: diagnostics(1) });
    problems.publish("ra", { uri: "file:///p/a.rs", diagnostics: diagnostics(2) });
    expect(problems.counts().get("/p/a.rs")).toEqual({ errors: 0, warnings: 1 });
    problems.publish("ra", { uri: "file:///p/a.rs", diagnostics: [] });
    expect(problems.counts().size).toBe(0);
  });

  it("adds what several servers report for one file and forgets a server on clear", () => {
    const problems = new Problems();
    problems.publish("ra", { uri: "file:///p/a.ts", diagnostics: diagnostics(1) });
    problems.publish("eslint", { uri: "file:///p/a.ts", diagnostics: diagnostics(2) });
    expect(problems.counts().get("/p/a.ts")).toEqual({ errors: 1, warnings: 1 });
    problems.clear("ra");
    expect(problems.counts().get("/p/a.ts")).toEqual({ errors: 0, warnings: 1 });
  });

  it("notifies only when the counts change", () => {
    const problems = new Problems();
    const listener = vi.fn();
    problems.subscribe(listener);
    problems.publish("ra", { uri: "file:///p/a.rs", diagnostics: [] });
    problems.publish("ra", { uri: "file:///p/a.rs", diagnostics: diagnostics(1) });
    problems.publish("ra", { uri: "file:///p/a.rs", diagnostics: diagnostics(1) });
    problems.clear("other");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores uris that are not files and decodes the ones that are", () => {
    expect(fileUriToPath("untitled:Untitled-1")).toBeNull();
    expect(fileUriToPath("file:///p/a%20b.rs")).toBe("/p/a b.rs");
    expect(fileUriToPath("file:///C:/p/a.rs")).toBe("C:/p/a.rs");
    const problems = new Problems();
    problems.publish("ra", { uri: "untitled:x", diagnostics: diagnostics(1) });
    expect(problems.counts().size).toBe(0);
  });

  it("maps uris through a host function", () => {
    const problems = new Problems({ toPath: (uri) => uri.replace("vfs://", "/mnt/") });
    problems.publish("ra", { uri: "vfs://p/a.rs", diagnostics: diagnostics(1) });
    expect(problems.counts().has("/mnt/p/a.rs")).toBe(true);
  });
});
