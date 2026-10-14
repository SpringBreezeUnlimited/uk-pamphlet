import {doc, getDocFromServer, setDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";
import {watchAdmin} from "./admin-access.js";

const status = document.getElementById("status");
const editor = document.getElementById("editor");
const form = document.getElementById("popupAnnouncementForm");
const message = document.getElementById("message");
const enabled = document.getElementById("enabled");
const save = document.getElementById("save");
const announcement = doc(db, "siteContent", "popupAnnouncement");
let loaded = false;
let loading = false;

function showStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

watchAdmin({
  checking: text => { editor.hidden = true; showStatus(text || "管理者権限を確認しています…"); },
  authorized: async () => {
    if (loaded) { editor.hidden = false; return; }
    if (loading) return;
    loading = true;
    try {
      const snapshot = await getDocFromServer(announcement);
      const data = snapshot.exists() ? snapshot.data() : {};
      message.value = typeof data.message === "string" ? data.message : "";
      enabled.checked = data.enabled === true;
      loaded = true;
      editor.hidden = false;
      showStatus("現在のポップアップ設定を読み込みました。");
    } catch {
      showStatus("設定を読み込めません。通信とFirestoreのルールを確認してください。", true);
    } finally { loading = false; }
  },
  unauthorized: () => location.replace("admin.html?next=popup-announcement-admin.html"),
  signedOut: () => location.replace("admin.html?next=popup-announcement-admin.html"),
  failed: () => { editor.hidden = true; showStatus("管理者権限を確認できません。通信を確認して再読み込みしてください。", true); },
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = message.value.trim();
  if (enabled.checked && !value) {
    showStatus("ポップアップを表示するにはお知らせの内容を入力してください。", true);
    message.focus();
    return;
  }
  if (!navigator.onLine) { showStatus("通信が切れています。接続が戻ってから保存してください。", true); return; }
  save.disabled = true;
  showStatus("保存しています…");
  try {
    await setDoc(announcement, {message: value, enabled: enabled.checked, updatedAt: serverTimestamp()});
    message.value = value;
    showStatus(enabled.checked ? "保存しました。表紙でポップアップが表示されます。" : "保存しました。ポップアップは非表示です。");
  } catch (error) {
    showStatus(error.code === "permission-denied" ? "保存権限がありません。管理者権限とFirestoreのルールを確認してください。" : "保存できませんでした。通信を確認して再試行してください。", true);
  } finally { save.disabled = false; }
});
