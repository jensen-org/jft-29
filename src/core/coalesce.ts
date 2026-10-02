import { isStrictlyWithin } from "./paths.js";
import type { FsEvent } from "./types.js";

export function coalesce(batch: FsEvent[]): FsEvent[] {
  const ordered: (FsEvent | null)[] = [];
  const latest = new Map<string, number>();

  const forget = (path: string): void => {
    const at = latest.get(path);
    if (at !== undefined) ordered[at] = null;
    latest.delete(path);
  };
  const keep = (path: string, event: FsEvent): void => {
    latest.set(path, ordered.length);
    ordered.push(event);
  };

  for (const event of batch) {
    switch (event.type) {
      case "add": {
        const held = latest.get(event.path);
        const prior = held === undefined ? undefined : ordered[held];
        if (prior?.type === "delete") {
          forget(event.path);
          keep(event.path, { type: "change", path: event.path });
        } else {
          forget(event.path);
          keep(event.path, event);
        }
        break;
      }
      case "delete": {
        const held = latest.get(event.path);
        const prior = held === undefined ? undefined : ordered[held];
        if (prior?.type === "add") {
          forget(event.path);
        } else {
          forget(event.path);
          keep(event.path, event);
        }
        break;
      }
      case "change": {
        const held = latest.get(event.path);
        const prior = held === undefined ? undefined : ordered[held];
        if (!prior) keep(event.path, event);
        break;
      }
      case "rename":
        forget(event.from);
        forget(event.to);
        keep(event.to, event);
        break;
      case "rescan":
        for (const path of [...latest.keys()]) {
          if (path === event.path || isStrictlyWithin(event.path, path)) forget(path);
        }
        keep(event.path, event);
        break;
    }
  }

  const events = ordered.filter((event): event is FsEvent => event !== null);
  const deleted = events.flatMap((event) => (event.type === "delete" ? [event.path] : []));
  return events.filter(
    (event) =>
      event.type !== "delete" ||
      !deleted.some((other) => other !== event.path && isStrictlyWithin(other, event.path)),
  );
}
