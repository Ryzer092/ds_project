/** 日本時間の YYYY-MM-DD。 */
export function jstDate(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export function jstDayForHash(now = new Date()): string {
  return jstDate(now).replaceAll("-", "");
}
