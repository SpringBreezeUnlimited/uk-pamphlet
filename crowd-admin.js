import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  app, db, collection, doc, onSnapshot, query, orderBy, limit, runTransaction,
  watchCrowd, updateCrowd, initializeCrowd,
} from "./crowd-firebase.js";
import {STATUS, crowdState, flattenEvents} from "./crowd-model.js";
import {loadEventsData, watchEventsVersion} from "./event-data.js";

const $ = id => document.getElementById(id);
const auth = getAuth(app);
let events = [];
let profile = null;
let user = null;
let records = new Map();
let fresh = false;
let sessionVersion = 0;
let sessionSubscriptions = [];
let adminSubscriptions = [];
let adminWatching = false;
let people = new Map();
let recentHistory = [];
const pending = new Set();
let eventDataRequest = 0;

function message(text) { $("message").textContent = text; }
function failure(error) {
  const code = error?.code || "";
  if (code.startsWith("auth/")) {
    if (code === "auth/network-request-failed") return "通信に失敗しました。接続を確認してください。";
    if (code === "auth/too-many-requests") return "ログインの試行が多いため、少し待ってから試してください。";
    if (code === "auth/operation-not-allowed") return "Firebaseでメール／パスワードのログインを有効にしてください。";
    return "ログインできません。メールアドレス・パスワードとアカウントの状態を確認してください。";
  }
  if (code.includes("permission-denied")) return "権限を確認できません。管理者に担当設定・Firestoreルールの確認を依頼してください。";
  return code ? "処理に失敗しました。接続を確認して再度お試しください。" : error.message;
}
function isAdmin() { return profile?.active === true && profile.role === "admin"; }
function allowed(event) {
  return profile?.active === true && (isAdmin() || (profile.role === "staff" && profile.eventIds?.includes(event.id)));
}
function clearAdmin() {
  adminSubscriptions.forEach(stop => stop());
  adminSubscriptions = [];
  adminWatching = false;
  people.clear();
  recentHistory = [];
  $("staffList").replaceChildren();
  $("history").replaceChildren();
}
function clearSession() {
  sessionSubscriptions.forEach(stop => stop());
  sessionSubscriptions = [];
  clearAdmin();
  profile = null;
  records.clear();
  fresh = false;
  pending.clear();
  $("eventCards").replaceChildren();
  $("adminPanel").hidden = true;
  $("eventSection").hidden = true;
  $("permissionForm").reset();
}

function renderCards() {
  $("eventCards").replaceChildren();
  const visible = events.filter(allowed);
  for (const event of visible) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.eventId = event.id;
    const location = document.createElement("p");
    location.className = "event-location";
    location.textContent = event.room || event.zoneLabel;
    const heading = document.createElement("h3");
    heading.textContent = event.name;
    const details = [];
    for (const value of [event.category, event.time, event.desc]) {
      if (!value) continue;
      const line = document.createElement("p");
      line.className = "event-info";
      line.textContent = value;
      details.push(line);
    }
    if (typeof event.image === "string" && /^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(event.image)) {
      const photo = document.createElement("img");
      photo.className = "event-photo";
      photo.src = event.image;
      photo.alt = `${event.name}の写真`;
      photo.loading = "lazy";
      details.push(photo);
    }
    const badge = document.createElement("p");
    badge.className = "crowd-badge";
    const buttons = document.createElement("div");
    buttons.className = "choices";
    for (const [code, label] of Object.entries(STATUS)) {
      if (code === "unknown") continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.status = code;
      button.textContent = label;
      button.addEventListener("click", async () => {
        if (!user || pending.has(event.id) || !allowed(event)) return;
        const version = sessionVersion;
        pending.add(event.id);
        renderStatuses();
        message(`${event.room || event.name} の状況を送信しています…`);
        try {
          await updateCrowd(event.id, code, user);
          if (version === sessionVersion) message(`${event.room || event.name} を「${label}」に更新しました。`);
        } catch (error) {
          if (version === sessionVersion) message(failure(error));
        } finally {
          if (version === sessionVersion) { pending.delete(event.id); renderStatuses(); }
        }
      });
      buttons.append(button);
    }
    card.append(location, heading, ...details, badge, buttons);
    $("eventCards").append(card);
  }
  if (!visible.length) $("eventCards").textContent = "担当する催事がありません。管理者に割り当てを依頼してください。";
  renderStatuses();
}
function renderStatuses() {
  const connected = fresh && navigator.onLine;
  $("connection").textContent = connected ? "接続中。更新から30分以上経つと、来場者には「要確認」と表示します。"
    : "最新情報を確認できません。通信の復旧を待ち、戻らない場合は再読み込みしてください。";
  for (const card of $("eventCards").children) {
    const id = card.dataset.eventId;
    const record = records.get(id);
    const state = crowdState(record, connected);
    const badge = card.querySelector(".crowd-badge");
    badge.textContent = !record && connected ? "未登録：管理者が「未登録の催事を登録」を実行してください。" : state.text;
    badge.dataset.tone = state.tone;
    for (const button of card.querySelectorAll("button")) {
      button.disabled = !connected || !record || pending.has(id);
      button.setAttribute("aria-pressed", String(record?.status === button.dataset.status));
    }
  }
}

