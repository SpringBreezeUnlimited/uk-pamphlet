import {doc, increment, setDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {db} from "./crowd-firebase.js";

// 表紙を開いた回数を1回記録する。オフライン閲覧は数えない。
if (navigator.onLine) {
  const shard = String(Math.floor(Math.random() * 20));
  setDoc(doc(db, "visitCounters", shard), {
    count: increment(1),
    updatedAt: serverTimestamp(),
  }, {merge: true}).catch(error => console.warn("アクセス数を記録できませんでした", error));
}
