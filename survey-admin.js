import {doc, getDocFromServer, setDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";
import {watchAdmin} from "./admin-access.js";

const status = document.getElementById("status");
const editor = document.getElementById("editor");
const form = document.getElementById("surveyForm");
const label = document.getElementById("label");
const url = document.getElementById("url");
const popupEnabled = document.getElementById("popupEnabled");
const save = document.getElementById("save");
const survey = doc(db, "siteContent", "survey");
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
      const snapshot = await getDocFromServer(survey);
      const data = snapshot.exists() ? snapshot.data() : {};
      label.value = typeof data.label === "string" ? data.label : "アンケートに回答する";
      url.value = typeof data.url === "string" ? data.url : "";
      popupEnabled.checked = data.popupEnabled === true;
      loaded = true;
      editor.hidden = false;
      showStatus("現在のアンケート設定を読み込みました。");
    } catch {
      showStatus("設定を読み込めません。通信とFirestoreのルールを確認してください。", true);
    } finally { loading = false; }
  },
  unauthorized: () => location.replace("admin.html?next=survey-admin.html"),
  signedOut: () => location.replace("admin.html?next=survey-admin.html"),
  failed: () => { editor.hidden = true; showStatus("管理者権限を確認できません。通信を確認して再読み込みしてください。", true); },
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const buttonLabel = label.value.trim() || "アンケートに回答する";
  const link = url.value.trim();
  if (link) {
    try {
      const parsed = new URL(link);
      if (parsed.protocol !== "https:") throw new Error("Invalid URL");
    } catch {
      showStatus("アンケートURLにはHTTPSの有効なURLを入力してください。", true);
      url.focus();
      return;
    }
  }
  if (popupEnabled.checked && !link) {
    showStatus("ポップアップを表示するにはアンケートURLを入力してください。", true);
    url.focus();
    return;
  }
  if (!navigator.onLine) { showStatus("通信が切れています。接続が戻ってから保存してください。", true); return; }
  save.disabled = true;
  showStatus("保存しています…");
  try {
    await setDoc(survey, {label: buttonLabel, url: link, popupEnabled: popupEnabled.checked, updatedAt: serverTimestamp()});
    label.value = buttonLabel;
    url.value = link;
    showStatus(!link ? "保存しました。表紙のアンケート欄は非表示になります。" : popupEnabled.checked
      ? "保存しました。表紙のアンケート欄とポップアップが有効になりました。"
      : "保存しました。表紙のアンケート欄を表示し、ポップアップは非表示にします。");
  } catch (error) {
    showStatus(error.code === "permission-denied" ? "保存権限がありません。管理者権限とFirestoreのルールを確認してください。" : "保存できませんでした。通信を確認して再試行してください。", true);
  } finally { save.disabled = false; }
});
