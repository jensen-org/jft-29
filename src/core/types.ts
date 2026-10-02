export type EntryKind = "file" | "dir";

export interface Entry {
  name: string;
  kind: EntryKind;
}

export type FsEvent =
  | { type: "add"; path: string; kind: EntryKind }
  | { type: "change"; path: string }
  | { type: "delete"; path: string }
  | { type: "rename"; from: string; to: string; kind?: EntryKind }
  | { type: "rescan"; path: string };

export interface Disposable {
  dispose(): void;
}

export interface TreeProvider {
  readDir(path: string): Promise<Entry[]>;
  watch?(emit: (batch: FsEvent[]) => void): Disposable;
  create?(parent: string, name: string, kind: EntryKind): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  move?(from: string, toDir: string): Promise<void>;
  remove?(path: string): Promise<void>;
}

export type LoadState = "unloaded" | "loading" | "loaded" | "error";

export interface TreeNode {
  path: string;
  name: string;
  kind: EntryKind;
  parent: string | null;
  children: string[] | null;
  state: LoadState;
  pending: boolean;
  languageId?: string;
}

export interface Row {
  id: string;
  node: TreeNode;
  chain: TreeNode[];
  depth: number;
  setSize: number;
  posInSet: number;
  expandable: boolean;
  expanded: boolean;
  loading: boolean;
  error: boolean;
}

export interface TreePlugin {
  name: string;
  decorate?(node: TreeNode): void;
}

export type TreeErrorCode =
  | "read"
  | "create"
  | "rename"
  | "move"
  | "remove"
  | "invalid-name"
  | "exists"
  | "unsupported"
  | "outside-root"
  | "missing";

export class TreeError extends Error {
  readonly code: TreeErrorCode;
  readonly path: string;
  override readonly cause: unknown;

  constructor(code: TreeErrorCode, path: string, message: string, cause?: unknown) {
    super(message);
    this.name = "TreeError";
    this.code = code;
    this.path = path;
    this.cause = cause;
  }
}

export class TreeCancel extends Error {
  constructor(message = "cancelled") {
    super(message);
    this.name = "TreeCancel";
  }
}

export type RevealScroll = "nearest" | "center" | false;

export interface RevealOptions {
  select?: boolean;
  focus?: boolean;
  scroll?: RevealScroll;
}

export interface TreeState {
  expanded: string[];
  selected: string[];
  focused: string | null;
}

export type EditState =
  | { type: "create"; parent: string; kind: EntryKind }
  | { type: "rename"; path: string };

export interface TreeEvents {
  change: undefined;
  error: TreeError;
  open: { path: string; languageId?: string; preview: boolean };
  select: { paths: string[] };
  reveal: { path: string; scroll: RevealScroll };
  scroll: { path: string };
  edit: EditState | null;
  created: { path: string; kind: EntryKind };
  renamed: { from: string; to: string };
  moved: { from: string; to: string };
  removed: { path: string };
  deleteRequest: { paths: string[] };
  changed: { path: string };
}

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface TreeOptions {
  provider: TreeProvider;
  root: string;
  sort?: (a: TreeNode, b: TreeNode) => number;
  filter?: (node: TreeNode) => boolean;
  nest?: (children: TreeNode[]) => Map<string, string[]>;
  compactFolders?: boolean;
  multiSelect?: boolean;
  plugins?: TreePlugin[];
  schedule?: (run: () => void) => void;
}
