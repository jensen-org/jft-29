export function trimTrailing(path: string): string {
  if (path.length < 2) return path;
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) end -= 1;
  return end === 0 ? "/" : path.slice(0, end);
}

export function join(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${trimTrailing(parent)}/${name}`;
}

export function dirname(path: string): string {
  const trimmed = trimTrailing(path);
  const cut = trimmed.lastIndexOf("/");
  return cut <= 0 ? "/" : trimmed.slice(0, cut);
}

export function basename(path: string): string {
  const trimmed = trimTrailing(path);
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

export function isWithin(root: string, path: string): boolean {
  const base = trimTrailing(root);
  return path === base || base === "/" || path.startsWith(`${base}/`);
}

export function isStrictlyWithin(root: string, path: string): boolean {
  return path !== trimTrailing(root) && isWithin(root, path);
}

export function ancestorsBetween(root: string, path: string): string[] {
  const base = trimTrailing(root);
  const chain: string[] = [];
  let current = dirname(path);
  while (isWithin(base, current)) {
    chain.unshift(current);
    if (current === base) break;
    current = dirname(current);
  }
  return chain;
}

export function replacePrefix(path: string, from: string, to: string): string {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

export function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? { stem: name, ext: "" } : { stem: name.slice(0, dot), ext: name.slice(dot) };
}
