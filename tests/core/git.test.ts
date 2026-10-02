import { describe, expect, it } from "vitest";
import { createMemoryProvider } from "../../src/core/memory";
import { createTree } from "../../src/core/model";
import type { Entry } from "../../src/core/types";

const FILES = [
  "/p/src/a.ts",
  "/p/src/deep/er/b.ts",
  "/p/src/deep/c.ts",
  "/p/README.md",
  "/p/dist/out.js",
  "/p/docs/guide.md",
];

async function started(
  extra: Partial<Parameters<typeof createTree>[0]> = {},
  ignored: string[] = [],
) {
  const provider = createMemoryProvider(FILES, "/p");
  const read = provider.readDir.bind(provider);
  provider.readDir = async (path) => {
    const entries: Entry[] = await read(path);
    return entries.map((entry) =>
      ignored.includes(`${path}/${entry.name}`) ? { ...entry, ignored: true } : entry,
    );
  };
  const tree = createTree({ provider, root: "/p", schedule: (run) => run(), ...extra });
  await tree.start();
  return { provider, tree };
}

const row = (tree: ReturnType<typeof createTree>, path: string) =>
  tree.rows().find((r) => r.node.path === path);

describe("git status", () => {
  it("puts the status and staged flag on the row", async () => {
    const { tree } = await started();
    tree.setGit([{ path: "/p/README.md", status: "modified", staged: true }]);
    expect(row(tree, "/p/README.md")).toMatchObject({ status: "modified", staged: true });
    expect(row(tree, "/p/docs")).toMatchObject({ status: null, inherited: null });
  });

  it("gives a folder the worst status below it", async () => {
    const { tree } = await started();
    await tree.expand("/p/src");
    tree.setGit([
      { path: "/p/src/a.ts", status: "untracked" },
      { path: "/p/src/deep/c.ts", status: "modified" },
    ]);
    expect(row(tree, "/p/src")?.inherited).toBe("modified");
    tree.setGit([
      { path: "/p/src/a.ts", status: "untracked" },
      { path: "/p/src/deep/c.ts", status: "conflicted" },
    ]);
    expect(row(tree, "/p/src")?.inherited).toBe("conflicted");
  });

  it("counts a deleted file that has no row toward its folder", async () => {
    const { tree } = await started();
    tree.setGit([{ path: "/p/docs/gone.md", status: "deleted" }]);
    expect(row(tree, "/p/docs")?.inherited).toBe("deleted");
  });

  it("ignores statuses outside the root and replaces the previous set", async () => {
    const { tree } = await started();
    tree.setGit([
      { path: "/elsewhere/x.ts", status: "added" },
      { path: "/p/README.md", status: "added" },
    ]);
    expect(row(tree, "/p/README.md")?.status).toBe("added");
    tree.setGit([]);
    expect(row(tree, "/p/README.md")?.status).toBeNull();
  });

  it("emits change only when the statuses differ", async () => {
    const { tree } = await started();
    let changes = 0;
    tree.on("change", () => {
      changes += 1;
    });
    tree.setGit([{ path: "/p/README.md", status: "added" }]);
    tree.setGit([{ path: "/p/README.md", status: "added" }]);
    expect(changes).toBe(1);
  });

  it("moves the status with a renamed file and back on rollback", async () => {
    const { tree, provider } = await started();
    tree.setGit([{ path: "/p/README.md", status: "modified" }]);
    await tree.rename("/p/README.md", "/p/READ.md");
    expect(row(tree, "/p/READ.md")?.status).toBe("modified");
    provider.rename = async () => {
      throw new Error("denied");
    };
    tree.on("error", () => {});
    await tree.rename("/p/READ.md", "/p/BACK.md");
    expect(row(tree, "/p/READ.md")?.status).toBe("modified");
  });

  it("moves the statuses under a moved folder", async () => {
    const { tree } = await started();
    await tree.expand("/p/src");
    tree.setGit([{ path: "/p/src/deep/c.ts", status: "added" }]);
    await tree.move("/p/src/deep", "/p/docs");
    await tree.expand("/p/docs");
    await tree.expand("/p/docs/deep");
    expect(row(tree, "/p/docs/deep/c.ts")?.status).toBe("added");
    expect(row(tree, "/p/src")?.inherited).toBeNull();
  });

  it("drops the status of a removed file", async () => {
    const { tree } = await started();
    tree.setGit([{ path: "/p/README.md", status: "modified" }]);
    await tree.remove("/p/README.md");
    expect(row(tree, "/p/README.md")).toBeUndefined();
    await tree.create("/p", "README.md", "file");
    expect(row(tree, "/p/README.md")?.status).toBeNull();
  });
});

describe("ignored", () => {
  it("marks rows the provider lists as ignored and cascades to their children", async () => {
    const { tree } = await started({}, ["/p/dist", "/p/src/deep"]);
    await tree.expand("/p/dist");
    await tree.expand("/p/src");
    await tree.expand("/p/src/deep");
    expect(row(tree, "/p/dist")?.ignored).toBe(true);
    expect(row(tree, "/p/dist/out.js")?.ignored).toBe(true);
    expect(row(tree, "/p/src/deep/c.ts")?.ignored).toBe(true);
    expect(row(tree, "/p/src/a.ts")?.ignored).toBe(false);
    expect(row(tree, "/p/README.md")?.ignored).toBe(false);
  });

  it("does not let ignored children colour their folder", async () => {
    const { tree } = await started({}, ["/p/src/deep"]);
    await tree.expand("/p/src");
    tree.setGit([{ path: "/p/src/deep/c.ts", status: "untracked" }]);
    expect(row(tree, "/p/src")?.inherited).toBeNull();
  });

  it("refreshes the flag when a rescan re-reads the folder", async () => {
    const ignored: string[] = [];
    const { tree } = await started({}, ignored);
    expect(row(tree, "/p/dist")?.ignored).toBe(false);
    ignored.push("/p/dist");
    await tree.invalidate("/p", { deep: true });
    expect(row(tree, "/p/dist")?.ignored).toBe(true);
  });

  it("hides ignored rows live and keeps a revealed one", async () => {
    const { tree } = await started({}, ["/p/dist"]);
    expect(tree.rows().map((r) => r.node.name)).toContain("dist");
    tree.configure({ hideIgnored: true });
    expect(tree.rows().map((r) => r.node.name)).not.toContain("dist");
    await tree.reveal("/p/dist/out.js");
    expect(tree.rows().map((r) => r.node.name)).toContain("out.js");
    tree.configure({ hideIgnored: false });
    expect(tree.rows().map((r) => r.node.name)).toContain("dist");
  });
});
