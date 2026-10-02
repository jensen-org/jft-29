<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { createIconResolver, type IconThemeManifest, type IconVariant } from "../core/icons.js";
import { createTree, type Tree } from "../core/model.js";
import { ancestorsBetween, dirname, isStrictlyWithin } from "../core/paths.js";
import {
  type EditState,
  type Row,
  TreeError,
  type TreeNode,
  type TreePlugin,
  type TreeProvider,
} from "../core/types.js";
import { followActivePath } from "../editor/index.js";
import EditBox from "./EditBox.vue";
import {
  type ContextMenuPayload,
  type Decoration,
  type DragStartPayload,
  type DropPayload,
  type MenuEntry,
  PATHS_MIME,
  type ToolbarAction,
} from "./types.js";

const props = withDefaults(
  defineProps<{
    tree?: Tree;
    provider?: TreeProvider;
    root?: string;
    iconTheme?: IconThemeManifest;
    iconUrl?: (definition: string) => string | undefined;
    iconVariant?: IconVariant;
    decorations?: ReadonlyMap<string, Decoration>;
    filter?: (node: TreeNode) => boolean;
    sort?: (a: TreeNode, b: TreeNode) => number;
    nest?: (children: TreeNode[]) => Map<string, string[]>;
    plugins?: TreePlugin[];
    compactFolders?: boolean;
    multiSelect?: boolean;
    followActive?: boolean | "focusNoScroll";
    activePath?: string | null;
    actions?: ToolbarAction[];
    menu?: MenuEntry[];
    rowHeight?: number;
    indent?: number;
    label?: string;
  }>(),
  { rowHeight: 24, indent: 16, label: "Files", iconVariant: "dark" },
);

const emit = defineEmits<{
  open: [event: { path: string; languageId?: string; preview: boolean }];
  select: [event: { paths: string[] }];
  contextmenu: [event: ContextMenuPayload];
  error: [error: TreeError];
  dragstart: [event: DragStartPayload];
  drop: [event: DropPayload];
  created: [event: { path: string; kind: "file" | "dir" }];
  renamed: [event: { from: string; to: string }];
  moved: [event: { from: string; to: string }];
  removed: [event: { path: string }];
  deleteRequest: [event: { paths: string[] }];
  changed: [event: { path: string }];
}>();

let counter = 0;
const uid = `jft${(counter += 1)}${Math.random().toString(36).slice(2, 6)}`;

const tree = shallowRef<Tree | null>(null);
const version = ref(0);
const body = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewport = ref(0);
const menuOpen = ref(false);
const dropTarget = ref<string | null>(null);
const dragging = ref<string[]>([]);

const OVERSCAN = 8;
const UNMEASURED_ROWS = 60;
const EXPAND_ON_HOVER_MS = 600;

let detach: (() => void)[] = [];
let owned: Tree | null = null;
let resizeObserver: ResizeObserver | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

function release(): void {
  for (const stop of detach) stop();
  detach = [];
  owned?.dispose();
  owned = null;
  tree.value = null;
}

function attach(next: Tree): void {
  tree.value = next;
  detach = [
    next.on("change", () => {
      version.value += 1;
    }),
    next.on("open", (event) => emit("open", event)),
    next.on("select", (event) => emit("select", event)),
    next.on("error", (error) => emit("error", error)),
    next.on("created", (event) => emit("created", event)),
    next.on("renamed", (event) => emit("renamed", event)),
    next.on("moved", (event) => emit("moved", event)),
    next.on("removed", (event) => emit("removed", event)),
    next.on("deleteRequest", (event) => emit("deleteRequest", event)),
    next.on("changed", (event) => emit("changed", event)),
    next.on("scroll", ({ path }) => scrollToPath(path, "nearest")),
    next.on("reveal", ({ path, scroll }) => {
      if (scroll) scrollToPath(path, scroll);
    }),
  ];
  version.value += 1;
}

