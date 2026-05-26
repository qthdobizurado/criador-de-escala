// ============================================================
// FIREBASE CONFIG
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyC2KcrX7nGZsXR-UOpBBg-l7Rt8thchwLs",
  authDomain:        "gerenciador-escala.firebaseapp.com",
  projectId:         "gerenciador-escala",
  storageBucket:     "gerenciador-escala.firebasestorage.app",
  messagingSenderId: "905325339694",
  appId:             "1:905325339694:web:3a2f5726e6718d1917ebbf",
  measurementId:     "G-KBD59D8W8F"
};

// ── Inicialização ─────────────────────────────────────────────
async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getAuth }       = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const { getFirestore }  = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const app = initializeApp(FIREBASE_CONFIG);
  window._fbAuth = getAuth(app);
  window._fbDb   = getFirestore(app);
}

// ── Login com Google (popup) ──────────────────────────────────
async function loginComGoogle() {
  const { GoogleAuthProvider, signInWithPopup } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const { doc, setDoc, getDoc, serverTimestamp } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const cred = await signInWithPopup(window._fbAuth, provider);
  const user = cred.user;

  // Cria documento no Firestore na primeira vez
  const ref  = doc(window._fbDb, 'usuarios', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email:    user.email,
      nome:     user.displayName || user.email,
      criadoEm: serverTimestamp()
    });
  }
  return user;
}

// ── Logout ────────────────────────────────────────────────────
async function logoutUsuario() {
  const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  await signOut(window._fbAuth);
}

// ============================================================
// FIRESTORE — LISTAR SLOTS
// ============================================================
async function listarSlots(uid) {
  const { collection, getDocs, orderBy, query } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const q = query(
    collection(window._fbDb, 'usuarios', uid, 'slots'),
    orderBy('atualizadoEm', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ nome: d.id, ...d.data() }));
}

// ============================================================
// FIRESTORE — CARREGAR SLOT
// ============================================================
async function carregarSlot(uid, nomeSlot) {
  const { doc, getDoc } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const snap = await getDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSlot));
  if (!snap.exists()) throw new Error('Slot não encontrado: ' + nomeSlot);
  return snap.data().dados;
}

// ============================================================
// FIRESTORE — SALVAR SLOT
// ============================================================
async function salvarSlot(uid, nomeSlot, dados, nomeSlotAntigo) {
  const { doc, setDoc, deleteDoc, serverTimestamp } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  if (!nomeSlotAntigo || nomeSlotAntigo.trim() === '' || nomeSlotAntigo === nomeSlot) {
    const slots    = await listarSlots(uid);
    const jaExiste = slots.some(s => s.nome === nomeSlot);
    if (!jaExiste && slots.length >= 12) {
      throw new Error('Limite de 12 saves atingido. Escolha um slot para substituir.');
    }
  }

  await setDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSlot), {
    dados, atualizadoEm: serverTimestamp()
  });

  if (nomeSlotAntigo && nomeSlotAntigo.trim() !== '' && nomeSlotAntigo !== nomeSlot) {
    await deleteDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSlotAntigo));
  }
}

// ============================================================
// FIRESTORE — APAGAR SLOT
// ============================================================
async function apagarSlot(uid, nomeSlot) {
  const { doc, deleteDoc } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  await deleteDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSlot));
}

// ============================================================
// TRADUÇÃO DE ERROS
// ============================================================
function traduzirErroFirebase(code) {
  const erros = {
    'auth/popup-closed-by-user':    'Login cancelado.',
    'auth/cancelled-popup-request': 'Login cancelado.',
    'auth/popup-blocked':           'Popup bloqueado. Permita popups para este site nas configurações do navegador.',
    'auth/network-request-failed':  'Erro de conexão. Verifique sua internet.',
    'auth/too-many-requests':       'Muitas tentativas. Aguarde alguns minutos.',
    'auth/user-disabled':           'Esta conta foi desativada.',
  };
  return erros[code] || ('Erro: ' + (code || 'desconhecido'));
}