function renderAssignments(selected = []) {
  $("assignments").replaceChildren();
  for (const event of events) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = event.id;
    input.checked = selected.includes(event.id);
    label.append(input, `${event.room || event.zoneLabel}｜${event.name}`);
    $("assignments").append(label);
  }
}
function renderPeople() {
  $("staffList").replaceChildren();
  for (const [uid, person] of people) {
    const row = document.createElement("div");
    row.className = "entry";
    const text = document.createElement("p");
    text.textContent = `${person.displayName || uid}｜${person.role === "admin" ? "管理者" : "係"}｜${person.active ? "有効" : "停止中"}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "担当・権限を編集";
    edit.addEventListener("click", () => {
      $("staffUid").value = uid;
      $("staffName").value = person.displayName || "";
      $("staffRole").value = person.role;
      $("staffActive").checked = person.active === true;
      renderAssignments(person.eventIds || []);
      $("permissionForm").scrollIntoView({behavior: "smooth", block: "start"});
    });
    row.append(text, edit);
    $("staffList").append(row);
  }
  renderHistory();
}
function renderHistory() {
  $("history").replaceChildren();
  for (const entry of recentHistory) {
    const row = document.createElement("p");
    row.className = "entry muted";
    const event = events.find(event => event.id === entry.eventId);
    const time = entry.updatedAt?.toDate?.().toLocaleString("ja-JP", {timeZone: "Asia/Tokyo"}) || "時刻確認中";
    row.textContent = `${time}｜${event ? `${event.room || event.zoneLabel} ${event.name}` : entry.eventId}｜${STATUS[entry.status] || entry.status}｜${people.get(entry.actor)?.displayName || entry.actor}`;
    $("history").append(row);
  }
  if (!recentHistory.length) $("history").textContent = "更新履歴はまだありません。";
}
async function refreshEvents() {
  const request = ++eventDataRequest;
  const result = await loadEventsData();
  const nextEvents = flattenEvents(result.data);
  if (request !== eventDataRequest) return result.revision;
  events = nextEvents;
  $("eventDataStatus").textContent = result.warning
    ? "公開中の催事情報を取得できず、予備データを表示しています。通信とFirestoreの設定を確認してください。"
    : result.source === "firestore"
      ? `公開中の催事情報を表示しています（${events.length}件）。`
      : "初回用の予備データを表示しています。催事編集ページで公開してください。";
  const selected = [...$("assignments").querySelectorAll("input:checked")].map(input => input.value);
  renderAssignments(selected);
  if (profile?.active) renderCards();
  if (isAdmin()) renderHistory();
  return result.revision;
}
function startAdmin() {
  if (adminWatching) return;
  adminWatching = true;
  const version = sessionVersion;
  adminSubscriptions.push(onSnapshot(collection(db, "users"), snapshot => {
    if (version !== sessionVersion || !isAdmin()) return;
    people = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
    renderPeople();
  }, error => message(failure(error))));
  adminSubscriptions.push(onSnapshot(query(collection(db, "crowdHistory"), orderBy("updatedAt", "desc"), limit(30)), snapshot => {
    if (version !== sessionVersion || !isAdmin()) return;
    recentHistory = snapshot.docs.map(doc => doc.data());
    renderHistory();
  }, error => message(failure(error))));
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("loginButton").disabled = true;
  message("ログインしています…");
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    $("password").value = "";
  } catch (error) { message(failure(error)); }
  finally { $("loginButton").disabled = false; }
});
$("logout").addEventListener("click", () => signOut(auth).catch(error => message(failure(error))));
$("initialize").addEventListener("click", async () => {
  if (!isAdmin()) return;
  $("initialize").disabled = true;
  message("未登録の催事を登録しています…");
  try { await initializeCrowd(events); message(`${events.length}件の催事を確認しました。係に担当を割り当てて更新できます。`); }
  catch (error) { message(failure(error)); }
  finally { $("initialize").disabled = false; }
});
$("clearPermission").addEventListener("click", () => { $("permissionForm").reset(); renderAssignments(); });
$("permissionForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!isAdmin()) return;
  if (!navigator.onLine) return message("通信を確認してから保存してください。");
  const uid = $("staffUid").value.trim();
  const settings = {
    displayName: $("staffName").value.trim(), role: $("staffRole").value,
    active: $("staffActive").checked,
    eventIds: [...$("assignments").querySelectorAll("input:checked")].map(input => input.value),
  };
  if (uid === user.uid && (!settings.active || settings.role !== "admin")) return message("自分自身の管理者権限は停止できません。別の管理者から変更してください。");
  if (settings.active && settings.role === "staff" && !settings.eventIds.length) return message("担当する催事を1つ以上選んでください。");
  $("savePermission").disabled = true;
  try {
    const ref = doc(db, "users", uid);
    await runTransaction(db, async transaction => { await transaction.get(ref); transaction.set(ref, settings); });
    message(`${settings.displayName} の権限を保存しました。`);
  } catch (error) { message(failure(error)); }
  finally { $("savePermission").disabled = false; }
});

try {
  const revision = await refreshEvents();
  watchEventsVersion(() => refreshEvents().catch(error => message(failure(error))), revision);
  $("loginButton").disabled = false;
  message("登録済みのアカウントでログインしてください。");
  onAuthStateChanged(auth, nextUser => {
    sessionVersion++;
    clearSession();
    user = nextUser;
    $("loginPanel").hidden = !!user;
    $("sessionPanel").hidden = !user;
    if (!user) { message("登録済みのアカウントでログインしてください。"); return; }
    const version = sessionVersion;
    $("identity").textContent = user.email || "ログイン中";
    $("permissionMessage").textContent = `ユーザーUID：${user.uid}`;
    message("担当・権限を確認しています…");
    sessionSubscriptions.push(onSnapshot(doc(db, "users", user.uid), snapshot => {
      if (version !== sessionVersion) return;
      profile = snapshot.exists() ? snapshot.data() : null;
      const active = profile?.active === true;
      $("eventSection").hidden = !active;
      $("adminPanel").hidden = !isAdmin();
      if (active) {
        message(`${profile.displayName || "担当者"} としてログインしました。`);
        renderCards();
        if (isAdmin()) startAdmin(); else clearAdmin();
      } else {
        clearAdmin();
        $("eventCards").replaceChildren();
        message("更新権限が未登録または停止中です。上のユーザーUIDを管理者に伝えてください。");
      }
    }, error => {
      profile = null;
      $("eventSection").hidden = true;
      $("adminPanel").hidden = true;
      clearAdmin();
      message(failure(error));
    }));
    sessionSubscriptions.push(watchCrowd((next, connected) => {
      if (version !== sessionVersion) return;
      records = next; fresh = connected; renderStatuses();
    }, error => { fresh = false; renderStatuses(); message(failure(error)); }));
  });
} catch (error) { message(failure(error)); }
window.addEventListener("offline", renderStatuses);
window.addEventListener("online", () => {
  fresh = false;
  renderStatuses();
  refreshEvents().catch(error => message(failure(error)));
});
setInterval(renderStatuses, 30000);