watch(
  () => [props.tree, props.provider, props.root] as const,
  ([external, provider, root]) => {
    release();
    if (external) {
      attach(external);
      return;
    }
    if (!provider || !root) return;
    const created = createTree({
      provider,
      root,
      ...(props.filter ? { filter: props.filter } : {}),
      ...(props.sort ? { sort: props.sort } : {}),
      ...(props.nest ? { nest: props.nest } : {}),
      ...(props.plugins ? { plugins: props.plugins } : {}),
      compactFolders: props.compactFolders ?? false,
      multiSelect: props.multiSelect ?? false,
    });
    owned = created;
    attach(created);
    created
      .start()
      .catch((cause) =>
        emit("error", new TreeError("read", root, "could not start the tree", cause)),
      );
  },
  { immediate: true },
);

watch(
  () => [props.filter, props.sort, props.nest, props.compactFolders, props.multiSelect] as const,
  ([filter, sort, nest, compactFolders, multiSelect]) => {
    if (!owned) return;
    owned.configure({
      filter,
      sort,
      nest,
      compactFolders: compactFolders ?? false,
      multiSelect: multiSelect ?? false,
    });
  },
);

watch(
  [tree, () => props.followActive] as const,
  ([current, mode], _previous, onCleanup) => {
    if (!current || !mode) return;
    const stop = followActivePath(
      current,
      (listener) =>
        watch(
          () => props.activePath,
          (path) => listener(path ?? null),
          { immediate: true },
        ),
      { reveal: { scroll: mode === "focusNoScroll" ? false : "nearest" } },
    );
    onCleanup(stop);
  },
  { immediate: true },
);

const rows = computed<Row[]>(() => {
  void version.value;
  return tree.value?.rows() ?? [];
});

const edit = computed<EditState | null>(() => {
  void version.value;
  return tree.value?.editState() ?? null;
});

interface Entry {
  key: string;
  row?: Row;
  create?: { kind: "file" | "dir"; depth: number };
}

const entries = computed<Entry[]>(() => {
  const list: Entry[] = rows.value.map((row) => ({ key: row.id, row }));
  const pending = edit.value;
  const current = tree.value;
  if (pending?.type !== "create" || !current) return list;
  const at = list.findIndex((entry) => entry.row?.node.path === pending.parent);
  const parentRow = at === -1 ? undefined : list[at]?.row;
  const create = { kind: pending.kind, depth: parentRow ? parentRow.depth + 1 : 0 };
  list.splice(at + 1, 0, { key: "__create__", create });
  return list;
});

const resolver = computed(() =>
  props.iconTheme ? createIconResolver(props.iconTheme, props.iconVariant) : null,
);

const inherited = computed(() => {
  const marked = new Set<string>();
  const current = tree.value;
  if (!current || !props.decorations) return marked;
  for (const [path, decoration] of props.decorations) {
    if (decoration.propagate === false) continue;
    for (const ancestor of ancestorsBetween(current.root, path)) marked.add(ancestor);
  }
  return marked;
});

const visibleIndexes = computed(() => {
  const total = entries.value.length;
  const height = viewport.value;
  const first = Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - OVERSCAN);
  const last =
    height > 0
      ? Math.min(total, Math.ceil((scrollTop.value + height) / props.rowHeight) + OVERSCAN)
      : Math.min(total, first + UNMEASURED_ROWS);
  const indexes: number[] = [];
  for (let i = first; i < last; i += 1) indexes.push(i);
  const focused = tree.value?.focused();
  if (focused) {
    const at = entries.value.findIndex((entry) =>
      entry.row?.chain.some((node) => node.path === focused),
    );
    if (at !== -1 && (at < first || at >= last)) indexes.push(at);
  }
  return indexes;
});

const focusedIndex = computed(() => {
  const focused = tree.value?.focused();
  if (!focused) return -1;
  return entries.value.findIndex((entry) => entry.row?.chain.some((node) => node.path === focused));
});

