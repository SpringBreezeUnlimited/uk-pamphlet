const stack = document.getElementById("floor-stack");
const cards = document.getElementById("detail-cards");
const detailTitle = document.getElementById("detail-title");
const detailSummary = document.getElementById("detail-summary");
const connection = document.getElementById("connection");
const tabs = document.getElementById("floor-tabs");
const autoButton = document.getElementById("toggle-auto");
const fullscreenButton = document.getElementById("fullscreen");
const demo = new URLSearchParams(location.search).has("demo") || location.protocol === "file:";
const floors = [
  {zone:"1f",number:1},
  {zone:"2f",number:2},
  {zone:"3f",number:3},
];
const statusNames = {quiet:"空き",moderate:"やや混雑",busy:"混雑",closed:"終了",none:"情報なし",unknown:"要確認",empty:"催事なし"};
const layout = ["stair","toilet",1,2,3,4,5,"stair",6,7,"toilet",8];
const intervalMs = 18000;
let events = [];
let records = new Map();
let fresh = false;
let failed = false;
let selectedIndex = 0;
let automatic = !matchMedia("(max-width: 1050px)").matches;
let timer;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function flattenEvents(data) {
  return Object.entries(data).flatMap(([zone, group]) => (group.items || [])
    .filter(item => item.name && item.name !== "（なし）")
    .map(item => ({...item, zone, zoneLabel:group.label || zone})));
}
function roomNumber(floor, position) { return String(floor.number * 100 + position); }
function eventAt(floor, position) {
  const room = roomNumber(floor, position);
  const id = floor.zone + "-" + String(position).padStart(2, "0");
  return events.find(event => event.id === id)
    || events.find(event => event.zone === floor.zone && (event.room || "").startsWith(room));
}
function statusOf(event) {
  if (!event) return "empty";
  if (!demo && (!fresh || !navigator.onLine || failed)) return "unknown";
  const status = records.get(event.id)?.status;
  return Object.hasOwn(statusNames, status) && status !== "empty" ? status : "unknown";
}
function toneOf(status) { return status === "none" ? "unknown" : status; }
function renderConnection() {
  const state = demo ? "demo" : (!fresh || !navigator.onLine || failed ? "error" : "ok");
  connection.dataset.state = state;
  connection.textContent = demo ? "表示確認用のサンプルです" : failed || !navigator.onLine ? "最新情報を取得できません。会場でご確認ください" : fresh ? "最新の混雑状況を表示中" : "最新情報を確認しています…";
}
function roomCell(floor, position) {
  const event = eventAt(floor, position);
  const status = statusOf(event);
  const cell = element("div", "building-cell room");
  cell.dataset.tone = toneOf(status);
  const number = roomNumber(floor, position);
  cell.append(element("strong", "", number), element("span", "", statusNames[status]));
  cell.setAttribute("aria-label", number + "教室、" + (event?.name || "催事なし") + "、" + statusNames[status]);
  return cell;
}
function utilityCell(type) {
  const cell = element("div", "building-cell " + type);
  if (type === "stair") cell.append(element("b", "", "▂▅"), element("span", "", "階段"));
  else cell.textContent = "トイレ";
  return cell;
}
function renderBuilding() {
  stack.replaceChildren();
  for (const floor of [...floors].reverse()) {
    const assembly = element("div", "floor-assembly");
    assembly.dataset.selected = String(floors[selectedIndex].zone === floor.zone);
    const marker = element("button", "floor-marker");
    marker.type = "button";
    marker.setAttribute("aria-label", floor.number + "階の催事を表示");
    marker.append(element("strong", "", floor.number + "F"), element("small", "", floor.number + "階"));
    marker.addEventListener("click", () => selectFloor(floors.indexOf(floor), true));
    const facade = element("div", "facade");
    for (const item of layout) facade.append(typeof item === "number" ? roomCell(floor, item) : utilityCell(item));
    assembly.append(marker, facade);
    stack.append(assembly);
  }
}
function detailCard(floor, position) {
  const event = eventAt(floor, position);
  const status = statusOf(event);
  const number = roomNumber(floor, position);
  const card = element("article", "detail-card");
  card.dataset.tone = toneOf(status);
  card.append(element("div", "number", number + "教室"), element("div", "event-name", event?.name || "催事なし"), element("div", "status", statusNames[status]));
  card.setAttribute("aria-label", number + "教室、" + (event?.name || "催事なし") + "、" + statusNames[status]);
  return card;
}
function renderDetails() {
  const floor = floors[selectedIndex];
  detailTitle.textContent = floor.number + "階";
  cards.replaceChildren();
  let busy = 0;
  let moderate = 0;
  for (let position = 1; position <= 8; position++) {
    const event = eventAt(floor, position);
    const status = statusOf(event);
    if (status === "busy") busy++;
    if (status === "moderate") moderate++;
    cards.append(detailCard(floor, position));
  }
  detailSummary.textContent = !demo && (!fresh || !navigator.onLine || failed) ? "混雑数を確認中" : "混雑 " + busy + "件 · やや混雑 " + moderate + "件";
}
function renderTabs() {
  tabs.replaceChildren();
  floors.forEach((floor, index) => {
    const button = element("button", "floor-tab", floor.number + "階");
    button.type = "button";
    if (index === selectedIndex) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => selectFloor(index, true));
    tabs.append(button);
  });
}
function render() {
  renderConnection();
  renderBuilding();
  renderDetails();
  renderTabs();
  autoButton.textContent = automatic ? "自動切替を停止" : "自動切替を再開";
}
function restartTimer() {
  clearInterval(timer);
  if (automatic) timer = setInterval(() => selectFloor((selectedIndex + 1) % floors.length, false), intervalMs);
}
function selectFloor(index, manual) {
  selectedIndex = (index + floors.length) % floors.length;
  render();
  if (manual) restartTimer();
}
document.getElementById("previous").addEventListener("click", () => selectFloor(selectedIndex - 1, true));
document.getElementById("next").addEventListener("click", () => selectFloor(selectedIndex + 1, true));
autoButton.addEventListener("click", () => {automatic = !automatic; render(); restartTimer();});
fullscreenButton.addEventListener("click", async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch {}
});
document.addEventListener("fullscreenchange", () => {fullscreenButton.textContent = document.fullscreenElement ? "全画面を終了" : "全画面表示";});
document.addEventListener("keydown", event => {
  if (["ArrowLeft","ArrowRight"].includes(event.key) && !["INPUT","TEXTAREA"].includes(document.activeElement?.tagName)) selectFloor(selectedIndex + (event.key === "ArrowRight" ? 1 : -1), true);
});
window.addEventListener("offline", render);
window.addEventListener("online", () => {fresh = false; render();});
setInterval(render, 30000);

