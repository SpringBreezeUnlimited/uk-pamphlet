import {doc, onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

function addText(parent, tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  parent.append(element);
  return element;
}

const first = document.getElementById("firstGym");
onSnapshot(doc(db, "gymContent", "first"), snapshot => {
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  first.querySelector(".venue-head h2").textContent = data.title || "第1体育館";
  first.querySelector(".venue-head p").textContent = data.description || "";
  const schedule = first.querySelector(".schedule");
  schedule.replaceChildren();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    const row = addText(schedule, "div", "schedule-row", "");
    addText(row, "div", "schedule-time", "時間未定");
    addText(row, "div", "schedule-act pending", "セットリストを準備中です。");
  }
  for (const item of items) {
    const row = addText(schedule, "div", "schedule-row", "");
    addText(row, "div", "schedule-time", item.time || "時間未定");
    const act = addText(row, "div", "schedule-act", "");
    addText(act, "div", "schedule-act-name", item.act || "内容を準備中です");
    if (item.description) addText(act, "div", "schedule-act-description", item.description);
  }
}, error => console.warn("第1体育館の内容を読み込めませんでした", error));

const second = document.getElementById("secondGym");
onSnapshot(doc(db, "gymContent", "second"), snapshot => {
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  second.querySelector(".venue-head h2").textContent = data.title || "第2体育館";
  second.querySelector(".venue-head p").textContent = data.description || "";
  const exhibits = second.querySelector(".exhibits");
  exhibits.replaceChildren();
  const items = Array.isArray(data.items) ? data.items.slice(0, 20) : [];
  if (!items.length) addText(exhibits, "p", "pending", "団体紹介を準備中です。");
  for (const item of items) {
    const article = addText(exhibits, "article", "exhibit", "");
    addText(article, "h3", "", item.name || "団体名未設定");
    if (typeof item.photo === "string" && item.photo.startsWith("data:image/jpeg;base64,")) {
      const image = document.createElement("img");
      image.className = "exhibit-photo";
      image.src = item.photo;
      image.alt = `${item.name || "団体"}の写真`;
      article.append(image);
    }
    addText(article, "p", "", item.description || "説明文を準備中です。");
  }
}, error => console.warn("第2体育館の内容を読み込めませんでした", error));
