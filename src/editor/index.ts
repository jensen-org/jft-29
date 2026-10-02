import type { Tree } from "../core/model";
import type { RevealOptions } from "../core/types";

type Followed = Pick<Tree, "reveal" | "on">;

export interface FollowOptions {
  reveal?: RevealOptions;
  toPath?: (path: string) => string;
}

export function followActivePath(
  tree: Followed,
  subscribe: (listener: (path: string | null) => void) => () => void,
  options: FollowOptions = {},
): () => void {
  let openedFromTree: string | null = null;
  let last: string | null = null;
  const stopOpen = tree.on("open", ({ path }) => {
    openedFromTree = path;
  });
  const stopSubscribe = subscribe((raw) => {
    if (!raw) return;
    const path = options.toPath ? options.toPath(raw) : raw;
    if (path === last) return;
    last = path;
    if (openedFromTree === path) {
      openedFromTree = null;
      return;
    }
    openedFromTree = null;
    void tree.reveal(path, options.reveal);
  });
  return () => {
    stopOpen();
    stopSubscribe();
  };
}

export interface MonacoLike {
  getModel(): { uri: { path: string } } | null;
  onDidChangeModel(listener: () => void): { dispose(): void };
}

export function followMonaco(editor: MonacoLike, tree: Followed, options: FollowOptions = {}) {
  return followActivePath(
    tree,
    (listener) => {
      const current = (): string | null => editor.getModel()?.uri.path ?? null;
      const subscription = editor.onDidChangeModel(() => listener(current()));
      listener(current());
      return () => subscription.dispose();
    },
    options,
  );
}
