export interface ProblemCounts {
  errors: number;
  warnings: number;
}

export interface PublishedDiagnostics {
  uri: string;
  diagnostics: readonly { severity?: number }[];
}

export interface ProblemsOptions {
  toPath?: (uri: string) => string | null;
}

const ERROR = 1;
const WARNING = 2;

export function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    const path = decodeURIComponent(new URL(uri).pathname);
    return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
  } catch {
    return null;
  }
}

function countsOf(diagnostics: PublishedDiagnostics["diagnostics"]): ProblemCounts {
  let errors = 0;
  let warnings = 0;
  for (const { severity } of diagnostics) {
    if (severity === undefined || severity === ERROR) errors += 1;
    else if (severity === WARNING) warnings += 1;
  }
  return { errors, warnings };
}

export class Problems {
  private readonly toPath: (uri: string) => string | null;
  private readonly byServer = new Map<string, Map<string, ProblemCounts>>();
  private readonly listeners = new Set<() => void>();
  private merged: Map<string, ProblemCounts> | null = null;

  constructor(options: ProblemsOptions = {}) {
    this.toPath = options.toPath ?? fileUriToPath;
  }

  publish(server: string, params: PublishedDiagnostics): void {
    const path = this.toPath(params.uri);
    if (path === null) return;
    const counts = countsOf(params.diagnostics);
    const held = this.byServer.get(server) ?? new Map<string, ProblemCounts>();
    const before = held.get(path);
    const empty = counts.errors === 0 && counts.warnings === 0;
    if (!before && empty) return;
    if (before && before.errors === counts.errors && before.warnings === counts.warnings) return;
    if (empty) held.delete(path);
    else held.set(path, counts);
    if (held.size === 0) this.byServer.delete(server);
    else this.byServer.set(server, held);
    this.changed();
  }

  clear(server: string): void {
    if (this.byServer.delete(server)) this.changed();
  }

  counts(): ReadonlyMap<string, ProblemCounts> {
    if (this.merged) return this.merged;
    const merged = new Map<string, ProblemCounts>();
    for (const held of this.byServer.values()) {
      for (const [path, counts] of held) {
        const seen = merged.get(path);
        merged.set(path, {
          errors: (seen?.errors ?? 0) + counts.errors,
          warnings: (seen?.warnings ?? 0) + counts.warnings,
        });
      }
    }
    this.merged = merged;
    return merged;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.merged = null;
    for (const listener of this.listeners) listener();
  }
}
