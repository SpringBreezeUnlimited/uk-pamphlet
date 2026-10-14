import {doc, onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

const menu = document.getElementById("previewMenu");
const popup = document.getElementById("announcementPopup");
const messageElement = document.getElementById("announcementPopupMessage");
const closeButton = document.getElementById("announcementPopupClose");
const actionButton = document.getElementById("announcementPopupAction");
const seenKey = "ukousai2026-popup-announcement-seen";

let message = "";
let enabled = false;
let shownForMessage = "";
let popupTimer = null;
let returnFocus = null;

function seenInThisSession() {
  try { return sessionStorage.getItem(seenKey) === message; }
  catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(seenKey, message); }
  catch { /* 保存できない環境では、このページ内だけ再表示を防ぐ。 */ }
}

function closePopup() {
  if (popup.hidden) return;
  popup.hidden = true;
  document.body.classList.remove("site-popup-open");
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
  returnFocus = null;
  document.dispatchEvent(new Event("site-popup-closed"));
}

function menuIsVisible() {
  const bounds = menu.getBoundingClientRect();
  return bounds.top < innerHeight * .75 && bounds.bottom > innerHeight * .1;
}

function canShowPopup() {
  return enabled && message && shownForMessage !== message &&
    !seenInThisSession() && popup.hidden && document.visibilityState === "visible" &&
    !document.querySelector(".site-popup:not([hidden])");
}

function schedulePopup() {
  clearTimeout(popupTimer);
  popupTimer = null;
  if (!canShowPopup() || !menuIsVisible()) return;
  popupTimer = setTimeout(() => {
    popupTimer = null;
    if (!canShowPopup() || !menuIsVisible()) return;
    shownForMessage = message;
    markSeen();
    returnFocus = document.activeElement;
    popup.hidden = false;
    document.body.classList.add("site-popup-open");
    closeButton.focus({preventScroll: true});
  }, 800);
}

closeButton.addEventListener("click", closePopup);
actionButton.addEventListener("click", closePopup);
popup.addEventListener("click", event => {
  if (event.target === popup) closePopup();
});
document.addEventListener("keydown", event => {
  if (popup.hidden) return;
  if (event.key === "Escape") { closePopup(); return; }
  if (event.key !== "Tab") return;
  if (event.shiftKey && document.activeElement === closeButton) {
    event.preventDefault();
    actionButton.focus();
  } else if (!event.shiftKey && document.activeElement === actionButton) {
    event.preventDefault();
    closeButton.focus();
  }
});
addEventListener("scroll", schedulePopup, {passive: true});
addEventListener("resize", schedulePopup);
document.addEventListener("visibilitychange", schedulePopup);
document.addEventListener("site-popup-closed", schedulePopup);

onSnapshot(doc(db, "siteContent", "popupAnnouncement"), snapshot => {
  const data = snapshot.exists() ? snapshot.data() : {};
  message = typeof data.message === "string" ? data.message.trim() : "";
  enabled = data.enabled === true && Boolean(message);
  messageElement.textContent = message;
  if (!enabled) closePopup();
  schedulePopup();
}, () => {
  enabled = false;
  clearTimeout(popupTimer);
  closePopup();
});
