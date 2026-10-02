import type { Entry, TreeProvider } from "../src/index.js";

interface IterableDirectory extends FileSystemDirectoryHandle {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
}

export interface OpenedFolder {
  provider: TreeProvider;
  root: string;
}

async function resolve(
  root: FileSystemDirectoryHandle,
  rootName: string,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== rootName) throw new Error(`${path} is outside ${rootName}`);
  let handle = root;
  for (const segment of segments.slice(1)) handle = await handle.getDirectoryHandle(segment);
  return handle;
}

export function openDirectory(handle: FileSystemDirectoryHandle): OpenedFolder {
  const rootName = handle.name;
  return {
    root: `/${rootName}`,
    provider: {
      async readDir(path) {
        const dir = await resolve(handle, rootName, path);
        const entries: Entry[] = [];
        for await (const [name, child] of (dir as IterableDirectory).entries()) {
          entries.push({ name, kind: child.kind === "directory" ? "dir" : "file" });
        }
        return entries;
      },
    },
  };
}
