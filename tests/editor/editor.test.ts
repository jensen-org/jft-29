import { describe, expect, it, vi } from "vitest";
import { followActivePath, followMonaco, type MonacoLike } from "../../src/editor";

function stubTree() {
  const openers: ((event: { path: string }) => void)[] = [];
  return {
    reveal: vi.fn(async (_path: string, _options?: unknown) => true),
    on: vi.fn((type: string, listener: (event: { path: string }) => void) => {
      if (type === "open") openers.push(listener);
      return () => undefined;
    }),
    open: (path: string) => {
      for (const listener of openers) listener({ path });
    },
  };
}

describe("followActivePath", () => {
  it("reveals once per change and ignores repeats and nulls", () => {
    const tree = stubTree();
    let push: (path: string | null) => void = () => undefined;
    followActivePath(tree as never, (listener) => {
      push = listener;
      return () => undefined;
    });
    push("/p/a.ts");
    push("/p/a.ts");
    push(null);
    push("/p/b.ts");
    expect(tree.reveal.mock.calls.map(([path]) => path)).toEqual(["/p/a.ts", "/p/b.ts"]);
  });

  it("does not reveal again for a file the tree itself opened", () => {
    const tree = stubTree();
    let push: (path: string | null) => void = () => undefined;
    followActivePath(tree as never, (listener) => {
      push = listener;
      return () => undefined;
    });
    tree.open("/p/a.ts");
    push("/p/a.ts");
    expect(tree.reveal).not.toHaveBeenCalled();
    push("/p/b.ts");
    expect(tree.reveal).toHaveBeenCalledTimes(1);
  });

  it("maps the reported path and stops on dispose", () => {
    const tree = stubTree();
    const stop = vi.fn();
    let push: (path: string | null) => void = () => undefined;
    const dispose = followActivePath(
      tree as never,
      (listener) => {
        push = listener;
        return stop;
      },
      { toPath: (path) => path.replace("file://", "") },
    );
    push("file:///p/a.ts");
    expect(tree.reveal).toHaveBeenCalledWith("/p/a.ts", undefined);
    dispose();
    expect(stop).toHaveBeenCalled();
  });
});

describe("followMonaco", () => {
  it("reveals the current model and each model change", () => {
    const tree = stubTree();
    let model: { uri: { path: string } } | null = { uri: { path: "/p/a.ts" } };
    let changed: () => void = () => undefined;
    const dispose = vi.fn();
    const editor: MonacoLike = {
      getModel: () => model,
      onDidChangeModel: (listener) => {
        changed = listener;
        return { dispose };
      },
    };
    const stop = followMonaco(editor, tree as never);
    model = { uri: { path: "/p/b.ts" } };
    changed();
    expect(tree.reveal.mock.calls.map(([path]) => path)).toEqual(["/p/a.ts", "/p/b.ts"]);
    stop();
    expect(dispose).toHaveBeenCalled();
  });
});
