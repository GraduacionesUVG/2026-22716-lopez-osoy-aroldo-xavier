export function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

export function argString(args: Record<string, string | boolean>, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing required --${key}`);
}