const activeDescendant = computed(() =>
  focusedIndex.value === -1 ? undefined : rowId(focusedIndex.value),
);

const selected = computed(() => {
  void version.value;
  return new Set(tree.value?.selection() ?? []);
});

const rootState = computed(() => {
  void version.value;
  const current = tree.value;
  return current ? current.get(current.root)?.state : undefined;
});

const showToolbar = computed(
  () => Boolean(props.actions?.length) || Boolean(props.menu?.length) || hasToolbarSlot.value,
);
const hasToolbarSlot = computed(() => Boolean(slots.toolbar));
const slots = defineSlots<{
  toolbar?(props: { tree: Tree | null }): unknown;
  row?(props: { row: Row; node: TreeNode; selected: boolean }): unknown;
  icon?(props: { row: Row; node: TreeNode; expanded: boolean; url: string | undefined }): unknown;
  badge?(props: { node: TreeNode; decoration: Decoration }): unknown;
  "edit-input"?(props: {
    value: string;
    kind: "file" | "dir";
    commit: (name: string) => void;
    cancel: () => void;
  }): unknown;
  empty?(): unknown;
  error?(props: { retry: () => void }): unknown;
}>();

function rowId(index: number): string {
  return `${uid}-${index}`;
}

function iconUrlFor(row: Row): string | undefined {
  if (!resolver.value || !props.iconUrl) return undefined;
  const definition = resolver.value.resolve({
    name: row.node.name,
    kind: row.node.kind,
    expanded: row.expanded,
    isRoot: false,
    ...(row.node.languageId ? { languageId: row.node.languageId } : {}),
  });
  return definition ? props.iconUrl(definition) : undefined;
}

function toneOf(path: string): string | undefined {
  return props.decorations?.get(path)?.tone;
}

function measure(): void {
  const el = body.value;
  if (el) viewport.value = el.clientHeight;
}

function onScroll(): void {
  if (body.value) scrollTop.value = body.value.scrollTop;
}

function scrollToPath(path: string, mode: "nearest" | "center"): void {
  void nextTick(() => {
    const el = body.value;
    const at = entries.value.findIndex((entry) => entry.row?.chain.some((n) => n.path === path));
    if (!el || at === -1) return;
    const top = at * props.rowHeight;
    const bottom = top + props.rowHeight;
    const height = el.clientHeight;
    let next = el.scrollTop;
    if (mode === "center") next = top - (height - props.rowHeight) / 2;
    else if (top < el.scrollTop) next = top;
    else if (bottom > el.scrollTop + height) next = bottom - height;
    el.scrollTop = Math.max(0, next);
    scrollTop.value = el.scrollTop;
  });
}

