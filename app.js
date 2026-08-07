import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = (selector) => document.querySelector(selector);
const landingView = $("#landingView");
const chatView = $("#chatView");
const createRoomButton = $("#createRoomButton");
const joinForm = $("#joinForm");
const roomCodeInput = $("#roomCodeInput");
const setupNotice = $("#setupNotice");
const landingFeedback = $("#landingFeedback");
const chatFeedback = $("#chatFeedback");
const messageForm = $("#messageForm");
const messageInput = $("#messageInput");
const messageList = $("#messageList");
const emptyState = $("#emptyState");
const sendButton = $("#sendButton");
const deleteChatButton = $("#deleteChatButton");
const copyInviteButton = $("#copyInviteButton");
const roomCodeLabel = $("#roomCodeLabel");
const roomStatus = $("#roomStatus");
const presenceLabel = $("#presenceLabel");
const connectionLabel = $("#connectionLabel");

const state = {
  authUser: null,
  roomId: null,
  room: null,
  stopRoom: null,
  stopMessages: null,
  deleting: false
};

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const isConfigured = Object.values(firebaseConfig).every((value) => value && !value.startsWith("PASTE_"));

let auth;
let db;

if (!isConfigured) {
  setupNotice.hidden = false;
  createRoomButton.disabled = true;
  roomCodeInput.disabled = true;
  joinForm.querySelector("button").disabled = true;
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.authUser = user;
      connectionLabel.textContent = "Anonim oturum hazır";
      const roomFromUrl = new URLSearchParams(window.location.search).get("room");
      if (roomFromUrl && !state.roomId) roomCodeInput.value = normalizeRoomId(roomFromUrl);
      return;
    }

    signInAnonymously(auth).catch((error) => showError(humanizeFirebaseError(error), landingFeedback));
  });
}

createRoomButton.addEventListener("click", createRoom);
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(roomCodeInput.value);
});
messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});
deleteChatButton.addEventListener("click", deleteChat);
copyInviteButton.addEventListener("click", copyInvite);
messageInput.addEventListener("input", resizeComposer);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

function normalizeRoomId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
}

async function createRoom() {
  if (!state.authUser) return showError("Anonim oturum hazırlanıyor, birazdan tekrar dene.", landingFeedback);

  setBusy(createRoomButton, true, "Oda açılıyor…");
  clearFeedback(landingFeedback);

  try {
    const roomId = createRoomId();
    await setDoc(doc(db, "rooms", roomId), {
      hostId: state.authUser.uid,
      guestId: null,
      status: "active",
      createdAt: serverTimestamp()
    });
    await connectToRoom(roomId);
  } catch (error) {
    showError(humanizeFirebaseError(error), landingFeedback);
  } finally {
    createRoomButton.disabled = false;
    createRoomButton.innerHTML = "<span>Yeni oda oluştur</span><span class=\"button-arrow\" aria-hidden=\"true\">↗</span>";
  }
}

async function joinRoom(rawRoomId) {
  const roomId = normalizeRoomId(rawRoomId);
  roomCodeInput.value = roomId;
  clearFeedback(landingFeedback);

  if (!state.authUser) return showError("Anonim oturum hazırlanıyor, birazdan tekrar dene.", landingFeedback);
  if (roomId.length < 6) return showError("Geçerli bir oda kodu gir.", landingFeedback);

  const joinButton = joinForm.querySelector("button");
  setBusy(joinButton, true, "Katılıyor…");

  try {
    const roomRef = doc(db, "rooms", roomId);
    const roomSnapshot = await getDoc(roomRef);
    if (!roomSnapshot.exists()) throw new Error("Bu oda bulunamadı veya artık kapalı.");

    const room = roomSnapshot.data();
    if (room.hostId !== state.authUser.uid && room.guestId && room.guestId !== state.authUser.uid) {
      throw new Error("Bu oda zaten iki kişiyle dolu.");
    }
    if (room.status !== "active") throw new Error("Bu oda artık aktif değil.");
    if (room.hostId !== state.authUser.uid && !room.guestId) {
      await updateDoc(roomRef, { guestId: state.authUser.uid, status: "active" });
    }
    await connectToRoom(roomId);
  } catch (error) {
    showError(humanizeFirebaseError(error), landingFeedback);
  } finally {
    setBusy(joinButton, false, "Katıl");
  }
}

async function connectToRoom(roomId) {
  stopListening();
  state.roomId = roomId;
  roomCodeLabel.textContent = roomId;
  roomCodeInput.value = roomId;
  landingView.hidden = true;
  chatView.hidden = false;
  window.history.replaceState({}, "", `${window.location.pathname}?room=${roomId}`);
  clearFeedback(chatFeedback);
  renderConnection({ status: "active", guestId: null });

  const roomRef = doc(db, "rooms", roomId);
  state.stopRoom = onSnapshot(roomRef, (snapshot) => {
    if (!snapshot.exists()) return finishDeletedRoom();
    state.room = snapshot.data();
    renderConnection(state.room);
  }, (error) => showError(humanizeFirebaseError(error), chatFeedback));

  const messagesQuery = query(collection(roomRef, "messages"), orderBy("createdAt", "asc"));
  state.stopMessages = onSnapshot(messagesQuery, (snapshot) => {
    renderMessages(snapshot.docs.map((message) => ({ id: message.id, ...message.data() })));
  }, (error) => showError(humanizeFirebaseError(error), chatFeedback));
}

