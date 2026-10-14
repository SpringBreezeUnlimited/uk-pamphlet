import {doc, onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

const section = document.getElementById("surveyRequest");
const button = document.getElementById("surveyButton");
const menu = document.getElementById("previewMenu");
const popup = document.getElementById("surveyPopup");
const popupButton = document.getElementById("surveyPopupButton");
const popupClose = document.getElementById("surveyPopupClose");
const seenKey = "ukousai2026-survey-popup-seen";

let surveyUrl = "";
let popupEnabled = false;
let popupShownForUrl = "";
let popupTimer = null;
let returnFocus = null;

function seenInThisSession() {
  try { return sessionStorage.getItem(seenKey) === surveyUrl; }
  catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(seenKey, surveyUrl); }
  catch { /* 保存できない環境では、このページ内だけ再表示を防ぐ。 */ }
}

function closePopup() {
  if (popup.hidden) return;
  popup.hidden = true;
  document.body.classList.remove("survey-popup-open");
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
  returnFocus = null;
}

function menuIsVisible() {
  const bounds = menu.getBoundingClientRect();
  return bounds.top < innerHeight * .75 && bounds.bottom > innerHeight * .1;
}

function canShowPopup() {
  return popupEnabled && surveyUrl && popupShownForUrl !== surveyUrl &&
    !seenInThisSession() && popup.hidden && document.visibilityState === "visible";
}

function schedulePopup() {
  clearTimeout(popupTimer);
  popupTimer = null;
  if (!canShowPopup() || !menuIsVisible()) return;
  // 自動スクロールや手動操作が止まってから表示する。
  popupTimer = setTimeout(() => {
    popupTimer = null;
    if (!canShowPopup() || !menuIsVisible()) return;
    popupShownForUrl = surveyUrl;
    markSeen();
    returnFocus = document.activeElement;
    popup.hidden = false;
    document.body.classList.add("survey-popup-open");
    popupClose.focus({preventScroll: true});
  }, 800);
}

popupClose.addEventListener("click", closePopup);
popupButton.addEventListener("click", closePopup);
popup.addEventListener("click", event => {
  if (event.target === popup) closePopup();
});
document.addEventListener("keydown", event => {
  if (popup.hidden) return;
  if (event.key === "Escape") { closePopup(); return; }
  if (event.key !== "Tab") return;
  if (event.shiftKey && document.activeElement === popupClose) {
    event.preventDefault();
    popupButton.focus();
  } else if (!event.shiftKey && document.activeElement === popupButton) {
    event.preventDefault();
    popupClose.focus();
  }
});
addEventListener("scroll", schedulePopup, {passive: true});
addEventListener("resize", schedulePopup);
document.addEventListener("visibilitychange", schedulePopup);

onSnapshot(doc(db, "siteContent", "survey"), snapshot => {
  const data = snapshot.exists() ? snapshot.data() : {};
  const value = typeof data.url === "string" ? data.url.trim() : "";
  let url;
  try {
    url = new URL(value);
    if (url.protocol !== "https:") throw new Error("Invalid survey URL");
  } catch {
    surveyUrl = "";
    popupEnabled = false;
    section.hidden = true;
    button.removeAttribute("href");
    popupButton.removeAttribute("href");
    clearTimeout(popupTimer);
    closePopup();
    return;
  }

  surveyUrl = url.href;
  popupEnabled = data.popupEnabled === true;
  const label = typeof data.label === "string" && data.label.trim()
    ? data.label.trim() : "アンケートに回答する";
  button.href = popupButton.href = surveyUrl;
  button.textContent = popupButton.textContent = label;
  section.hidden = false;
  if (!popupEnabled) closePopup();
  schedulePopup();
}, () => {
  surveyUrl = "";
  popupEnabled = false;
  section.hidden = true;
  button.removeAttribute("href");
  popupButton.removeAttribute("href");
  clearTimeout(popupTimer);
  closePopup();
});