onMounted(() => {
  measure();
  if (body.value && typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(body.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (hoverTimer) clearTimeout(hoverTimer);
  release();
});

function onKeydown(event: KeyboardEvent): void {
  const current = tree.value;
  if (!current || event.target !== body.value) return;
  if (current.handleKey(event)) event.preventDefault();
}

function onRowClick(event: MouseEvent, row: Row): void {
  const current = tree.value;
  if (!current) return;
  body.value?.focus({ preventScroll: true });
  const path = row.node.path;
  current.focus(path, { scroll: false });
  if (event.shiftKey) current.select(path, "range");
  else if (event.metaKey || event.ctrlKey) current.select(path, "toggle");
  else {
    current.select(path);
    if (row.expandable && row.node.kind === "dir") void current.toggle(row.id);
    else if (row.node.kind === "file") current.activate(path, { preview: true });
  }
}

function onRowDouble(row: Row): void {
  if (row.node.kind === "file") tree.value?.activate(row.node.path, { preview: false });
}

function onTwist(row: Row): void {
  void tree.value?.toggle(row.id);
}

function onContext(event: MouseEvent, row: Row | null): void {
  const current = tree.value;
  if (!current) return;
  event.preventDefault();
  if (row && !selected.value.has(row.node.path)) {
    current.select(row.node.path);
    current.focus(row.node.path, { scroll: false });
  }
  emit("contextmenu", {
    event,
    path: row?.node.path ?? null,
    paths: current.selection(),
  });
}

function onDragStart(event: DragEvent, row: Row): void {
  const current = tree.value;
  if (!current || !event.dataTransfer) return;
  const paths = selected.value.has(row.node.path) ? current.selection() : [row.node.path];
  dragging.value = paths;
  event.dataTransfer.setData(PATHS_MIME, JSON.stringify(paths));
  event.dataTransfer.effectAllowed = "copyMove";
  emit("dragstart", { event, paths });
}

function dropDirFor(row: Row | null): string {
  const current = tree.value;
  if (!current) return "";
  if (!row) return current.root;
  return row.node.kind === "dir" ? row.node.path : dirname(row.node.path);
}

function acceptsDrop(target: string): boolean {
  const current = tree.value;
  if (!current || dragging.value.length === 0 || !current.can("move")) return false;
  return !dragging.value.some((path) => target === path || isStrictlyWithin(path, target));
}

function onDragOver(event: DragEvent, row: Row | null): void {
  const target = dropDirFor(row);
  const internal = event.dataTransfer?.types.includes(PATHS_MIME) ?? false;
  if (internal && !acceptsDrop(target)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = internal ? "move" : "copy";
  if (dropTarget.value !== target) {
    dropTarget.value = target;
    if (hoverTimer) clearTimeout(hoverTimer);
    if (row?.node.kind === "dir" && !row.expanded) {
      hoverTimer = setTimeout(() => void tree.value?.expand(row.id), EXPAND_ON_HOVER_MS);
    }
  }
}

function onDragLeave(event: DragEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && body.value?.contains(next)) return;
  dropTarget.value = null;
  if (hoverTimer) clearTimeout(hoverTimer);
}

async function onDrop(event: DragEvent, row: Row | null): Promise<void> {
  const current = tree.value;
  const target = dropDirFor(row);
  dropTarget.value = null;
  if (hoverTimer) clearTimeout(hoverTimer);
  if (!current) return;
  event.preventDefault();
  const internal = event.dataTransfer?.types.includes(PATHS_MIME) ?? false;
  if (!internal) {
    emit("drop", { event, target });
    return;
  }
  const paths = dragging.value;
  const allowed = acceptsDrop(target);
  dragging.value = [];
  if (!allowed) return;
  for (const path of paths) await current.move(path, target);
}

function onDragEnd(): void {
  dragging.value = [];
  dropTarget.value = null;
}

function commit(name: string): void {
  tree.value
    ?.commitEdit(name)
    .catch((cause) =>
      emit("error", new TreeError("create", "", "could not finish the edit", cause)),
    );
}

async function blurCommit(name: string): Promise<void> {
  const current = tree.value;
  if (!current) return;
  const ok = await current.commitEdit(name);
  if (!ok && current.editState()) current.cancelEdit();
}

function cancel(): void {
  tree.value?.cancelEdit();
}

function retryRoot(): void {
  const current = tree.value;
  if (!current) return;
  current
    .load(current.root)
    .catch((cause) => emit("error", new TreeError("read", current.root, "could not retry", cause)));
}

function runAction(action: ToolbarAction): void {
  action.run();
}

function runMenu(entry: MenuEntry): void {
  menuOpen.value = false;
  entry.run?.();
}

function onDocumentPointer(event: PointerEvent): void {
  if (!menuOpen.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest(`[data-jft-menu="${uid}"]`)) return;
  menuOpen.value = false;
}

onMounted(() => document.addEventListener("pointerdown", onDocumentPointer));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointer));

