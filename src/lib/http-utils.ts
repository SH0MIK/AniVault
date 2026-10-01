export function originOf(value: string): string | null {
  try { return new URL(value).origin; } catch { return null; }
}
