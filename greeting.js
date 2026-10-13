import {doc, onSnapshot} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

for (const card of document.querySelectorAll("[data-greeting]")) {
  const personId = card.dataset.greeting;
  const name = card.querySelector(".name");
  const message = card.querySelector(".message");
  const photo = card.querySelector(".portrait");
  const role = card.querySelector(".role").textContent;
  onSnapshot(doc(db, "greetings", personId), snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    name.textContent = data.name || role;
    message.textContent = data.message || "挨拶文を準備中です。";
    photo.src = data.photo || "no-image.svg";
    photo.alt = data.photo ? `${role} ${name.textContent}の写真` : `${role}の顔写真は準備中`;
  }, error => console.warn("挨拶を読み込めませんでした", error));
}
