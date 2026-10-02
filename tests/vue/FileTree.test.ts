// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryProvider } from "../../src/core/memory";
import { createTree } from "../../src/core/model";
import { FileTree } from "../../src/vue";

const FILES = ["/p/src/a.ts", "/p/src/deep/er/b.ts", "/p/README.md", "/p/docs/"];

async function mounted(extra: Record<string, unknown> = {}) {
  const provider = createMemoryProvider(FILES, "/p");
  const tree = createTree({ provider, root: "/p", schedule: (run) => run() });
  await tree.start();
  const wrapper = mount(FileTree, {
    props: { tree, ...extra },
    attachTo: document.body,
  });
  await flushPromises();
  return { provider, tree, wrapper };
}

function fire(target: Element, type: string, transfer: object): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  target.dispatchEvent(event);
}

const rowNames = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[role="treeitem"]').map((row) => row.find(".jft-label").text());

describe("<FileTree>", () => {
  it("renders an ARIA tree with levels, set sizes and positions", async () => {
    const { wrapper } = await mounted();
    expect(wrapper.find('[role="tree"]').exists()).toBe(true);
    expect(rowNames(wrapper)).toEqual(["docs", "src", "README.md"]);
    const src = wrapper.findAll('[role="treeitem"]')[1];
    expect(src?.attributes()).toMatchObject({
      "aria-level": "1",
      "aria-setsize": "3",
      "aria-posinset": "2",
      "aria-expanded": "false",
    });
    const file = wrapper.findAll('[role="treeitem"]')[2];
    expect(file?.attributes("aria-expanded")).toBeUndefined();
  });

  it("renders no title and no toolbar unless the parent supplies one", async () => {
    const { wrapper } = await mounted();
    expect(wrapper.find(".jft-toolbar").exists()).toBe(false);
    expect(wrapper.find("[title]").exists()).toBe(false);
  });

  it("expands a folder on click and emits open for a file", async () => {
    const { wrapper } = await mounted();
    await wrapper.findAll('[role="treeitem"]')[1]?.trigger("click");
    await flushPromises();
    expect(rowNames(wrapper)).toEqual(["docs", "src", "deep", "a.ts", "README.md"]);
    await wrapper.findAll('[role="treeitem"]')[3]?.trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual([{ path: "/p/src/a.ts", preview: true }]);
  });

  it("moves with the keyboard and points aria-activedescendant at the focused row", async () => {
    const { wrapper } = await mounted();
    const body = wrapper.find('[role="tree"]');
    await body.trigger("keydown", { key: "ArrowDown" });
    await body.trigger("keydown", { key: "ArrowDown" });
    const rows = wrapper.findAll('[role="treeitem"]');
    expect(body.attributes("aria-activedescendant")).toBe(rows[1]?.attributes("id"));
    expect(rows[1]?.attributes("aria-selected")).toBe("true");
  });

  it("reveals a nested file and keeps its row rendered", async () => {
    const { wrapper, tree } = await mounted();
    await tree.reveal("/p/src/deep/er/b.ts");
    await flushPromises();
    expect(rowNames(wrapper)).toContain("b.ts");
    const row = wrapper.find('[data-path="/p/src/deep/er/b.ts"]');
    expect(row.attributes("aria-selected")).toBe("true");
    expect(row.attributes("aria-level")).toBe("4");
  });

  it("follows the active path without being asked twice", async () => {
    const { wrapper, tree } = await mounted({ followActive: true, activePath: null });
    await wrapper.setProps({ activePath: "/p/src/a.ts" });
    await flushPromises();
    expect(tree.isExpanded("/p/src")).toBe(true);
    expect(tree.selection()).toEqual(["/p/src/a.ts"]);
  });

  it("only renders the rows in the window of a long list", async () => {
    const many = Array.from({ length: 500 }, (_, i) => `/p/f${String(i).padStart(3, "0")}.ts`);
    const provider = createMemoryProvider(many, "/p");
    const tree = createTree({ provider, root: "/p" });
    await tree.start();
    const wrapper = mount(FileTree, { props: { tree }, attachTo: document.body });
    await flushPromises();
    const rendered = wrapper.findAll('[role="treeitem"]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    expect(wrapper.find(".jft-sizer").attributes("style")).toContain("height: 12000px");
  });

  it("creates a file through the inline box and shows it", async () => {
    const { wrapper, tree, provider } = await mounted();
    await tree.startCreate("/p", "file");
    await flushPromises();
    const input = wrapper.find("input.jft-edit");
    expect(input.exists()).toBe(true);
    await input.setValue("fresh.ts");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(provider.exists("/p/fresh.ts")).toBe(true);
    expect(rowNames(wrapper)).toContain("fresh.ts");
    expect(wrapper.find("input.jft-edit").exists()).toBe(false);
  });

  it("renames inline and reports a clash as an error event", async () => {
    const { wrapper, tree } = await mounted();
    const errors: string[] = [];
    tree.on("error", (error) => errors.push(error.code));
    tree.startRename("/p/README.md");
    await flushPromises();
    const input = wrapper.find("input.jft-edit");
    await input.setValue("docs");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(errors).toEqual(["exists"]);
  });

  it("draws decorations and propagates a dot to ancestor folders", async () => {
    const decorations = new Map([
      ["/p/src/a.ts", { badge: "M", tone: "modified", hint: "Modified" }],
    ]);
    const { wrapper, tree } = await mounted({ decorations });
    expect(wrapper.find('[data-path="/p/src"] .jft-dot').exists()).toBe(true);
    await tree.reveal("/p/src/a.ts");
    await flushPromises();
    const badge = wrapper.find('[data-path="/p/src/a.ts"] .jft-badge');
    expect(badge.text()).toBe("M");
    expect(badge.attributes("aria-label")).toBe("Modified");
  });

  it("renders a leading slot before the twist on every row", async () => {
    const { wrapper } = await mounted({});
    const withSlot = mount(FileTree, {
      props: { tree: wrapper.vm.tree as never },
      slots: { leading: '<i class="lead" />' },
      attachTo: document.body,
    });
    await flushPromises();
    expect(withSlot.findAll(".lead")).toHaveLength(3);
  });

  it("resolves icons from a manifest through the host url function", async () => {
    const { wrapper } = await mounted({
      iconTheme: { file: "file", folder: "folder", fileExtensions: { md: "markdown" } },
      iconUrl: (id: string) => `/icons/${id}.svg`,
    });
    expect(wrapper.find('[data-path="/p/README.md"] img').attributes("src")).toBe(
      "/icons/markdown.svg",
    );
    expect(wrapper.find('[data-path="/p/docs"] img').attributes("src")).toBe("/icons/folder.svg");
  });

  it("builds its own tree from provider and root", async () => {
    const provider = createMemoryProvider(FILES, "/p");
    const wrapper = mount(FileTree, { props: { provider, root: "/p" }, attachTo: document.body });
    await flushPromises();
    expect(rowNames(wrapper)).toEqual(["docs", "src", "README.md"]);
  });

  it("emits a contextmenu payload and lets the host own the menu", async () => {
    const { wrapper } = await mounted();
    await wrapper.find('[data-path="/p/README.md"]').trigger("contextmenu");
    const payload = wrapper.emitted("contextmenu")?.[0]?.[0] as { path: string; paths: string[] };
    expect(payload.path).toBe("/p/README.md");
    expect(payload.paths).toEqual(["/p/README.md"]);
  });

  it("renders the toolbar and settings menu from props", async () => {
    let ran = 0;
    const { wrapper } = await mounted({
      actions: [{ id: "new", label: "New file", run: () => (ran += 1) }],
      menu: [{ id: "hidden", label: "Show hidden", checked: true, run: () => (ran += 10) }],
    });
    await wrapper.find('button[aria-label="New file"]').trigger("click");
    await wrapper.find('button[aria-haspopup="menu"]').trigger("click");
    const item = wrapper.find('[role="menuitemcheckbox"]');
    expect(item.attributes("aria-checked")).toBe("true");
    await item.trigger("click");
    expect(ran).toBe(11);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it("moves a dragged file into a folder and refuses a folder into itself", async () => {
    const { wrapper, tree, provider } = await mounted();
    const store: Record<string, string> = {};
    const transfer = {
      types: [] as string[],
      effectAllowed: "",
      dropEffect: "",
      setData(type: string, value: string) {
        store[type] = value;
        this.types.push(type);
      },
      getData: (type: string) => store[type] ?? "",
    };
    fire(wrapper.find('[data-path="/p/README.md"]').element, "dragstart", transfer);
    fire(wrapper.find('[data-path="/p/docs"]').element, "dragover", transfer);
    fire(wrapper.find('[data-path="/p/docs"]').element, "drop", transfer);
    await flushPromises();
    expect(provider.exists("/p/docs/README.md")).toBe(true);
    expect(tree.get("/p/README.md")).toBeUndefined();

    const errors: string[] = [];
    tree.on("error", (error) => errors.push(error.code));
    fire(wrapper.find('[data-path="/p/docs"]').element, "dragstart", transfer);
    fire(wrapper.find('[data-path="/p/docs"]').element, "drop", transfer);
    await flushPromises();
    expect(errors).toEqual([]);
    expect(tree.get("/p/docs")).toBeDefined();
  });

  it("lets the host render the rename input through the edit slot", async () => {
    const provider = createMemoryProvider(FILES, "/p");
    const tree = createTree({ provider, root: "/p", schedule: (run) => run() });
    await tree.start();
    const wrapper = mount(FileTree, {
      props: { tree },
      slots: {
        "edit-input": `<template #edit-input="{ value, renaming }"><b class="host-input">{{ renaming }}:{{ value }}</b></template>`,
      },
      attachTo: document.body,
    });
    await flushPromises();
    tree.startRename("/p/README.md");
    await flushPromises();
    expect(wrapper.find(".host-input").text()).toBe("true:README.md");
    expect(wrapper.find("input.jft-edit").exists()).toBe(false);
  });
});
