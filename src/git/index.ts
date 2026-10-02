import type { Tree } from "../core/model.js";
import { type Disposable, type GitEntry, TreeError } from "../core/types.js";

export interface GitSource {
  read(): Promise<GitEntry[]>;
  watch?(onChange: () => void): Disposable;
}

export interface AttachGitOptions {
  debounce?: number;
}

type Attached = Pick<Tree, "setGit" | "on" | "report" | "root">;

export function attachGit(
  tree: Attached,
  source: GitSource,
  options: AttachGitOptions = {},
): () => void {
  const wait = options.debounce ?? 150;
  let stopped = false;
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const refresh = async (): Promise<void> => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const entries = await source.read();
      if (!stopped) tree.setGit(entries);
    } catch (cause) {
      if (!stopped) {
        tree.report(new TreeError("git", tree.root, "could not read git status", cause));
      }
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      await refresh();
    }
  };

  const schedule = (): void => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, wait);
  };

  const stops = [
    tree.on("watched", schedule),
    tree.on("created", schedule),
    tree.on("renamed", schedule),
    tree.on("moved", schedule),
    tree.on("removed", schedule),
  ];
  const watcher = source.watch?.(schedule);
  void refresh();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    for (const stop of stops) stop();
    watcher?.dispose();
  };
}
