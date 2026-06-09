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

// ============================================================
// VALIDAÇÃO DE NOME DE SLOT (Firestore document ID)
// ============================================================
function validarNomeSlotFirestore(nomeSlot) {
  const nome = String(nomeSlot ?? '').trim();
  if (!nome) throw new Error('Informe um nome para o save.');
  if (nome.length > 120) throw new Error('Nome do save muito longo. Use no máximo 120 caracteres.');
  if (nome === '.' || nome === '..') throw new Error('Nome de save inválido.');
  if (nome.includes('/') || nome.includes('\\')) {
    throw new Error('O nome do save não pode conter barra / ou \\.');
  }
  if (/^[\s.]+$/.test(nome)) throw new Error('Nome de save inválido.');
  if (/[\x00-\x1F\x7F]/.test(nome)) throw new Error('O nome do save contém caracteres inválidos.');
  // Evita IDs reservados usados internamente pelo Firestore.
  if (/^__.*__$/.test(nome)) throw new Error('Nome de save reservado pelo sistema. Escolha outro nome.');
  return nome;
}

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
  const nomeSeguro = validarNomeSlotFirestore(nomeSlot);
  const snap = await getDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSeguro));
  if (!snap.exists()) throw new Error('Slot não encontrado: ' + nomeSeguro);
  return snap.data().dados;
}

// ============================================================
// FIRESTORE — SALVAR SLOT
// ============================================================
async function salvarSlot(uid, nomeSlot, dados, nomeSlotAntigo) {
  const { doc, setDoc, deleteDoc, serverTimestamp } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  const nomeSeguro = validarNomeSlotFirestore(nomeSlot);
  const nomeAntigoSeguro = nomeSlotAntigo ? validarNomeSlotFirestore(nomeSlotAntigo) : null;
  const slots = await listarSlots(uid);
  const jaExiste = slots.some(s => s.nome === nomeSeguro);
  const substituindo = !!nomeAntigoSeguro;

  if (substituindo) {
    const antigoExiste = slots.some(s => s.nome === nomeAntigoSeguro);
    if (!antigoExiste) throw new Error('O slot selecionado para substituir não existe mais. Atualize a lista e tente novamente.');
    if (jaExiste && nomeSeguro !== nomeAntigoSeguro) {
      throw new Error('Já existe outro save com esse nome. Escolha um nome diferente para não sobrescrever outro slot.');
    }
  } else {
    if (jaExiste) throw new Error('Já existe um save com esse nome. Use outro nome ou escolha substituir esse slot.');
    if (slots.length >= 12) {
      throw new Error('Limite de 12 saves atingido. Escolha um slot para substituir.');
    }
  }

  await setDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSeguro), {
    dados, atualizadoEm: serverTimestamp()
  });

  if (nomeAntigoSeguro && nomeAntigoSeguro !== nomeSeguro) {
    await deleteDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeAntigoSeguro));
  }
}

// ============================================================
// FIRESTORE — APAGAR SLOT
// ============================================================
async function apagarSlot(uid, nomeSlot) {
  const { doc, deleteDoc } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const nomeSeguro = validarNomeSlotFirestore(nomeSlot);
  await deleteDoc(doc(window._fbDb, 'usuarios', uid, 'slots', nomeSeguro));
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
