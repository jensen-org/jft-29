import { describe, expect, it, vi } from "vitest";
import { createMemoryProvider } from "../../src/core/memory";
import { createTree } from "../../src/core/model";
import { TreeCancel, type TreeError } from "../../src/core/types";

const FILES = ["/p/src/a.ts", "/p/src/deep/er/b.ts", "/p/README.md", "/p/docs/"];

async function started(files = FILES, extra: Partial<Parameters<typeof createTree>[0]> = {}) {
  const provider = createMemoryProvider(files, "/p");
  const tree = createTree({ provider, root: "/p", schedule: (run) => run(), ...extra });
  const errors: TreeError[] = [];
  tree.on("error", (error) => errors.push(error));
  await tree.start();
  return { provider, tree, errors };
}

const names = (tree: ReturnType<typeof createTree>) =>
  tree.rows().map((row) => row.chain.map((node) => node.name).join("/"));

describe("loading", () => {
  it("lists the root with folders first and loads children lazily", async () => {
    const { tree, provider } = await started();
    expect(names(tree)).toEqual(["docs", "src", "README.md"]);
    expect(provider.reads()).toEqual(["/p"]);
    await tree.expand("/p/src");
    expect(names(tree)).toEqual(["docs", "src", "deep", "a.ts", "README.md"]);
  });

  it("shares one read between concurrent expands", async () => {
    const { tree, provider } = await started();
    await Promise.all([tree.expand("/p/src"), tree.expand("/p/src"), tree.load("/p/src")]);
    expect(provider.reads().filter((path) => path === "/p/src")).toHaveLength(1);
  });

  it("reports a failed read as a typed error and an error row", async () => {
    const { tree, provider, errors } = await started();
    provider.readDir = async () => {
      throw new Error("denied");
    };
    expect(await tree.expand("/p/src")).toBe(false);
    expect(errors[0]?.code).toBe("read");
    expect(tree.rows().find((row) => row.id === "/p/src")?.error).toBe(true);
  });

  it("exposes aria positions", async () => {
    const { tree } = await started();
    const rows = tree.rows();
    expect(rows.map((row) => [row.posInSet, row.setSize, row.depth])).toEqual([
      [1, 3, 0],
      [2, 3, 0],
      [3, 3, 0],
    ]);
  });
});

describe("watcher events", () => {
  it("adds a created file into a loaded folder", async () => {
    const { tree } = await started();
    tree.push([{ type: "add", path: "/p/new.ts", kind: "file" }]);
    expect(names(tree)).toContain("new.ts");
  });

  it("ignores events for folders that were never loaded", async () => {
    const { tree } = await started();
    tree.push([{ type: "add", path: "/p/src/new.ts", kind: "file" }]);
    await tree.expand("/p/src");
    expect(tree.get("/p/src/new.ts")).toBeUndefined();
  });

  it("treats a temp file plus rename as one new file", async () => {
    const { tree } = await started();
    tree.push([
      { type: "add", path: "/p/.x.tmp", kind: "file" },
      { type: "rename", from: "/p/.x.tmp", to: "/p/x.ts", kind: "file" },
    ]);
    expect(names(tree)).toContain("x.ts");
    expect(names(tree)).not.toContain(".x.tmp");
  });

  it("removes a deleted subtree and its expansion", async () => {
    const { tree } = await started();
    await tree.expand("/p/src");
    tree.push([{ type: "delete", path: "/p/src" }]);
    expect(tree.get("/p/src/a.ts")).toBeUndefined();
    expect(tree.isExpanded("/p/src")).toBe(false);
  });

  it("rekeys a renamed folder and keeps what was expanded", async () => {
    const { tree } = await started();
    await tree.expand("/p/src");
    tree.push([{ type: "rename", from: "/p/src", to: "/p/lib", kind: "dir" }]);
    expect(tree.isExpanded("/p/lib")).toBe(true);
    expect(tree.get("/p/lib/a.ts")?.parent).toBe("/p/lib");
    expect(tree.get("/p/src")).toBeUndefined();
  });

  it("refreshes by name diff so expansion survives a rescan", async () => {
    const { tree, provider } = await started();
    await tree.expand("/p/src");
    provider.add("/p/src/fresh.ts");
    tree.push([{ type: "rescan", path: "/p" }]);
    await tree.invalidate("/p", { deep: true });
    expect(tree.isExpanded("/p/src")).toBe(true);
    expect(names(tree)).toContain("fresh.ts");
  });

  it("holds events back while an edit box is open", async () => {
    const { tree } = await started();
    await tree.startCreate("/p", "file");
    tree.push([{ type: "add", path: "/p/held.ts", kind: "file" }]);
    expect(tree.get("/p/held.ts")).toBeUndefined();
    tree.cancelEdit();
    expect(tree.get("/p/held.ts")).toBeDefined();
  });

  it("batches through the scheduler", async () => {
    const queued: (() => void)[] = [];
    const { tree } = await started(FILES, { schedule: (run) => queued.push(run) });
    tree.push([{ type: "add", path: "/p/a1", kind: "file" }]);
    tree.push([{ type: "add", path: "/p/a2", kind: "file" }]);
    expect(queued).toHaveLength(1);
    expect(tree.get("/p/a1")).toBeUndefined();
    queued[0]?.();
    expect(tree.get("/p/a2")).toBeDefined();
  });
});

