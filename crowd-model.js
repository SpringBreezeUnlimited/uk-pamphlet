export const STATUS = Object.freeze({
  unknown: "未更新",
  quiet: "空いている",
  moderate: "やや混雑",
  busy: "混雑",
  closed: "受付停止・終了",
  none: "なし",
});
export const STALE_MS = 30 * 60 * 1000;
export function crowdState(record, connected, now = Date.now()) {
  const code = record && Object.hasOwn(STATUS, record.status) ? record.status : "unknown";
  if (code === "none") return {tone: "unknown", compact: "情報なし", text: "情報なし"};
  const time = record?.updatedAt?.toMillis?.() || 0;
  const known = code !== "unknown" && time > 0;
  const stale = known && now - time >= STALE_MS;
  const label = STATUS[code];
  const clock = known ? new Date(time).toLocaleTimeString("ja-JP", {timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit"}) : "";
  return {
    tone: !connected || stale ? "unknown" : code,
    compact: !connected ? "通信確認中" : stale ? "要確認" : label,
    text: !connected
      ? `最新情報を取得できません${known ? `（前回：${label}・${clock}更新）` : ""}`
      : known ? `${label}・${clock}更新${stale ? "（30分以上経過・要確認）" : ""}` : "混雑状況：未更新",
  };
}
export function flattenEvents(data) {
  const result = [];
  const ids = new Set();
  for (const [zone, group] of Object.entries(data)) {
    if (!Array.isArray(group.items)) throw new Error("催事データの形式を確認してください。");
    for (const item of group.items) {
      if (!item.name || item.name === "（なし）") continue;
      if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)) {
        throw new Error("催事IDが未設定または重複しています。公開中の催事データを確認してください。");
      }
      ids.add(item.id);
      result.push({...item, zone, zoneLabel: group.label || zone});
    }
  }
  return result;
}
