const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayInTimeZone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function formatChineseDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

export function formatWeekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function friendlyDateLabel(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff < 0) return "历史";
  return `${diff} 天后`;
}

export function isPastDate(date: string, today: string): boolean {
  return daysBetween(today, date) < 0;
}

export function isWithinWindow(target: string, other: string, windowDays: number): boolean {
  return Math.abs(daysBetween(target, other)) <= windowDays;
}