function renderConnection(room) {
  const deleting = room.status === "deleting";
  const occupied = Boolean(room.guestId);
  roomStatus.innerHTML = `<span class="live-dot"></span> ${deleting ? "siliniyor" : "bağlı"}`;
  roomStatus.classList.toggle("is-deleting", deleting);
  presenceLabel.textContent = deleting ? "Mesajlar kaldırılıyor" : occupied ? "Karşı taraf burada" : "Karşı taraf bekleniyor";
  connectionLabel.textContent = deleting ? "Sohbet temizleniyor…" : occupied ? "Canlı bağlantı" : "Kod paylaşıldı, karşı taraf bekleniyor";
  messageInput.disabled = deleting;
  sendButton.disabled = deleting;
  copyInviteButton.disabled = deleting;
  deleteChatButton.disabled = deleting && state.deleting;
}

function renderMessages(messages) {
  const hasMessages = messages.length > 0;
  emptyState.hidden = hasMessages;
  messageList.querySelectorAll(".message").forEach((node) => node.remove());

  messages.forEach((message) => {
    const wrapper = document.createElement("article");
    const mine = message.senderId === state.authUser?.uid;
    wrapper.className = `message ${mine ? "mine" : "other"}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message.text;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = `${mine ? "sen" : "diğer kişi"} / ${formatTime(message.createdAt)}`;

    wrapper.append(bubble, meta);
    messageList.append(wrapper);
  });

  messageList.scrollTop = messageList.scrollHeight;
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !state.roomId || state.room?.status !== "active") return;

  sendButton.disabled = true;
  try {
    await addDoc(collection(db, "rooms", state.roomId, "messages"), {
      senderId: state.authUser.uid,
      text: text.slice(0, 2000),
      createdAt: serverTimestamp()
    });
    messageInput.value = "";
    resizeComposer();
  } catch (error) {
    showError(humanizeFirebaseError(error), chatFeedback);
  } finally {
    sendButton.disabled = state.room?.status === "deleting";
    messageInput.focus();
  }
}

async function deleteChat() {
  if (!state.roomId || state.deleting || !state.authUser) return;

  state.deleting = true;
  deleteChatButton.disabled = true;
  messageInput.disabled = true;
  sendButton.disabled = true;
  copyInviteButton.disabled = true;
  clearFeedback(chatFeedback);
  connectionLabel.textContent = "Sohbet temizleniyor…";

  try {
    const roomRef = doc(db, "rooms", state.roomId);
    await updateDoc(roomRef, { status: "deleting" });

    const messagesRef = collection(roomRef, "messages");
    // Firestore batch yazma sınırı 500 olduğu için 450'lik küçük partiler kullanılır.
    while (true) {
      const snapshot = await getDocs(query(messagesRef, limit(450)));
      if (snapshot.empty) break;
      const batch = writeBatch(db);
      snapshot.docs.forEach((message) => batch.delete(message.ref));
      await batch.commit();
    }

    await deleteDoc(roomRef);
    finishDeletedRoom();
  } catch (error) {
    state.deleting = false;
    deleteChatButton.disabled = false;
    showError(`Silme tamamlanamadı: ${humanizeFirebaseError(error)} Yeniden dene.`, chatFeedback);
  }
}

async function copyInvite() {
  if (!state.roomId) return;
  const invite = `${window.location.origin}${window.location.pathname}?room=${state.roomId}`;
  try {
    await navigator.clipboard.writeText(invite);
    copyInviteButton.textContent = "Bağlantı kopyalandı";
    setTimeout(() => { copyInviteButton.textContent = "Davet bağlantısını kopyala"; }, 1800);
  } catch {
    showError(`Oda kodu: ${state.roomId}`, chatFeedback);
  }
}

function finishDeletedRoom() {
  stopListening();
  state.roomId = null;
  state.room = null;
  state.deleting = false;
  chatView.hidden = true;
  landingView.hidden = false;
  roomCodeInput.value = "";
  window.history.replaceState({}, "", window.location.pathname);
  showError("Sohbet ve mesajları veritabanından silindi.", landingFeedback, "success");
}

function stopListening() {
  state.stopRoom?.();
  state.stopMessages?.();
  state.stopRoom = null;
  state.stopMessages = null;
}

function resizeComposer() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
}

function formatTime(timestamp) {
  if (!timestamp?.toDate) return "şimdi";
  return timestamp.toDate().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function showError(message, element, type = "error") {
  element.textContent = message;
  element.dataset.type = type;
}

function clearFeedback(element) {
  element.textContent = "";
  delete element.dataset.type;
}

function humanizeFirebaseError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/operation-not-allowed": "Firebase Authentication içinde Anonim giriş yöntemini aç.",
    "auth/network-request-failed": "İnternet bağlantısını kontrol et.",
    "permission-denied": "Firebase kurallarını firestore.rules dosyasındaki kurallarla güncelle.",
    "failed-precondition": "Firestore veritabanını Firebase Console'da oluştur."
  };
  return messages[code] || error?.message || "Beklenmeyen bir hata oluştu.";
}
