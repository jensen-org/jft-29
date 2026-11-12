import type { Component } from "vue";
import type { TreeNode } from "../core/types.js";

export interface Decoration {
  badge?: string;
  tone?: string;
  hint?: string;
  propagate?: boolean;
}

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: Component;
  run: () => void;
  when?: () => boolean;
  disabled?: () => boolean;
}

export interface RowAction {
  id: string;
  label: string;
  icon: Component;
  danger?: boolean;
  run: (node: TreeNode) => void;
  when?: (node: TreeNode) => boolean;
}

export interface MenuEntry {
  id: string;
  label: string;
  checked?: boolean;
  separator?: boolean;
  disabled?: boolean;
  run?: () => void;
}

export interface ContextMenuPayload {
  event: MouseEvent;
  path: string | null;
  paths: string[];
}

export interface DragStartPayload {
  event: DragEvent;
  paths: string[];
}

export interface DropPayload {
  event: DragEvent;
  target: string;
}

export const PATHS_MIME = "application/x-jft-paths";
