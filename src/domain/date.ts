/** Local calendar date; toISOString would give yesterday before 08:00 in Taiwan. */
export function today(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
