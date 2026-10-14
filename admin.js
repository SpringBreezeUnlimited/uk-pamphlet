import {signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {auth, watchAdmin} from "./admin-access.js";
import {collection, doc, onSnapshot, writeBatch, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

const $ = id => document.getElementById(id);
const next = new URLSearchParams(location.search).get("next");
const destination = ["editor.html", "announcement-admin.html", "popup-announcement-admin.html", "survey-admin.html", "greeting-admin.html", "gym-admin.html"].includes(next) ? next : null;
let signingIn = false;
const counterRef = collection(db, "visitCounters");
let stopCounter = null;
let counterReady = false;
function status(text) { $("status").textContent = text; }
function showLogin() { $("loginPanel").hidden = false; $("menuPanel").hidden = true; }
function showMenu() { $("loginPanel").hidden = true; $("menuPanel").hidden = false; }
function failure(error) {
  if (error?.code === "auth/too-many-requests") return "ログインの試行が多いため、しばらく待ってから再試行してください。";
  if (error?.code === "auth/network-request-failed") return "通信に失敗しました。接続を確認してください。";
  if (error?.code?.startsWith("auth/")) return "ログインできません。メールアドレス・パスワードを確認してください。";
  return "管理者権限を確認できません。通信とアカウント設定を確認してください。";
}
function counterStatus(message, error = false) {
  $("counterStatus").textContent = message;
  $("counterStatus").classList.toggle("error", error);
}
function watchCounter() {
  if (stopCounter) return;
  stopCounter = onSnapshot(counterRef, {includeMetadataChanges: true}, snapshot => {
    const count = snapshot.docs.reduce((total, item) => total + (Number.isInteger(item.data().count) ? item.data().count : 0), 0);
    counterReady = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
    $("visitCount").textContent = `${count.toLocaleString("ja-JP")} 回`;
    $("resetVisitCount").disabled = !counterReady;
    if (snapshot.metadata.fromCache) counterStatus("最新の回数を確認しています…");
    else if (!snapshot.metadata.hasPendingWrites) counterStatus("");
  }, () => {
    counterReady = false;
    $("resetVisitCount").disabled = true;
    $("visitCount").textContent = "取得できません";
    counterStatus("アクセス数を取得できません。通信とFirestoreのルールを確認してください。", true);
    stopCounter = null;
  });
}
watchAdmin({
  checking: message => { $("loginPanel").hidden = true; $("menuPanel").hidden = true; status(message || "ログイン状態を確認しています…"); },
  authorized: (user, profile) => {
    $("identity").textContent = `${profile.displayName || "管理者"}（${user.email || ""}）`;
    if (destination) { location.replace(destination); return; }
    showMenu(); status("管理者としてログインしています。"); watchCounter();
  },
  unauthorized: () => { stopCounter?.(); stopCounter = null; showLogin(); status("このアカウントには管理者権限がありません。管理者のアカウントでログインしてください。"); },
  signedOut: () => { stopCounter?.(); stopCounter = null; if (!signingIn) { showLogin(); status("混雑状況更新ページと同じ管理者アカウントでログインしてください。"); } },
  failed: error => { stopCounter?.(); stopCounter = null; showLogin(); status(failure(error)); },
});
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  signingIn = true; $("loginButton").disabled = true; status("ログインしています…");
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    $("password").value = "";
  } catch (error) { showLogin(); status(failure(error)); }
  finally { signingIn = false; $("loginButton").disabled = false; }
});
$("logout").addEventListener("click", async () => {
  try { await signOut(auth); } catch (error) { status(failure(error)); }
});
$("resetVisitCount").addEventListener("click", async () => {
  if (!counterReady || !confirm("表紙のアクセス数を0回に戻しますか？")) return;
  if (!navigator.onLine) { counterStatus("通信が切れています。接続が戻ってから再試行してください。", true); return; }
  $("resetVisitCount").disabled = true;
  counterStatus("リセットしています…");
  try {
    const batch = writeBatch(db);
    for (let shard = 0; shard < 20; shard++) {
      batch.set(doc(counterRef, String(shard)), {count: 0, updatedAt: serverTimestamp()});
    }
    await batch.commit();
    counterStatus("アクセス数を0回に戻しました。");
  } catch (error) {
    counterStatus(error.code === "permission-denied" ? "リセット権限がありません。管理者権限とFirestoreのルールを確認してください。" : "リセットできませんでした。通信を確認してください。", true);
  } finally { $("resetVisitCount").disabled = !counterReady; }
});
