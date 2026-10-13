import {signInWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {auth, watchAdmin} from "./admin-access.js";

const $ = id => document.getElementById(id);
const next = new URLSearchParams(location.search).get("next");
const destination = ["editor.html", "announcement-admin.html", "greeting-admin.html"].includes(next) ? next : null;
let signingIn = false;
function status(text) { $("status").textContent = text; }
function showLogin() { $("loginPanel").hidden = false; $("menuPanel").hidden = true; }
function showMenu() { $("loginPanel").hidden = true; $("menuPanel").hidden = false; }
function failure(error) {
  if (error?.code === "auth/too-many-requests") return "ログインの試行が多いため、しばらく待ってから再試行してください。";
  if (error?.code === "auth/network-request-failed") return "通信に失敗しました。接続を確認してください。";
  if (error?.code?.startsWith("auth/")) return "ログインできません。メールアドレス・パスワードを確認してください。";
  return "管理者権限を確認できません。通信とアカウント設定を確認してください。";
}
watchAdmin({
  checking: message => { $("loginPanel").hidden = true; $("menuPanel").hidden = true; status(message || "ログイン状態を確認しています…"); },
  authorized: (user, profile) => {
    $("identity").textContent = `${profile.displayName || "管理者"}（${user.email || ""}）`;
    if (destination) { location.replace(destination); return; }
    showMenu(); status("管理者としてログインしています。");
  },
  unauthorized: () => { showLogin(); status("このアカウントには管理者権限がありません。管理者のアカウントでログインしてください。"); },
  signedOut: () => { if (!signingIn) { showLogin(); status("混雑状況更新ページと同じ管理者アカウントでログインしてください。"); } },
  failed: error => { showLogin(); status(failure(error)); },
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
