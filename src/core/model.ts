import { coalesce } from "./coalesce.js";
import {
  ancestorsBetween,
  basename,
  dirname,
  isStrictlyWithin,
  isWithin,
  join,
  replacePrefix,
  trimTrailing,
} from "./paths.js";
import {
  type DirPage,
  type Disposable,
  type EditState,
  type EntryKind,
  type FsEvent,
  type GitEntry,
  type GitStatus,
  type KeyLike,
  type RevealOptions,
  type Row,
  TreeCancel,
  TreeError,
  type TreeErrorCode,
  type TreeEvents,
  type TreeNode,
  type TreeOptions,
  type TreeState,
} from "./types.js";

type Listener<T> = (payload: T) => void;

interface GitInfo {
  status: GitStatus;
  staged: boolean;
}

const GIT_RANK: GitStatus[] = [
  "conflicted",
  "deleted",
  "modified",
  "added",
  "renamed",
  "untracked",
];

interface Snapshot {
  nodes: TreeNode[];
  expanded: string[];
  parent: string;
}

const TYPE_AHEAD_RESET_MS = 800;
const PAGE_REPAINT_MS = 100;

const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function defaultSort(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return NAME_COLLATOR.compare(a.name, b.name);
}

function defaultSchedule(run: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => run());
  else setTimeout(run, 16);
}

export class Tree {
  readonly root: string;
  private readonly options: TreeOptions;
  private readonly nodes = new Map<string, TreeNode>();
  private readonly expandedSet = new Set<string>();
  private readonly selectedSet = new Set<string>();
  private readonly inflight = new Map<string, Promise<boolean>>();
  private readonly listeners = new Map<keyof TreeEvents, Set<Listener<never>>>();
  private pinned = new Set<string>();
  private anchor: string | null = null;
  private focusedPath: string | null = null;
  private editing: EditState | null = null;
  private queue: FsEvent[] = [];
  private flushScheduled = false;
  private watcher: Disposable | null = null;
  private disposed = false;
  private version = 0;
  private cache: { version: number; rows: Row[]; index: Map<string, number> | null } | null = null;
  private typed = { buffer: "", at: 0 };
  private git = new Map<string, GitInfo>();
  private rerun = new Set<string>();
  private inheritedCache: { version: number; map: Map<string, GitStatus> } | null = null;

  constructor(options: TreeOptions) {
    this.options = { ...options, root: trimTrailing(options.root) };
    this.root = this.options.root;
    const node = this.makeNode(this.root, basename(this.root) || this.root, "dir", null);
    this.nodes.set(this.root, node);
  }