const visibleActions = computed(() => (props.actions ?? []).filter((a) => a.when?.() ?? true));

defineExpose({ tree, scrollToPath });
</script>

<template>
  <div class="jft">
    <div v-if="showToolbar" class="jft-toolbar" role="toolbar" :aria-label="`${label} actions`">
      <slot name="toolbar" :tree="tree">
        <button
          v-for="action in visibleActions"
          :key="action.id"
          type="button"
          class="jft-action"
          :aria-label="action.label"
          :disabled="action.disabled?.() ?? false"
          @click="runAction(action)"
        >
          <component :is="action.icon" v-if="action.icon" />
          <span v-else>{{ action.label }}</span>
        </button>
      </slot>
      <span class="jft-toolbar-spacer" />
      <template v-if="menu?.length">
        <button
          type="button"
          class="jft-action"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          :aria-label="`${label} settings`"
          :data-jft-menu="uid"
          @click="menuOpen = !menuOpen"
          @keydown.escape="menuOpen = false"
        >
          &#8943;
        </button>
        <ul v-if="menuOpen" class="jft-menu" role="menu" :data-jft-menu="uid" @keydown.escape="menuOpen = false">
          <template v-for="entry in menu" :key="entry.id">
            <li v-if="entry.separator" class="jft-menu-separator" role="separator" />
            <li v-else role="none">
              <button
                type="button"
                class="jft-menu-item"
                :role="entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
                :aria-checked="entry.checked"
                :disabled="entry.disabled"
                @click="runMenu(entry)"
              >
                <span class="jft-menu-check">{{ entry.checked ? "&#10003;" : "" }}</span>
                {{ entry.label }}
              </button>
            </li>
          </template>
        </ul>
      </template>
    </div>

    <div
      ref="body"
      class="jft-body"
      role="tree"
      tabindex="0"
      :aria-label="label"
      :aria-multiselectable="multiSelect || undefined"
      :aria-activedescendant="activeDescendant"
      :aria-busy="rootState === 'loading' || undefined"
      :style="{ '--jft-row-height': `${rowHeight}px`, '--jft-indent': `${indent}px` }"
      @scroll.passive="onScroll"
      @keydown="onKeydown"
      @contextmenu="onContext($event, null)"
      @dragover="onDragOver($event, null)"
      @dragleave="onDragLeave"
      @drop="onDrop($event, null)"
    >
      <div v-if="rootState === 'error'" class="jft-error" role="alert">
        <slot name="error" :retry="retryRoot">
          Could not read this folder.
          <button type="button" class="jft-action" @click="retryRoot">Retry</button>
        </slot>
      </div>
      <div v-else-if="rootState === 'loaded' && entries.length === 0" class="jft-empty">
        <slot name="empty">Nothing here yet</slot>
      </div>

      <div class="jft-sizer" :style="{ height: `${entries.length * rowHeight}px` }">
        <template v-for="index in visibleIndexes" :key="entries[index]?.key">
          <div
            v-if="entries[index]?.create"
            class="jft-row"
            role="presentation"
            :style="{
              top: `${index * rowHeight}px`,
              height: `${rowHeight}px`,
              paddingLeft: `${(entries[index]?.create?.depth ?? 0) * indent + 4 + 20}px`,
            }"
          >
            <slot
              name="edit-input"
              value=""
              :kind="entries[index]?.create?.kind ?? 'file'"
              :commit="commit"
              :cancel="cancel"
            >
              <EditBox
                initial=""
                :label="entries[index]?.create?.kind === 'dir' ? 'New folder name' : 'New file name'"
                @commit="commit"
                @blur-commit="blurCommit"
                @cancel="cancel"
              />
            </slot>
          </div>

          <div
            v-else-if="entries[index]?.row"
            :id="rowId(index)"
            class="jft-row"
            role="treeitem"
            :aria-level="(entries[index]?.row?.depth ?? 0) + 1"
            :aria-setsize="entries[index]?.row?.setSize"
            :aria-posinset="entries[index]?.row?.posInSet"
            :aria-expanded="entries[index]?.row?.expandable ? entries[index]?.row?.expanded : undefined"
            :aria-selected="selected.has(entries[index]?.row?.node.path ?? '')"
            :aria-busy="entries[index]?.row?.loading || undefined"
            :data-path="entries[index]?.row?.node.path"
            :data-focused="tree?.focused() === entries[index]?.row?.node.path || undefined"
            :data-drop="dropTarget === entries[index]?.row?.node.path || undefined"
            :data-pending="entries[index]?.row?.node.pending || undefined"
            :data-tone="toneOf(entries[index]?.row?.node.path ?? '')"
            :draggable="true"
            :style="{
              top: `${index * rowHeight}px`,
              height: `${rowHeight}px`,
              paddingLeft: `${(entries[index]?.row?.depth ?? 0) * indent + 4}px`,
            }"
            @click="onRowClick($event, entries[index]!.row!)"
            @dblclick="onRowDouble(entries[index]!.row!)"
            @contextmenu.stop="onContext($event, entries[index]!.row!)"
            @dragstart="onDragStart($event, entries[index]!.row!)"
            @dragover.stop="onDragOver($event, entries[index]!.row!)"
            @drop.stop="onDrop($event, entries[index]!.row!)"
            @dragend="onDragEnd"
          >
            <span
              class="jft-twist"
              :data-expanded="entries[index]?.row?.expanded || undefined"
              aria-hidden="true"
              @click.stop="onTwist(entries[index]!.row!)"
            >
              <svg v-if="entries[index]?.row?.expandable" width="10" height="10" viewBox="0 0 10 10">
                <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <span class="jft-icon" aria-hidden="true">
              <slot
                name="icon"
                :row="entries[index]!.row!"
                :node="entries[index]!.row!.node"
                :expanded="entries[index]!.row!.expanded"
                :url="iconUrlFor(entries[index]!.row!)"
              >
                <img v-if="iconUrlFor(entries[index]!.row!)" :src="iconUrlFor(entries[index]!.row!)" alt="" draggable="false" />
              </slot>
            </span>

            <EditBox
              v-if="edit?.type === 'rename' && edit.path === entries[index]?.row?.node.path"
              :initial="entries[index]!.row!.node.name"
              label="New name"
              @commit="commit"
              @blur-commit="blurCommit"
              @cancel="cancel"
            />
            <template v-else>
              <span class="jft-label" :data-tone="toneOf(entries[index]!.row!.node.path)">
                <template v-for="(part, at) in entries[index]!.row!.chain" :key="part.path">
                  <span v-if="at > 0" class="jft-chain-sep">/</span>{{ part.name }}
                </template>
              </span>
              <span v-if="entries[index]!.row!.loading" class="jft-spinner" aria-hidden="true" />
              <slot
                v-if="decorations?.get(entries[index]!.row!.node.path)?.badge"
                name="badge"
                :node="entries[index]!.row!.node"
                :decoration="decorations!.get(entries[index]!.row!.node.path)!"
              >
                <span
                  class="jft-badge"
                  :data-tone="decorations!.get(entries[index]!.row!.node.path)!.tone"
                  :aria-label="decorations!.get(entries[index]!.row!.node.path)!.hint"
                >
                  {{ decorations!.get(entries[index]!.row!.node.path)!.badge }}
                </span>
              </slot>
              <span
                v-else-if="entries[index]!.row!.node.kind === 'dir' && inherited.has(entries[index]!.row!.node.path)"
                class="jft-dot"
                aria-hidden="true"
              />
              <slot
                name="row"
                :row="entries[index]!.row!"
                :node="entries[index]!.row!.node"
                :selected="selected.has(entries[index]!.row!.node.path)"
              />
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style src="./style.css" />
