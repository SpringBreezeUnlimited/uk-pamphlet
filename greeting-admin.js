import {doc, getDocFromServer, setDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";
import {watchAdmin} from "./admin-access.js";

const status = document.getElementById("status");
const editor = document.getElementById("editor");
const forms = [...editor.querySelectorAll("form[data-person]")];
const defaults = {
  principal: {name: "校長先生", message: "校長先生からのごあいさつ文を準備中です。"},
  fulltime: {name: "全日制生徒会長", message: "全日制生徒会長からのごあいさつ文を準備中です。"},
  parttime: {name: "定時制生徒会長", message: "定時制生徒会長からのごあいさつ文を準備中です。"},
};
let loaded = false;
let loading = false;

function showStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function showPhoto(form) {
  form.querySelector(".preview").src = form._photo || "no-image.svg";
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
    for (const maxSize of [1200, 1000, 800, 600]) {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("写真を処理できませんでした。別の画像を選んでください。");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.82, .7, .55, .4]) {
        output = canvas.toDataURL("image/jpeg", quality);
        if (output.length < 180000) break;
      }
      if (output.length < 180000) break;
    }
    if (output.length >= 180000) throw new Error("写真の容量が大きすぎます。小さい画像を選んでください。");
    return output;
  } finally { URL.revokeObjectURL(source); }
}

for (const form of forms) {
  const fileInput = form.elements.photo;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.disabled = true;
    showStatus("写真を準備しています…");
    try {
      form._photo = await compressImage(file);
      showPhoto(form);
      showStatus(`${form.querySelector("h2").textContent}の写真を選びました。保存すると公開されます。`);
    } catch (error) { showStatus(error.message || "写真を読み込めませんでした。", true); }
    finally { fileInput.value = ""; fileInput.disabled = false; }
  });
  form.querySelector(".remove-photo").addEventListener("click", () => {
    form._photo = "";
    showPhoto(form);
    showStatus(`${form.querySelector("h2").textContent}の写真を削除対象にしました。保存すると公開されます。`);
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const message = form.elements.message.value.trim();
    if (!name || !message) { showStatus("氏名と挨拶文を入力してください。", true); return; }
    if (!navigator.onLine) { showStatus("通信が切れています。接続が戻ってから保存してください。", true); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    showStatus(`${form.querySelector("h2").textContent}の挨拶を保存しています…`);
    try {
      await setDoc(doc(db, "greetings", form.dataset.person), {name, message, photo: form._photo || "", updatedAt: serverTimestamp()});
      form.elements.name.value = name;
      form.elements.message.value = message;
      showStatus(`${form.querySelector("h2").textContent}の挨拶を保存しました。来場者向けページに反映されます。`);
    } catch (error) {
      showStatus(error.code === "permission-denied" ? "保存権限がありません。管理者権限とFirestoreのルールを確認してください。" : "保存できませんでした。通信を確認して再試行してください。", true);
    } finally { button.disabled = false; }
  });
}

watchAdmin({
  checking: message => { editor.hidden = true; showStatus(message || "管理者権限を確認しています…"); },
  authorized: async () => {
    if (loaded) { editor.hidden = false; return; }
    if (loading) return;
    loading = true;
    try {
      const snapshots = await Promise.all(forms.map(form => getDocFromServer(doc(db, "greetings", form.dataset.person))));
      forms.forEach((form, i) => {
        const data = snapshots[i].exists() ? snapshots[i].data() : defaults[form.dataset.person];
        form.elements.name.value = data.name || "";
        form.elements.message.value = data.message || "";
        form._photo = data.photo || "";
        showPhoto(form);
      });
      loaded = true;
      editor.hidden = false;
      showStatus("現在の挨拶を読み込みました。編集後、それぞれの保存ボタンを押してください。");
    } catch { showStatus("挨拶を読み込めません。通信とFirestoreのルールを確認してください。", true); }
    finally { loading = false; }
  },
  unauthorized: () => location.replace("admin.html?next=greeting-admin.html"),
  signedOut: () => location.replace("admin.html?next=greeting-admin.html"),
  failed: () => { editor.hidden = true; showStatus("管理者権限を確認できません。通信を確認して再読み込みしてください。", true); },
});
