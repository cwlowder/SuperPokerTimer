export function msToClock(ms: number): string {
  ms = Math.max(0, ms);
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function centsToMoney(cents: number): { dollars: string; cents: string } {
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  return { dollars: String(d), cents: String(c).padStart(2, "0") };
}