describe("optimistic writes", () => {
  it("inserts first and confirms when the provider resolves", async () => {
    const { tree, provider } = await started();
    const created: string[] = [];
    tree.on("created", ({ path }) => created.push(path));
    const done = tree.create("/p", "n.ts", "file");
    expect(tree.get("/p/n.ts")?.pending).toBe(true);
    expect(await done).toBe(true);
    expect(tree.get("/p/n.ts")?.pending).toBe(false);
    expect(provider.exists("/p/n.ts")).toBe(true);
    expect(created).toEqual(["/p/n.ts"]);
  });

  it("ignores the watcher echo of its own create", async () => {
    const { tree } = await started();
    await tree.create("/p", "n.ts", "file");
    tree.push([{ type: "add", path: "/p/n.ts", kind: "file" }]);
    expect(names(tree).filter((name) => name === "n.ts")).toHaveLength(1);
  });

  it("rolls back and reports when the provider fails", async () => {
    const { tree, provider, errors } = await started();
    provider.create = async () => {
      throw new Error("disk full");
    };
    expect(await tree.create("/p", "n.ts", "file")).toBe(false);
    expect(tree.get("/p/n.ts")).toBeUndefined();
    expect(errors[0]?.code).toBe("create");
  });

  it("rolls back silently on an explicit cancel", async () => {
    const { tree, provider, errors } = await started();
    provider.move = async () => {
      throw new TreeCancel();
    };
    expect(await tree.move("/p/README.md", "/p/docs")).toBe(false);
    expect(tree.get("/p/README.md")).toBeDefined();
    expect(errors).toEqual([]);
  });

  it("refuses invalid and duplicate names loudly", async () => {
    const { tree, errors } = await started();
    await tree.create("/p", "a/b", "file");
    await tree.create("/p", "README.md", "file");
    expect(errors.map((error) => error.code)).toEqual(["invalid-name", "exists"]);
  });

  it("restores a deleted subtree when the delete fails", async () => {
    const { tree, provider, errors } = await started();
    await tree.expand("/p/src");
    provider.remove = async () => {
      throw new Error("busy");
    };
    expect(await tree.remove("/p/src")).toBe(false);
    expect(tree.get("/p/src/a.ts")).toBeDefined();
    expect(tree.isExpanded("/p/src")).toBe(true);
    expect(errors[0]?.code).toBe("remove");
  });

  it("moves a folder into another and refuses moving it into itself", async () => {
    const { tree, errors } = await started();
    expect(await tree.move("/p/src", "/p/docs")).toBe(true);
    expect(tree.get("/p/docs/src")?.parent).toBe("/p/docs");
    expect(await tree.move("/p/docs", "/p/docs/src")).toBe(false);
    expect(errors.at(-1)?.code).toBe("move");
  });

  it("reports a write the provider does not support", async () => {
    const provider = createMemoryProvider(FILES, "/p");
    const bare = { readDir: provider.readDir };
    const tree = createTree({ provider: bare, root: "/p" });
    const errors: TreeError[] = [];
    tree.on("error", (error) => errors.push(error));
    await tree.start();
    expect(tree.can("create")).toBe(false);
    await tree.create("/p", "x", "file");
    expect(errors[0]?.code).toBe("unsupported");
  });
});

describe("reveal", () => {
  it("expands unloaded ancestors, selects and focuses the file", async () => {
    const { tree } = await started();
    const revealed = vi.fn();
    tree.on("reveal", revealed);
    expect(await tree.reveal("/p/src/deep/er/b.ts")).toBe(true);
    expect(tree.isExpanded("/p/src/deep")).toBe(true);
    expect(tree.selection()).toEqual(["/p/src/deep/er/b.ts"]);
    expect(tree.focused()).toBe("/p/src/deep/er/b.ts");
    expect(revealed).toHaveBeenCalledWith({ path: "/p/src/deep/er/b.ts", scroll: "nearest" });
  });

  it("ignores a path outside the root", async () => {
    const { tree } = await started();
    expect(await tree.reveal("/elsewhere/a.ts")).toBe(false);
  });

  it("finds a file created behind the tree's back by refreshing its parent", async () => {
    const { tree, provider } = await started();
    await tree.expand("/p/src");
    provider.add("/p/src/late.ts");
    expect(await tree.reveal("/p/src/late.ts")).toBe(true);
  });

  it("shows a revealed file even when the filter hides it", async () => {
    const { tree } = await started(FILES, { filter: (node) => node.name !== "b.ts" });
    await tree.reveal("/p/src/deep/er/b.ts");
    expect(names(tree)).toContain("b.ts");
  });
});

