import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryProvider } from "../../src/core/memory";
import { createTree } from "../../src/core/model";
import type { GitEntry, TreeError } from "../../src/core/types";
import { attachGit, type GitSource } from "../../src/git";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(entries: () => Promise<GitEntry[]>) {
  const provider = createMemoryProvider(["/p/a.ts", "/p/b.ts"], "/p");
  const tree = createTree({ provider, root: "/p", schedule: (run) => run() });
  await tree.start();
  let signal: () => void = () => {};
  let disposed = false;
  const read = vi.fn(entries);
  const source: GitSource = {
    read,
    watch(onChange) {
      signal = onChange;
      return {
        dispose: () => {
          disposed = true;
        },
      };
    },
  };
  const errors: TreeError[] = [];
  tree.on("error", (error) => errors.push(error));
  return { provider, tree, source, read, errors, signal: () => signal(), disposed: () => disposed };
}

const status = (tree: ReturnType<typeof createTree>, path: string) =>
  tree.rows().find((row) => row.node.path === path)?.status;

describe("attachGit", () => {
  it("reads once on attach and puts the result on the rows", async () => {
    const { tree, source, read } = await setup(async () => [
      { path: "/p/a.ts", status: "modified" },
    ]);
    attachGit(tree, source);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(status(tree, "/p/a.ts")).toBe("modified");
  });

  it("refreshes after the source signals, once for a burst", async () => {
    let current: GitEntry[] = [];
    const { tree, source, read, signal } = await setup(async () => current);
    attachGit(tree, source, { debounce: 100 });
    await vi.advanceTimersByTimeAsync(0);
    current = [{ path: "/p/b.ts", status: "untracked" }];
    signal();
    signal();
    signal();
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2);
    expect(status(tree, "/p/b.ts")).toBe("untracked");
  });

  it("refreshes when the file system watcher reports a change", async () => {
    const { tree, source, read, provider } = await setup(async () => []);
    attachGit(tree, source, { debounce: 100 });
    await vi.advanceTimersByTimeAsync(0);
    provider.emit([{ type: "change", path: "/p/a.ts" }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("refreshes after the tree itself creates a file", async () => {
    const { tree, source, read } = await setup(async () => []);
    attachGit(tree, source, { debounce: 100 });
    await vi.advanceTimersByTimeAsync(0);
    await tree.create("/p", "c.ts", "file");
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("runs one read at a time and reruns once for signals that arrive meanwhile", async () => {
    let release: () => void = () => {};
    let calls = 0;
    const { tree, source, signal } = await setup(() => {
      calls += 1;
      if (calls > 1) return Promise.resolve([]);
      return new Promise<GitEntry[]>((resolve) => {
        release = () => resolve([]);
      });
    });
    attachGit(tree, source, { debounce: 10 });
    await vi.advanceTimersByTimeAsync(0);
    signal();
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
  });

  it("reports a failed read as a typed git error and keeps going", async () => {
    let fail = true;
    const { tree, source, errors, signal } = await setup(async () => {
      if (fail) throw new Error("not a repository");
      return [{ path: "/p/a.ts", status: "added" }];
    });
    attachGit(tree, source, { debounce: 10 });
    await vi.advanceTimersByTimeAsync(0);
    expect(errors.map((error) => error.code)).toEqual(["git"]);
    fail = false;
    signal();
    await vi.advanceTimersByTimeAsync(10);
    expect(status(tree, "/p/a.ts")).toBe("added");
  });

  it("stops everything on dispose", async () => {
    const { tree, source, read, signal, disposed } = await setup(async () => []);
    const stop = attachGit(tree, source, { debounce: 10 });
    await vi.advanceTimersByTimeAsync(0);
    signal();
    stop();
    await vi.advanceTimersByTimeAsync(50);
    expect(read).toHaveBeenCalledTimes(1);
    expect(disposed()).toBe(true);
  });
});
