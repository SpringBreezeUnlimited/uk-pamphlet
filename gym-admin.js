import {doc, getDocFromServer, setDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";
import {watchAdmin} from "./admin-access.js";

const status = document.getElementById("status");
const editor = document.getElementById("editor");
const firstForm = document.getElementById("firstForm");
const secondForm = document.getElementById("secondForm");
const firstItems = document.getElementById("firstItems");
const secondItems = document.getElementById("secondItems");
const defaults = {
  first: {
    title: "Lion Tech - Fes 2026",
    description: "ステージで披露される、宇工祭ならではのパフォーマンスをお楽しみください。",
    items: Array.from({length: 4}, () => ({time: "時間未定", act: "出演団体を準備中です"})),
  },
  second: {
    title: "系ごとの展示",
    description: "4つの系が、それぞれの学びや技術の魅力を紹介します。",
    items: ["機械システム系", "電気情報システム系", "建築デザイン系", "環境建設システム系"]
      .map(name => ({name, photo: "", description: `${name}による展示を準備中です。`})),
  },
};
let loaded = false;
let loading = false;
let pendingPhotos = 0;

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function field(parent, labelText, tag, className, value, maxLength, required = false) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement(tag);
  input.className = className;
  input.value = value || "";
  input.maxLength = maxLength;
  input.required = required;
  label.append(input);
  parent.append(label);
  return input;
}

function button(parent, text, className, action) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", action);
  parent.append(element);
  return element;
}

function addFirst(item = {}) {
  if (firstItems.children.length >= 30) { showStatus("第1体育館は30行まで設定できます。", true); return; }
  const panel = document.createElement("div");
  panel.className = "item";
  field(panel, "時間", "input", "item-time", item.time, 40);
  field(panel, "出演団体・曲目など", "textarea", "item-act", item.act, 500, true);
  button(panel, "この行を削除", "danger", () => panel.remove());
  firstItems.append(panel);
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください。");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    let output = "";
    for (const maxSize of [1000, 800, 600, 400]) {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("写真を処理できませんでした。別の画像を選んでください。");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.8, .65, .5, .35]) {
        output = canvas.toDataURL("image/jpeg", quality);
        if (output.length < 100000) break;
      }
      if (output.length < 100000) break;
    }
    if (output.length >= 100000) throw new Error("写真の容量が大きすぎます。小さい画像を選んでください。");
    return output;
  } finally { URL.revokeObjectURL(source); }
}

function addSecond(item = {}) {
  if (secondItems.children.length >= 8) { showStatus("第2体育館は8団体まで設定できます。", true); return; }
  const panel = document.createElement("div");
  panel.className = "item";
  panel._photo = typeof item.photo === "string" && item.photo.startsWith("data:image/jpeg;base64,") ? item.photo : "";
  field(panel, "団体名", "input", "item-name", item.name, 100, true);
  field(panel, "説明文", "textarea", "item-description", item.description, 2000, true);
  const photoLabel = document.createElement("label");
  photoLabel.textContent = "写真";
  const photoInput = document.createElement("input");
  photoInput.type = "file";
  photoInput.accept = "image/*";
  photoLabel.append(photoInput);
  panel.append(photoLabel);
  const preview = document.createElement("img");
  preview.className = "preview";
  preview.alt = "選択中の団体写真";
  preview.src = panel._photo || "no-image.svg";
  panel.append(preview);
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    pendingPhotos++;
    photoInput.disabled = true;
    showStatus("写真を準備しています…");
    try {
      const photo = await compressImage(file);
      panel._photo = photo;
      preview.src = photo;
      showStatus("写真を選びました。第2体育館を保存すると公開されます。");
    } catch (error) { showStatus(error.message || "写真を読み込めませんでした。", true); }
    finally { pendingPhotos--; photoInput.value = ""; photoInput.disabled = false; }
  });
  const actions = document.createElement("div");
  actions.className = "actions";
  button(actions, "写真を削除", "secondary", () => {
    panel._photo = "";
    preview.src = "no-image.svg";
    showStatus("写真を削除対象にしました。保存すると公開されます。");
  });
  button(actions, "この団体を削除", "danger", () => panel.remove());
  panel.append(actions);
  secondItems.append(panel);
}

document.getElementById("addFirst").addEventListener("click", () => addFirst());
document.getElementById("addSecond").addEventListener("click", () => addSecond());

function populate(form, container, data, addItem) {
  form.elements.title.value = data.title || "";
  form.elements.description.value = data.description || "";
  container.replaceChildren();
  for (const item of Array.isArray(data.items) ? data.items : []) addItem(item);
}

async function save(form, gymId, items) {
  if (!navigator.onLine) { showStatus("通信が切れています。接続が戻ってから保存してください。", true); return; }
  if (gymId === "second" && pendingPhotos) { showStatus("写真の準備が終わってから保存してください。", true); return; }
  const title = form.elements.title.value.trim();
  const description = form.elements.description.value.trim();
  if (!title) { showStatus("見出しを入力してください。", true); return; }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  showStatus(`${gymId === "first" ? "第1" : "第2"}体育館を保存しています…`);
  try {
    await setDoc(doc(db, "gymContent", gymId), {title, description, items, updatedAt: serverTimestamp()});
    form.elements.title.value = title;
    form.elements.description.value = description;
    showStatus(`${gymId === "first" ? "第1" : "第2"}体育館を保存しました。来場者向けページに反映されます。`);
  } catch (error) {
    showStatus(error.code === "permission-denied" ? "保存権限がありません。管理者権限とFirestoreのルールを確認してください。" : "保存できませんでした。通信を確認して再試行してください。", true);
  } finally { submit.disabled = false; }
}

firstForm.addEventListener("submit", event => {
  event.preventDefault();
  const items = [...firstItems.children].map(panel => ({
    time: panel.querySelector(".item-time").value.trim(),
    act: panel.querySelector(".item-act").value.trim(),
  }));
  save(firstForm, "first", items);
});
secondForm.addEventListener("submit", event => {
  event.preventDefault();
  const items = [...secondItems.children].map(panel => ({
    name: panel.querySelector(".item-name").value.trim(),
    description: panel.querySelector(".item-description").value.trim(),
    photo: panel._photo || "",
  }));
  save(secondForm, "second", items);
});

watchAdmin({
  checking: message => { editor.hidden = true; showStatus(message || "管理者権限を確認しています…"); },
  authorized: async () => {
    if (loaded) { editor.hidden = false; return; }
    if (loading) return;
    loading = true;
    try {
      const [first, second] = await Promise.all([
        getDocFromServer(doc(db, "gymContent", "first")),
        getDocFromServer(doc(db, "gymContent", "second")),
      ]);
      populate(firstForm, firstItems, first.exists() ? first.data() : defaults.first, addFirst);
      populate(secondForm, secondItems, second.exists() ? second.data() : defaults.second, addSecond);
      loaded = true;
      editor.hidden = false;
      showStatus("現在の内容を読み込みました。第1・第2体育館をそれぞれ保存してください。");
    } catch { showStatus("体育館の内容を読み込めません。通信とFirestoreのルールを確認してください。", true); }
    finally { loading = false; }
  },
  unauthorized: () => location.replace("admin.html?next=gym-admin.html"),
  signedOut: () => location.replace("admin.html?next=gym-admin.html"),
  failed: () => { editor.hidden = true; showStatus("管理者権限を確認できません。通信を確認して再読み込みしてください。", true); },
});
