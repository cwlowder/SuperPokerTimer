export function centsToMoney(cents: number): { dollars: string; cents: string } {
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  return { dollars: String(d), cents: String(c).padStart(2, "0") };
}

/** Format a value stored as cents into a display string for "whole" denomination mode. */
export function centsToWhole(cents: number): string {
  return String(Math.abs(cents));
}
