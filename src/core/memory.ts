import { basename, dirname, isWithin, join, replacePrefix } from "./paths";
import type { Disposable, EntryKind, FsEvent, TreeProvider } from "./types";

export interface MemoryProvider extends TreeProvider {
  add(path: string, kind?: EntryKind): void;
  delete(path: string): void;
  emit(batch: FsEvent[]): void;
  exists(path: string): boolean;
  reads(): string[];
}

export function createMemoryProvider(files: string[] = [], root = "/"): MemoryProvider {
  const entries = new Map<string, EntryKind>();
  const emitters = new Set<(batch: FsEvent[]) => void>();
  const log: string[] = [];

  const ensureDirs = (path: string): void => {
    let current = dirname(path);
    while (current !== root && isWithin(root, current) && !entries.has(current)) {
      entries.set(current, "dir");
      current = dirname(current);
    }
  };
  const put = (path: string, kind: EntryKind): void => {
    ensureDirs(path);
    entries.set(path, kind);
  };

  for (const file of files) {
    if (file.endsWith("/")) put(file.slice(0, -1), "dir");
    else put(file, "file");
  }

  return {
    async readDir(path) {
      log.push(path);
      return [...entries]
        .filter(([candidate]) => candidate !== path && dirname(candidate) === path)
        .map(([candidate, kind]) => ({ name: basename(candidate), kind }));
    },
    watch(emit): Disposable {
      emitters.add(emit);
      return { dispose: () => emitters.delete(emit) };
    },
    async create(parent, name, kind) {
      put(join(parent, name), kind);
    },
    async rename(from, to) {
      for (const [path, kind] of [...entries]) {
        if (path === from || path.startsWith(`${from}/`)) {
          entries.delete(path);
          entries.set(replacePrefix(path, from, to), kind);
        }
      }
    },
    async move(from, toDir) {
      const to = join(toDir, basename(from));
      for (const [path, kind] of [...entries]) {
        if (path === from || path.startsWith(`${from}/`)) {
          entries.delete(path);
          entries.set(replacePrefix(path, from, to), kind);
        }
      }
    },
    async remove(path) {
      for (const candidate of [...entries.keys()]) {
        if (candidate === path || candidate.startsWith(`${path}/`)) entries.delete(candidate);
      }
    },
    add: (path, kind = "file") => put(path, kind),
    delete(path) {
      for (const candidate of [...entries.keys()]) {
        if (candidate === path || candidate.startsWith(`${path}/`)) entries.delete(candidate);
      }
    },
    emit(batch) {
      for (const emit of emitters) emit(batch);
    },
    exists: (path) => entries.has(path),
    reads: () => log,
  };
}
