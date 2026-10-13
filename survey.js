import {doc, onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

const section = document.getElementById("surveyRequest");
const button = document.getElementById("surveyButton");

onSnapshot(doc(db, "siteContent", "survey"), snapshot => {
  const data = snapshot.exists() ? snapshot.data() : {};
  const value = typeof data.url === "string" ? data.url.trim() : "";
  let url;
  try {
    url = new URL(value);
    if (url.protocol !== "https:") throw new Error("Invalid survey URL");
  } catch {
    section.hidden = true;
    button.removeAttribute("href");
    return;
  }
  button.href = url.href;
  button.textContent = typeof data.label === "string" && data.label.trim()
    ? data.label.trim() : "アンケートに回答する";
  section.hidden = false;
}, () => { section.hidden = true; button.removeAttribute("href"); });