  on<K extends keyof TreeEvents>(type: K, listener: Listener<TreeEvents[K]>): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as Listener<never>);
    this.listeners.set(type, set);
    return () => set.delete(listener as Listener<never>);
  }

  private emit<K extends keyof TreeEvents>(type: K, payload: TreeEvents[K]): void {
    for (const listener of this.listeners.get(type) ?? []) {
      (listener as Listener<TreeEvents[K]>)(payload);
    }
  }

  private bump(): void {
    this.version += 1;
    this.cache = null;
    this.emit("change", undefined);
  }

  private touch(): void {
    this.emit("change", undefined);
  }

  private fail(code: TreeErrorCode, path: string, message: string, cause?: unknown): false {
    this.emit("error", new TreeError(code, path, message, cause));
    return false;
  }

  private refuse(path: string, verb: string): false {
    return this.fail(
      "unsupported",
      path,
      this.options.readOnly ? "this tree is read only" : `this tree cannot ${verb}`,
    );
  }

  async start(): Promise<boolean> {
    this.expandedSet.add(this.root);
    if (this.options.provider.watch) {
      this.watcher = this.options.provider.watch((batch) => this.push(batch));
    }
    return this.load(this.root);
  }

  dispose(): void {
    this.disposed = true;
    this.watcher?.dispose();
    this.watcher = null;
    this.listeners.clear();
    this.queue = [];
  }

  configure(
    patch: Partial<
      Pick<
        TreeOptions,
        "sort" | "filter" | "nest" | "compactFolders" | "multiSelect" | "readOnly" | "hideIgnored"
      >
    >,
  ): void {
    Object.assign(this.options, patch);
    if ("sort" in patch) {
      for (const node of this.nodes.values()) this.sortChildren(node);
    }
    this.bump();
  }

  get(path: string): TreeNode | undefined {
    return this.nodes.get(path);
  }

  isExpanded(path: string): boolean {
    return this.expandedSet.has(path);
  }

  selection(): string[] {
    return [...this.selectedSet];
  }

  focused(): string | null {
    return this.focusedPath;
  }

  editState(): EditState | null {
    return this.editing;
  }

  isReadOnly(): boolean {
    return this.options.readOnly === true;
  }

  can(write: "create" | "rename" | "move" | "remove"): boolean {
    if (this.options.readOnly) return false;
    const provider = this.options.provider;
    return write === "move"
      ? Boolean(provider.move ?? provider.rename)
      : typeof provider[write] === "function";
  }

  private makeNode(
    path: string,
    name: string,
    kind: EntryKind,
    parent: string | null,
    pending = false,
  ): TreeNode {
    const node: TreeNode = {
      path,
      name,
      kind,
      parent,
      children: null,
      state: "unloaded",
      pending,
      ignored: false,
    };
    for (const plugin of this.options.plugins ?? []) plugin.decorate?.(node);
    return node;
  }

  private sortChildren(node: TreeNode): void {
    const children = node.children;
    if (!children) return;
    const compare = this.options.sort ?? defaultSort;
    const known = children.flatMap((path) => {
      const child = this.nodes.get(path);
      return child ? [{ path, child }] : [];
    });
    known.sort((a, b) => compare(a.child, b.child));
    node.children = known.map((entry) => entry.path);
  }

  private insertSorted(parent: TreeNode, child: TreeNode): void {
    const children = parent.children ?? [];
    const compare = this.options.sort ?? defaultSort;
    let low = 0;
    let high = children.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const at = this.nodes.get(children[middle] ?? "");
      if (at && compare(at, child) <= 0) low = middle + 1;
      else high = middle;
    }
    children.splice(low, 0, child.path);
    parent.children = children;
  }

  private removeChild(parent: TreeNode | undefined, path: string): void {
    const at = parent?.children?.indexOf(path) ?? -1;
    if (at !== -1) parent?.children?.splice(at, 1);
  }

  load(path: string): Promise<boolean> {
    const node = this.nodes.get(path);
    if (node?.kind !== "dir") return Promise.resolve(false);
    const running = this.inflight.get(path);
    if (running) return running;
    const run = this.readUntilFresh(node).finally(() => this.inflight.delete(path));
    this.inflight.set(path, run);
    return run;
  }

  private async readUntilFresh(node: TreeNode): Promise<boolean> {
    let ok = await this.read(node);
    while (ok && this.rerun.delete(node.path)) ok = await this.read(node);
    this.rerun.delete(node.path);
    return ok;
  }

  private async read(node: TreeNode): Promise<boolean> {
    if (node.state !== "loaded") {
      node.state = "loading";
      this.bump();
    }
    try {
      const { provider } = this.options;
      if (provider.readDirPage) {
        if (!(await this.readPages(node, provider.readDirPage.bind(provider)))) return false;
      } else {
        const entries = await provider.readDir(node.path);
        if (this.disposed || this.nodes.get(node.path) !== node) return false;
        this.reconcile(node, entries);
        node.state = "loaded";
        this.bump();
      }
    } catch (cause) {
      if (this.disposed || this.nodes.get(node.path) !== node) return false;
      node.state = "error";
      this.bump();
      return this.fail("read", node.path, `could not read ${node.path}`, cause);
    }
    await this.continueChain(node);
    return true;
  }

  private async readPages(
    node: TreeNode,
    readPage: (path: string, cursor: number | null) => Promise<DirPage>,
  ): Promise<boolean> {
    const listed = new Set<string>();
    let cursor: number | null = null;
    let painted = 0;
    do {
      const page: DirPage = await readPage(node.path, cursor);
      if (this.disposed || this.nodes.get(node.path) !== node) return false;
      const fresh = this.absorb(node, page.entries, listed);
      if (cursor === null) {
        node.children = [...(node.children ?? []), ...fresh.map((child) => child.path)];
        this.sortChildren(node);
      } else {
        for (const child of fresh) this.insertSorted(node, child);
      }
      cursor = page.next;
      const now = Date.now();
      if (cursor === null || painted === 0 || now - painted >= PAGE_REPAINT_MS) {
        painted = now;
        this.bump();
      }
    } while (cursor !== null);
    this.prune(node, listed);
    node.state = "loaded";
    this.bump();
    return true;
  }

  private absorb(
    node: TreeNode,
    entries: { name: string; kind: EntryKind; ignored?: boolean }[],
    listed: Set<string>,
  ): TreeNode[] {
    const fresh: TreeNode[] = [];
    for (const entry of entries) {
      if (!entry.name || entry.name.includes("/")) continue;
      const path = join(node.path, entry.name);
      listed.add(path);
      const existing = this.nodes.get(path);
      if (existing && existing.kind === entry.kind) {
        existing.pending = false;
        existing.ignored = entry.ignored === true;
        continue;
      }
      if (existing) this.detach(path);
      const created = this.makeNode(path, entry.name, entry.kind, node.path);
      created.ignored = entry.ignored === true;
      this.nodes.set(path, created);
      fresh.push(created);
    }
    return fresh;
  }

  private prune(node: TreeNode, listed: Set<string>): void {
    for (const old of [...(node.children ?? [])]) {
      if (listed.has(old)) continue;
      if (!this.nodes.get(old)?.pending) this.detach(old);
    }
  }

  private reconcile(
    node: TreeNode,
    entries: { name: string; kind: EntryKind; ignored?: boolean }[],
  ): void {
    const listed = new Set<string>();
    const fresh = this.absorb(node, entries, listed);
    const kept = (node.children ?? []).filter((path) => this.nodes.has(path));
    node.children = [...kept, ...fresh.map((child) => child.path)];
    this.prune(node, listed);
    this.sortChildren(node);
  }

  private subtree(path: string): TreeNode[] {
    const found: TreeNode[] = [];
    const visit = (current: string): void => {
      const node = this.nodes.get(current);
      if (!node) return;
      found.push(node);
      for (const child of node.children ?? []) visit(child);
    };
    visit(path);
    return found;
  }

  private detach(path: string): Snapshot | null {
    const node = this.nodes.get(path);
    if (!node) return null;
    const nodes = this.subtree(path);
    const expanded = nodes.filter((n) => this.expandedSet.has(n.path)).map((n) => n.path);
    const parent = node.parent ?? this.root;
    this.removeChild(this.nodes.get(parent), path);
    for (const removed of nodes) {
      this.nodes.delete(removed.path);
      this.expandedSet.delete(removed.path);
      this.selectedSet.delete(removed.path);
      this.pinned.delete(removed.path);
      this.inflight.delete(removed.path);
    }
    if (
      this.focusedPath &&
      (this.focusedPath === path || isStrictlyWithin(path, this.focusedPath))
    ) {
      this.focusedPath = parent === this.root ? null : parent;
    }
    if (this.anchor && isWithin(path, this.anchor)) this.anchor = null;
    return { nodes, expanded, parent };
  }

  private restore(snapshot: Snapshot): void {
    const holder = this.nodes.get(snapshot.parent);
    for (const node of snapshot.nodes) this.nodes.set(node.path, node);
    for (const path of snapshot.expanded) this.expandedSet.add(path);
    const top = snapshot.nodes[0];
    if (holder && top) this.insertSorted(holder, top);
  }

  private insert(parent: TreeNode, name: string, kind: EntryKind, pending = false): TreeNode {
    const path = join(parent.path, name);
    const node = this.makeNode(path, name, kind, parent.path, pending);
    this.nodes.set(path, node);
    this.insertSorted(parent, node);
    return node;
  }

  private rekey(from: string, to: string): boolean {
    const node = this.nodes.get(from);
    const destination = this.nodes.get(dirname(to));
    const nodes = this.subtree(from);
    const wasExpanded = nodes.filter((n) => this.expandedSet.has(n.path)).map((n) => n.path);
    const wasSelected = nodes.filter((n) => this.selectedSet.has(n.path)).map((n) => n.path);
    const focus = this.focusedPath;
    if (!node) return false;
    this.removeChild(this.nodes.get(node.parent ?? this.root), from);
    for (const moved of nodes) {
      this.nodes.delete(moved.path);
      this.expandedSet.delete(moved.path);
      this.selectedSet.delete(moved.path);
    }
    if (destination?.kind !== "dir" || destination.state !== "loaded") {
      this.afterDetached(from, focus);
      return false;
    }
    if (this.nodes.has(to)) this.detach(to);
    for (const moved of nodes) {
      if (moved.parent && moved !== node) moved.parent = replacePrefix(moved.parent, from, to);
      moved.path = replacePrefix(moved.path, from, to);
      moved.children = moved.children?.map((child) => replacePrefix(child, from, to)) ?? null;
      this.nodes.set(moved.path, moved);
    }
    node.name = basename(to);
    node.parent = destination.path;
    for (const path of wasExpanded) this.expandedSet.add(replacePrefix(path, from, to));
    for (const path of wasSelected) this.selectedSet.add(replacePrefix(path, from, to));
    if (focus && isWithin(from, focus)) this.focusedPath = replacePrefix(focus, from, to);
    this.insertSorted(destination, node);
    this.rekeyGit(from, to);
    return true;
  }

  private rekeyGit(from: string, to: string): void {
    if (this.git.size === 0) return;
    const next = new Map<string, GitInfo>();
    for (const [path, info] of this.git) {
      next.set(isWithin(from, path) ? replacePrefix(path, from, to) : path, info);
    }
    this.git = next;
  }

  setGit(entries: GitEntry[]): void {
    const next = new Map<string, GitInfo>();
    for (const entry of entries) {
      const path = trimTrailing(entry.path);
      if (!isStrictlyWithin(this.root, path)) continue;
      next.set(path, { status: entry.status, staged: entry.staged === true });
    }
    const same =
      next.size === this.git.size &&
      [...next].every(([path, info]) => {
        const known = this.git.get(path);
        return known?.status === info.status && known.staged === info.staged;
      });
    if (same) return;
    this.git = next;
    this.bump();
  }

  private isIgnored(path: string): boolean {
    for (let current = path; isWithin(this.root, current); current = dirname(current)) {
      if (this.nodes.get(current)?.ignored) return true;
      if (current === this.root) return false;
    }
    return false;
  }

  private inheritedMap(): Map<string, GitStatus> {
    if (this.inheritedCache?.version === this.version) return this.inheritedCache.map;
    const map = new Map<string, GitStatus>();
    for (const [path, info] of this.git) {
      if (this.isIgnored(path)) continue;
      for (const dir of ancestorsBetween(this.root, path)) {
        const known = map.get(dir);
        if (!known || GIT_RANK.indexOf(info.status) < GIT_RANK.indexOf(known)) {
          map.set(dir, info.status);
        }
      }
    }
    this.inheritedCache = { version: this.version, map };
    return map;
  }

  private afterDetached(path: string, focus: string | null): void {
    if (focus && isWithin(path, focus)) this.focusedPath = null;
  }

  push(batch: FsEvent[]): void {
    if (this.disposed) return;
    this.queue.push(...batch);
    if (this.editing) return;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.queue.length === 0) return;
    this.flushScheduled = true;
    (this.options.schedule ?? defaultSchedule)(() => this.flush());
  }

  flush(): void {
    this.flushScheduled = false;
    if (this.disposed || this.editing || this.queue.length === 0) return;
    const events = coalesce(this.queue.splice(0));
    const selected = this.selectionKey();
    let structural = false;
    for (const event of events) structural = this.apply(event) || structural;
    if (structural) this.bump();
    this.announceSelection(selected);
    this.emit("watched", undefined);
  }

  private selectionKey(): string {
    return this.selectedSet.size === 0 ? "" : [...this.selectedSet].join("\0");
  }

  private announceSelection(before: string): void {
    if (this.selectionKey() !== before) this.emit("select", { paths: this.selection() });
  }

  report(error: TreeError): void {
    this.emit("error", error);
  }

  private apply(event: FsEvent): boolean {
    switch (event.type) {
      case "add": {
        const parent = this.nodes.get(dirname(event.path));
        if (parent?.state !== "loaded") return false;
        const existing = this.nodes.get(event.path);
        if (existing) {
          existing.pending = false;
          return false;
        }
        this.insert(parent, basename(event.path), event.kind);
        return true;
      }
      case "delete":
        return event.path !== this.root && this.detach(event.path) !== null;
      case "change":
        if (this.nodes.has(event.path)) this.emit("changed", { path: event.path });
        return false;
      case "rename": {
        if (this.nodes.has(event.from)) return this.rekey(event.from, event.to) || true;
        if (this.nodes.has(event.to)) return false;
        const parent = this.nodes.get(dirname(event.to));
        if (parent?.state !== "loaded") return false;
        if (event.kind) {
          this.insert(parent, basename(event.to), event.kind);
          return true;
        }
        void this.invalidate(parent.path);
        return false;
      }
      case "rescan":
        void this.invalidate(event.path, { deep: true });
        return false;
    }
  }

  async invalidate(path: string, options: { deep?: boolean } = {}): Promise<void> {
    const node = this.nodes.get(path);
    if (node?.kind !== "dir") return;
    const dirs = this.subtree(path).filter(
      (n) => n.kind === "dir" && (n.path === path || (options.deep && n.state === "loaded")),
    );
    const reload: Promise<boolean>[] = [];
    for (const dir of dirs) {
      if (dir.path === path || dir.path === this.root || this.expandedSet.has(dir.path)) {
        if (dir.state === "unloaded") continue;
        if (this.inflight.has(dir.path)) this.rerun.add(dir.path);
        reload.push(this.load(dir.path));
      } else if (dir.children) {
        for (const child of [...dir.children]) this.detach(child);
        dir.children = null;
        dir.state = "unloaded";
      }
    }
    this.bump();
    await Promise.all(reload);
  }

  async expand(path: string): Promise<boolean> {
    const node = this.nodes.get(path);
    if (!node) return false;
    this.expandedSet.add(path);
    this.bump();
    if (node.kind === "file") return true;
    if (node.state === "unloaded" || node.state === "error") return this.load(path);
    await this.continueChain(node);
    return true;
  }

  collapse(path: string): void {
    if (!this.expandedSet.delete(path)) return;
    if (this.focusedPath && isStrictlyWithin(path, this.focusedPath)) this.focusedPath = path;
    this.bump();
  }

  toggle(path: string): Promise<boolean> {
    if (this.expandedSet.has(path)) {
      this.collapse(path);
      return Promise.resolve(true);
    }
    return this.expand(path);
  }

  collapseAll(): void {
    const keep = this.root;
    this.expandedSet.clear();
    this.expandedSet.add(keep);
    if (this.focusedPath && this.focusedPath !== keep) {
      const top = ancestorsBetween(keep, this.focusedPath).find((p) => p !== keep);
      this.focusedPath = top ?? this.focusedPath;
    }
    this.bump();
  }

  private visible(node: TreeNode): boolean {
    if (node.pending || this.pinned.has(node.path)) return true;
    if (this.options.hideIgnored && this.isIgnored(node.path)) return false;
    const { filter } = this.options;
    return !filter || filter(node);
  }

  private visibleChildren(node: TreeNode): TreeNode[] {
    const list: TreeNode[] = [];
    for (const path of node.children ?? []) {
      const child = this.nodes.get(path);
      if (child && this.visible(child)) list.push(child);
    }
    return list;
  }

  private onlyDirChild(node: TreeNode): TreeNode | null {
    const children = this.visibleChildren(node);
    const only = children[0];
    return children.length === 1 && only?.kind === "dir" && !this.options.nest ? only : null;
  }

  private async continueChain(node: TreeNode): Promise<void> {
    if (!this.options.compactFolders || !this.expandedSet.has(node.path)) return;
    let current = node;
    for (;;) {
      const only = this.onlyDirChild(current);
      if (!only) return;
      if (only.state === "unloaded" && !(await this.load(only.path))) return;
      if (only.state !== "loaded") return;
      current = only;
    }
  }

  rows(): Row[] {
    if (this.cache?.version === this.version) return this.cache.rows;
    const rows: Row[] = [];
    const rootNode = this.nodes.get(this.root);
    if (rootNode) this.walk(this.topLevel(rootNode, new Map()), 0, rows, new Map());
    this.cache = { version: this.version, rows, index: null };
    return rows;
  }

  private nestMap(dir: TreeNode, memo: Map<string, Map<string, string[]>>): Map<string, string[]> {
    const known = memo.get(dir.path);
    if (known) return known;
    const map = this.options.nest?.(this.visibleChildren(dir)) ?? new Map<string, string[]>();
    memo.set(dir.path, map);
    return map;
  }

  private topLevel(node: TreeNode, memo: Map<string, Map<string, string[]>>): TreeNode[] {
    const children = this.visibleChildren(node);
    if (!this.options.nest) return children;
    const nested = new Set([...this.nestMap(node, memo).values()].flat());
    return children.filter((child) => !nested.has(child.path));
  }

  private nestedUnder(node: TreeNode, memo: Map<string, Map<string, string[]>>): TreeNode[] {
    const dir = this.nodes.get(node.parent ?? "");
    if (!dir || !this.options.nest) return [];
    const paths = this.nestMap(dir, memo).get(node.path) ?? [];
    return paths.flatMap((path) => {
      const child = this.nodes.get(path);
      return child ? [child] : [];
    });
  }

  private walk(
    siblings: TreeNode[],
    depth: number,
    out: Row[],
    memo: Map<string, Map<string, string[]>>,
  ): void {
    siblings.forEach((first, index) => {
      const chain = [first];
      let last = first;
      while (this.options.compactFolders && last.kind === "dir" && last.state === "loaded") {
        const only = this.onlyDirChild(last);
        if (!only) break;
        chain.push(only);
        last = only;
      }
      const nested = last.kind === "file" ? this.nestedUnder(last, memo) : [];
      const expandable = last.kind === "dir" || nested.length > 0;
      const expanded = expandable && this.expandedSet.has(first.path);
      const info = this.git.get(last.path);
      out.push({
        id: first.path,
        node: last,
        chain,
        depth,
        setSize: siblings.length,
        posInSet: index + 1,
        expandable,
        expanded,
        loading: expanded && (first.state === "loading" || last.state === "loading"),
        error: last.state === "error",
        status: info?.status ?? null,
        staged: info?.staged ?? false,
        inherited: last.kind === "dir" ? (this.inheritedMap().get(last.path) ?? null) : null,
        ignored: this.isIgnored(last.path),
      });
      if (!expanded) return;
      const below = last.kind === "dir" ? this.topLevel(last, memo) : nested;
      this.walk(below, depth + 1, out, memo);
    });
  }

  rowIndex(path: string): number {
    const rows = this.rows();
    const cache = this.cache;
    if (!cache) return -1;
    if (!cache.index) {
      const index = new Map<string, number>();
      rows.forEach((row, at) => {
        for (const node of row.chain) index.set(node.path, at);
      });
      cache.index = index;
    }
    return cache.index.get(path) ?? -1;
  }

  focus(path: string | null, options: { scroll?: boolean } = {}): void {
    this.focusedPath = path;
    this.touch();
    if (path && options.scroll !== false) this.emit("scroll", { path });
  }

  select(path: string, mode: "replace" | "toggle" | "range" = "replace"): void {
    const multi = this.options.multiSelect === true;
    if (mode === "range" && multi && this.anchor) {
      const rows = this.rows();
      const from = this.rowIndex(this.anchor);
      const to = this.rowIndex(path);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        this.selectedSet.clear();
        for (const row of rows.slice(lo, hi + 1)) this.selectedSet.add(row.node.path);
      }
    } else if (mode === "toggle" && multi) {
      if (!this.selectedSet.delete(path)) this.selectedSet.add(path);
      this.anchor = path;
    } else {
      this.selectedSet.clear();
      this.selectedSet.add(path);
      this.anchor = path;
    }
    this.touch();
    this.emit("select", { paths: this.selection() });
  }

  selectPaths(paths: string[]): void {
    this.selectedSet.clear();
    for (const path of paths) if (this.nodes.has(path)) this.selectedSet.add(path);
    this.anchor = paths[paths.length - 1] ?? null;
    this.touch();
    this.emit("select", { paths: this.selection() });
  }

  clearSelection(): void {
    if (this.selectedSet.size === 0) return;
    this.selectedSet.clear();
    this.touch();
    this.emit("select", { paths: [] });
  }

  activate(path: string, options: { preview?: boolean } = {}): void {
    const node = this.nodes.get(path);
    if (!node) return;
    if (node.kind === "dir") {
      void this.toggle(path);
      return;
    }
    this.emit("open", {
      path,
      preview: options.preview ?? false,
      ...(node.languageId ? { languageId: node.languageId } : {}),
    });
  }

  async reveal(path: string, options: RevealOptions = {}): Promise<boolean> {
    const { select = true, focus = true, scroll = "nearest" } = options;
    if (!isWithin(this.root, path) || path === this.root) return false;
    this.pinned = new Set([...ancestorsBetween(this.root, path), path]);
    for (const dir of ancestorsBetween(this.root, path)) {
      const node = this.nodes.get(dir);
      if (!node) return false;
      this.expandedSet.add(dir);
      if (node.state === "unloaded" || node.state === "error") {
        if (!(await this.load(dir))) return false;
      }
    }
    if (!this.nodes.has(path)) await this.invalidate(dirname(path));
    if (!this.nodes.has(path)) return false;
    if (select) {
      this.selectedSet.clear();
      this.selectedSet.add(path);
      this.anchor = path;
    }
    if (focus) this.focusedPath = path;
    this.bump();
    if (select) this.emit("select", { paths: this.selection() });
    this.emit("reveal", { path, scroll });
    return true;
  }

  getState(): TreeState {
    return {
      expanded: [...this.expandedSet].filter((path) => path !== this.root),
      selected: this.selection(),
      focused: this.focusedPath,
    };
  }

  async setState(state: TreeState): Promise<void> {
    const ordered = [...state.expanded].sort((a, b) => a.length - b.length);
    for (const path of ordered) {
      const node = this.nodes.get(path);
      if (node?.kind !== "dir") continue;
      this.expandedSet.add(path);
      if (node.state === "unloaded") await this.load(path);
    }
    this.selectedSet.clear();
    for (const path of state.selected) if (this.nodes.has(path)) this.selectedSet.add(path);
    this.focusedPath = state.focused && this.nodes.has(state.focused) ? state.focused : null;
    this.bump();
  }

  private validate(parent: TreeNode, name: string, ignore?: string): TreeError | null {
    const trimmed = name.trim();
    if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/")) {
      return new TreeError("invalid-name", parent.path, `"${name}" is not a valid name`);
    }
    const path = join(parent.path, trimmed);
    if (path !== ignore && this.nodes.has(path)) {
      return new TreeError("exists", path, `${trimmed} already exists here`);
    }
    return null;
  }

  async startCreate(parent: string, kind: EntryKind): Promise<boolean> {
    if (!this.can("create")) return this.refuse(parent, "create");
    const node = this.nodes.get(parent);
    if (node?.kind !== "dir") return this.fail("missing", parent, `${parent} is not a folder`);
    if (parent !== this.root && !(await this.expand(parent))) return false;
    this.setEdit({ type: "create", parent, kind });
    return true;
  }

  startRename(path: string): boolean {
    if (!this.can("rename")) return this.refuse(path, "rename");
    if (!this.nodes.has(path) || path === this.root) {
      return this.fail("missing", path, `${path} is not in the tree`);
    }
    this.setEdit({ type: "rename", path });
    return true;
  }

  private setEdit(edit: EditState | null): void {
    this.editing = edit;
    this.touch();
    this.emit("edit", edit);
    if (!edit) this.scheduleFlush();
  }

  cancelEdit(): void {
    if (this.editing) this.setEdit(null);
  }

  async commitEdit(name: string): Promise<boolean> {
    const edit = this.editing;
    if (!edit) return false;
    if (edit.type === "create") {
      const parent = this.nodes.get(edit.parent);
      const invalid = parent && this.validate(parent, name);
      if (invalid) return this.fail(invalid.code, invalid.path, invalid.message);
      this.setEdit(null);
      return this.create(edit.parent, name.trim(), edit.kind);
    }
    const node = this.nodes.get(edit.path);
    const parent = node && this.nodes.get(node.parent ?? this.root);
    if (name.trim() === node?.name) {
      this.setEdit(null);
      return true;
    }
    const invalid = parent && this.validate(parent, name, edit.path);
    if (invalid) return this.fail(invalid.code, invalid.path, invalid.message);
    this.setEdit(null);
    return this.rename(edit.path, join(dirname(edit.path), name.trim()));
  }

  async create(parentPath: string, name: string, kind: EntryKind): Promise<boolean> {
    const { create } = this.options.provider;
    if (!create || !this.can("create")) return this.refuse(parentPath, "create");
    const parent = this.nodes.get(parentPath);
    if (parent?.kind !== "dir") {
      return this.fail("missing", parentPath, `${parentPath} is not a folder`);
    }
    const invalid = this.validate(parent, name);
    if (invalid) return this.fail(invalid.code, invalid.path, invalid.message);
    if (parent.state !== "loaded" && !(await this.load(parentPath))) return false;
    const node = this.insert(parent, name.trim(), kind, true);
    this.bump();
    try {
      await create.call(this.options.provider, parentPath, node.name, kind);
    } catch (cause) {
      this.detach(node.path);
      this.bump();
      return cause instanceof TreeCancel
        ? false
        : this.fail("create", node.path, `could not create ${node.name}`, cause);
    }
    node.pending = false;
    this.bump();
    this.emit("created", { path: node.path, kind });
    return true;
  }

  async rename(from: string, to: string): Promise<boolean> {
    const { rename } = this.options.provider;
    if (!rename || !this.can("rename")) return this.refuse(from, "rename");
    return this.relocate("rename", from, to, () => rename.call(this.options.provider, from, to));
  }

  async move(from: string, toDir: string): Promise<boolean> {
    const { move, rename } = this.options.provider;
    if (!this.can("move")) return this.refuse(from, "move");
    if (!isWithin(this.root, toDir)) return this.fail("outside-root", toDir, "outside the tree");
    if (toDir === from || isStrictlyWithin(from, toDir)) {
      return this.fail("move", from, "a folder cannot move into itself");
    }
    const target = this.nodes.get(toDir);
    if (target?.kind !== "dir") return this.fail("missing", toDir, "not a folder");
    if (target.state !== "loaded" && !(await this.load(toDir))) return false;
    const to = join(toDir, basename(from));
    if (to === from) return true;
    const provider = this.options.provider;
    return this.relocate("move", from, to, async () => {
      if (move) await move.call(provider, from, toDir);
      else await rename?.call(provider, from, to);
    });
  }

  private async relocate(
    code: "rename" | "move",
    from: string,
    to: string,
    write: () => Promise<void>,
  ): Promise<boolean> {
    if (!this.nodes.has(from) || from === this.root) {
      return this.fail("missing", from, `${from} is not in the tree`);
    }
    if (this.nodes.has(to)) return this.fail("exists", to, `${basename(to)} already exists there`);
    const destination = this.nodes.get(dirname(to));
    if (destination?.kind !== "dir" || destination.state !== "loaded") {
      return this.fail("missing", to, "the destination is not loaded");
    }
    if (!this.rekey(from, to)) return this.fail("missing", to, "the destination is not loaded");
    this.bump();
    try {
      await write();
    } catch (cause) {
      this.rekey(to, from);
      this.bump();
      return cause instanceof TreeCancel
        ? false
        : this.fail(code, from, `could not ${code} ${basename(from)}`, cause);
    }
    this.emit(code === "rename" ? "renamed" : "moved", { from, to });
    return true;
  }

  async remove(path: string): Promise<boolean> {
    const { remove } = this.options.provider;
    if (!remove || !this.can("remove")) return this.refuse(path, "delete");
    if (!this.nodes.has(path) || path === this.root) {
      return this.fail("missing", path, `${path} is not in the tree`);
    }
    const selected = this.selectionKey();
    const snapshot = this.detach(path);
    this.bump();
    this.announceSelection(selected);
    try {
      await remove.call(this.options.provider, path);
    } catch (cause) {
      if (snapshot) this.restore(snapshot);
      this.bump();
      return cause instanceof TreeCancel
        ? false
        : this.fail("remove", path, `could not delete ${basename(path)}`, cause);
    }
    this.dropGit(path);
    this.emit("removed", { path });
    return true;
  }

  private dropGit(path: string): void {
    let changed = false;
    for (const key of [...this.git.keys()]) {
      if (isWithin(path, key)) changed = this.git.delete(key) || changed;
    }
    if (changed) this.bump();
  }

  requestDelete(): void {
    const paths =
      this.selectedSet.size > 0 ? this.selection() : this.focusedPath ? [this.focusedPath] : [];
    if (paths.length > 0 && this.can("remove")) this.emit("deleteRequest", { paths });
  }

  handleKey(event: KeyLike): boolean {
    const rows = this.rows();
    const at = this.focusedPath ? this.rowIndex(this.focusedPath) : -1;
    const row = rows[at];
    const goto = (index: number): boolean => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, index))];
      if (!target) return true;
      this.focus(target.node.path);
      this.select(target.node.path, event.shiftKey ? "range" : "replace");
      return true;
    };
    switch (event.key) {
      case "ArrowDown":
        return goto(at + 1);
      case "ArrowUp":
        return goto(at === -1 ? 0 : at - 1);
      case "Home":
        return goto(0);
      case "End":
        return goto(rows.length - 1);
      case "ArrowRight":
        if (!row?.expandable) return true;
        if (!row.expanded) void this.expand(row.id);
        else if ((rows[at + 1]?.depth ?? 0) > row.depth) goto(at + 1);
        return true;
      case "ArrowLeft": {
        if (!row) return true;
        if (row.expanded) {
          this.collapse(row.id);
          return true;
        }
        for (let i = at - 1; i >= 0; i -= 1) {
          if ((rows[i]?.depth ?? 0) < row.depth) return goto(i);
        }
        return true;
      }
      case "Enter":
        if (row) this.activate(row.node.path);
        return true;
      case " ":
        if (!row) return true;
        if (this.options.multiSelect) this.select(row.node.path, "toggle");
        else this.activate(row.node.path);
        return true;
      case "F2":
        if (row && !this.options.readOnly) this.startRename(row.node.path);
        return true;
      case "Delete":
        this.requestDelete();
        return true;
      case "Backspace":
        if (event.metaKey) this.requestDelete();
        return Boolean(event.metaKey);
      case "Escape":
        if (this.editing) this.cancelEdit();
        return Boolean(this.editing);
      case "*":
        if (!row) return true;
        const parent = row.chain[0]?.parent;
        for (const sibling of rows.filter(
          (r) => r.depth === row.depth && r.expandable && r.chain[0]?.parent === parent,
        )) {
          void this.expand(sibling.id);
        }
        return true;
      default:
        return this.typeAhead(event, rows, at);
    }
  }

  private typeAhead(event: KeyLike, rows: Row[], at: number): boolean {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    const now = Date.now();
    const fresh = now - this.typed.at > TYPE_AHEAD_RESET_MS;
    this.typed = { buffer: (fresh ? "" : this.typed.buffer) + event.key.toLowerCase(), at: now };
    const start = this.typed.buffer.length === 1 ? at + 1 : Math.max(at, 0);
    for (let step = 0; step < rows.length; step += 1) {
      const row = rows[(start + step) % rows.length];
      if (row?.chain[0]?.name.toLowerCase().startsWith(this.typed.buffer)) {
        this.focus(row.node.path);
        this.select(row.node.path);
        return true;
      }
    }
    return true;
  }
}

export function createTree(options: TreeOptions): Tree {
  return new Tree(options);
}