describe("state, selection and compact folders", () => {
  it("round trips expansion state", async () => {
    const { tree } = await started();
    await tree.expand("/p/src");
    await tree.expand("/p/src/deep");
    const state = tree.getState();
    const other = await started();
    await other.tree.setState(state);
    expect(names(other.tree)).toEqual(names(tree));
  });

  it("extends a selection by range and toggles when multi select is on", async () => {
    const { tree } = await started(FILES, { multiSelect: true });
    tree.select("/p/docs");
    tree.select("/p/README.md", "range");
    expect(tree.selection().sort()).toEqual(["/p/README.md", "/p/docs", "/p/src"]);
    tree.select("/p/src", "toggle");
    expect(tree.selection()).not.toContain("/p/src");
  });

  it("replaces the selection with the paths that exist", async () => {
    const { tree } = await started(FILES, { multiSelect: true });
    const seen: string[][] = [];
    tree.on("select", ({ paths }) => seen.push(paths));
    tree.selectPaths(["/p/docs", "/p/README.md", "/p/missing"]);
    expect(tree.selection().sort()).toEqual(["/p/README.md", "/p/docs"]);
    expect(seen).toHaveLength(1);
  });

  it("collapses a chain of single child folders into one row", async () => {
    const { tree } = await started(["/p/a/b/c/x.ts", "/p/z.ts"], { compactFolders: true });
    await tree.expand("/p/a");
    expect(names(tree)).toEqual(["a/b/c", "x.ts", "z.ts"]);
    expect(tree.rows()[0]?.expanded).toBe(true);
  });

  it("nests files under a parent through the nest hook", async () => {
    const { tree } = await started(["/p/a.ts", "/p/a.test.ts", "/p/b.ts"], {
      nest: () => new Map([["/p/a.ts", ["/p/a.test.ts"]]]),
    });
    expect(names(tree)).toEqual(["a.ts", "b.ts"]);
    await tree.expand("/p/a.ts");
    expect(names(tree)).toEqual(["a.ts", "a.test.ts", "b.ts"]);
  });

  it("decorates nodes through plugins and carries the language on open", async () => {
    const { tree } = await started(FILES, {
      plugins: [
        {
          name: "x",
          decorate: (node) => {
            node.languageId = "typed";
          },
        },
      ],
    });
    const opened = vi.fn();
    tree.on("open", opened);
    tree.activate("/p/README.md");
    expect(opened).toHaveBeenCalledWith({
      path: "/p/README.md",
      preview: false,
      languageId: "typed",
    });
  });
});

describe("keyboard", () => {
  it("moves focus, opens and closes folders", async () => {
    const { tree } = await started();
    tree.handleKey({ key: "ArrowDown" });
    expect(tree.focused()).toBe("/p/docs");
    tree.handleKey({ key: "ArrowDown" });
    tree.handleKey({ key: "ArrowRight" });
    await vi.waitFor(() => expect(tree.isExpanded("/p/src")).toBe(true));
    tree.handleKey({ key: "ArrowRight" });
    expect(tree.focused()).toBe("/p/src/deep");
    tree.handleKey({ key: "ArrowLeft" });
    expect(tree.focused()).toBe("/p/src");
    tree.handleKey({ key: "ArrowLeft" });
    expect(tree.isExpanded("/p/src")).toBe(false);
  });

  it("jumps by typed prefix and resets after a pause", async () => {
    vi.useFakeTimers();
    const { tree } = await started();
    tree.handleKey({ key: "r" });
    expect(tree.focused()).toBe("/p/README.md");
    vi.advanceTimersByTime(900);
    tree.handleKey({ key: "s" });
    expect(tree.focused()).toBe("/p/src");
    vi.useRealTimers();
  });

  it("asks the host to confirm a delete and renames inline", async () => {
    const { tree } = await started();
    const asked = vi.fn();
    tree.on("deleteRequest", asked);
    tree.focus("/p/README.md");
    tree.handleKey({ key: "Delete" });
    expect(asked).toHaveBeenCalledWith({ paths: ["/p/README.md"] });
    tree.handleKey({ key: "F2" });
    expect(tree.editState()).toEqual({ type: "rename", path: "/p/README.md" });
    expect(await tree.commitEdit("GUIDE.md")).toBe(true);
    expect(tree.get("/p/GUIDE.md")).toBeDefined();
  });
});

describe("start order", () => {
  it("subscribes to the watcher before the first read so no event is lost", async () => {
    const provider = createMemoryProvider(FILES, "/p");
    const order: string[] = [];
    const watch = provider.watch;
    const readDir = provider.readDir;
    provider.watch = (emit) => {
      order.push("watch");
      return watch?.call(provider, emit) ?? { dispose: () => undefined };
    };
    provider.readDir = async (path) => {
      order.push("read");
      return readDir.call(provider, path);
    };
    await createTree({ provider, root: "/p" }).start();
    expect(order).toEqual(["watch", "read"]);
  });
});
