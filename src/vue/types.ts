import type { Component } from "vue";

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