async function initialize() {
try {
  if (demo) {
    let data;
    if (location.protocol === "file:") {
      data = window.MAP_LOCAL_DATA?.events;
      if (!data) throw new Error("ローカルの催事データを読み込めませんでした");
    } else {
      const response = await fetch("events.json", {cache:"no-store"});
      if (!response.ok) throw new Error("催事データを読み込めませんでした");
      data = await response.json();
    }
    events = flattenEvents(data).filter(event => floors.some(floor => floor.zone === event.zone));
    const samples = ["quiet","quiet","moderate","busy","closed","unknown"];
    records = new Map(events.map((event, index) => [event.id, {status:samples[index % samples.length]}]));
    fresh = true;
    render();
  } else {
    const {loadEventsData, watchEventsVersion} = await import("./event-data.js");
    const loadEvents = async () => {
      const {data,revision} = await loadEventsData();
      events = flattenEvents(data).filter(event => floors.some(floor => floor.zone === event.zone));
      render();
      return revision;
    };
    const revision = await loadEvents();
    watchEventsVersion(() => loadEvents().catch(() => {failed = true; render();}), revision);
    const {watchCrowd} = await import("./crowd-firebase.js");
    watchCrowd((next, isFresh) => {records = next; fresh = isFresh; failed = false; render();}, () => {failed = true; fresh = false; render();});
  }
  restartTimer();
} catch {
  failed = true;
  connection.dataset.state = "error";
  connection.textContent = "表示を準備できません。通信とファイルの配置をご確認ください";
}
}
initialize();
