import { describe, expect, it } from "vitest";
import { createTree } from "../../src/core/model";
import type { DirPage, Entry, TreeNode, TreeProvider } from "../../src/core/types";

const COUNT = 100_000;
const PAGE = 2_000;

const names = Array.from(
  { length: COUNT },
  (_, i) => `file-${String((i * 7919) % COUNT).padStart(6, "0")}.ts`,
);
const entries: Entry[] = names.map((name) => ({ name, kind: "file" }));

function flatProvider(): TreeProvider {
  return {
    async readDir() {
      return entries;
    },
  };
}

function pagedProvider(reads: number[]): TreeProvider {
  return {
    async readDir() {
      throw new Error("a paged provider must be read through readDirPage");
    },
    async readDirPage(_path, cursor): Promise<DirPage> {
      const start = cursor ?? 0;
      reads.push(start);
      const end = Math.min(start + PAGE, COUNT);
      return { entries: entries.slice(start, end), next: end < COUNT ? end : null };
    },
  };
}

function counted() {
  const calls = { compare: 0 };
  const sort = (a: TreeNode, b: TreeNode): number => {
    calls.compare += 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  };
  return { calls, sort };
}

describe("a folder of a hundred thousand files", () => {
  it("sorts once on load and never again for a single event", async () => {
    const { calls, sort } = counted();
    const tree = createTree({
      provider: flatProvider(),
      root: "/p",
      sort,
      schedule: (run) => run(),
    });
    await tree.start();
    expect(tree.rows()).toHaveLength(COUNT);
    expect(calls.compare).toBeLessThan(COUNT * 20);

    calls.compare = 0;
    tree.push([{ type: "add", path: "/p/zzz-new.ts", kind: "file" }]);
    tree.flush();
    expect(tree.rows()).toHaveLength(COUNT + 1);
    expect(calls.compare).toBeLessThan(40);
    expect(tree.rows().at(-1)?.node.path).toBe("/p/zzz-new.ts");
  }, 30_000);

  it("places a burst of adds with a binary search each, not a re-sort each", async () => {
    const { calls, sort } = counted();
    const tree = createTree({
      provider: flatProvider(),
      root: "/p",
      sort,
      schedule: (run) => run(),
    });
    await tree.start();
    calls.compare = 0;
    tree.push(
      Array.from({ length: 1_000 }, (_, i) => ({
        type: "add" as const,
        path: `/p/new-${String(i).padStart(4, "0")}.ts`,
        kind: "file" as const,
      })),
    );
    tree.flush();
    expect(calls.compare).toBeLessThan(1_000 * 40);
    const rows = tree.rows();
    expect(rows).toHaveLength(COUNT + 1_000);
    const sorted = rows.map((row) => row.node.name);
    expect(sorted).toEqual([...sorted].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  }, 30_000);

  it("keeps the same rows, and finds a row in one lookup, when only focus or selection moves", async () => {
    const tree = createTree({ provider: flatProvider(), root: "/p", schedule: (run) => run() });
    await tree.start();
    const before = tree.rows();
    tree.focus("/p/file-000500.ts");
    tree.select("/p/file-000500.ts");
    for (let step = 0; step < 50; step += 1) tree.handleKey({ key: "ArrowDown" });
    expect(tree.rows()).toBe(before);
    expect(tree.rowIndex("/p/file-000550.ts")).toBe(550);
    expect(tree.focused()).toBe("/p/file-000550.ts");
  }, 30_000);

  it("shows the first page at once and fills in the rest as pages arrive", async () => {
    const reads: number[] = [];
    const tree = createTree({
      provider: pagedProvider(reads),
      root: "/p",
      schedule: (run) => run(),
    });
    const sizes: number[] = [];
    tree.on("change", () => sizes.push(tree.get("/p")?.children?.length ?? 0));
    await tree.start();
    expect(reads).toEqual(Array.from({ length: COUNT / PAGE }, (_, i) => i * PAGE));
    const partial = sizes.filter((size) => size > 0 && size < COUNT);
    expect(partial.length).toBeGreaterThan(0);
    expect(partial[0]).toBeLessThanOrEqual(PAGE);
    expect(tree.get("/p")?.state).toBe("loaded");
    const rows = tree.rows();
    expect(rows).toHaveLength(COUNT);
    const sorted = rows.map((row) => row.node.name);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b)));
  }, 60_000);

  it("drops entries a reload no longer lists once its last page has arrived", async () => {
    let listing: Entry[] = [
      { name: "a.ts", kind: "file" },
      { name: "b.ts", kind: "file" },
      { name: "c.ts", kind: "file" },
    ];
    const provider: TreeProvider = {
      async readDir() {
        throw new Error("unused");
      },
      async readDirPage(_path, cursor) {
        const start = cursor ?? 0;
        return {
          entries: listing.slice(start, start + 2),
          next: start + 2 < listing.length ? start + 2 : null,
        };
      },
    };
    const tree = createTree({ provider, root: "/p", schedule: (run) => run() });
    await tree.start();
    expect(tree.rows().map((row) => row.node.name)).toEqual(["a.ts", "b.ts", "c.ts"]);
    listing = [
      { name: "b.ts", kind: "file" },
      { name: "d.ts", kind: "file" },
    ];
    await tree.invalidate("/p");
    expect(tree.rows().map((row) => row.node.name)).toEqual(["b.ts", "d.ts"]);
  });
});
