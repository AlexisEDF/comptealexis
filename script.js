const FB_CFG = {
  apiKey: "AIzaSyD1aCJhCFb_i-s-dk_PerefP837V9205Wg",
  authDomain: "compteargent-af50a.firebaseapp.com",
  databaseURL: "https://compteargent-af50a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "compteargent-af50a",
  storageBucket: "compteargent-af50a.firebasestorage.app",
  messagingSenderId: "850843347316",
  appId: "1:850843347316:web:e36061b6508ea9422f6421"
};

const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
let ops = [], fbReady = false, fbUser = null, FB = {};
let currentType = 'dep', editId = null, filterMonth = 'all';
let isAdmin = false, showingAdmin = false;

// ── FIREBASE INIT ──
try {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  const { getDatabase, ref, set, get, onValue } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
  const app = initializeApp(FB_CFG);
  const auth = getAuth(app);
  const db = getDatabase(app);
  FB = { auth, db, ref, set, get, onValue, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut };
  fbReady = true;
  onAuthStateChanged(auth, async user => {
    if (user) {
      fbUser = user;
      if (user.email && user.email.endsWith('@moncompte.fr')) {
        const extractedName = user.email.replace('@moncompte.fr', '');
        try {
          const usnap = await get(ref(db, 'users/' + user.uid + '/username'));
          if (!usnap.exists()) {
            await set(ref(db, 'users/' + user.uid + '/username'), extractedName);
          }
        } catch(e) {}
      }
      try { await set(ref(db, 'users/' + user.uid + '/lastLogin'), new Date().toISOString()); } catch(e) {}
      enterApp(); listenFB(); checkAdmin(user.uid);
    } else { resetApp(); showAuth(); }
  });
} catch(e) {
  console.warn('Firebase:', e);
  showAuth();
}

// ── AUTH ──
window.switchTab = function(t) {
  document.getElementById('form-login').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = t === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').className = 'tab' + (t === 'login' ? ' active' : '');
  document.getElementById('tab-register').className = 'tab' + (t === 'register' ? ' active' : '');
  document.getElementById('auth-err').textContent = '';
};

window.doLogin = async function() {
  const raw = document.getElementById('l-id').value.trim().toLowerCase().replace(/\s+/g,'_');
  const pw = document.getElementById('l-pw').value;
  if (!raw || !pw) return setErr('Remplissez tous les champs');
  if (!fbReady) { clearFields(); enterApp(); loadLocal(); return; }
  document.getElementById('l-txt').innerHTML = '<span class="spin"></span>';
  try {
    const cred = await FB.signInWithEmailAndPassword(FB.auth, raw + '@moncompte.fr', pw);
    const usnap = await FB.get(FB.ref(FB.db, 'users/' + cred.user.uid + '/username'));
    if (!usnap.exists()) {
      await FB.set(FB.ref(FB.db, 'users/' + cred.user.uid + '/username'), raw);
    }
    clearFields();
  } catch(e) {
    setErr(errMsg(e.code));
    document.getElementById('l-txt').textContent = 'Se connecter';
  }
};

window.doRegister = async function() {
  const raw = document.getElementById('r-id').value.trim().toLowerCase().replace(/\s+/g,'_');
  const pw = document.getElementById('r-pw').value;
  if (!raw || !pw) return setErr('Remplissez tous les champs');
  if (!fbReady) { clearFields(); enterApp(); loadLocal(); return; }
  document.getElementById('r-txt').innerHTML = '<span class="spin"></span>';
  try {
    const cred = await FB.createUserWithEmailAndPassword(FB.auth, raw + '@moncompte.fr', pw);
    await FB.set(FB.ref(FB.db, 'users/' + cred.user.uid + '/username'), raw);
    clearFields();
  } catch(e) {
    setErr(errMsg(e.code));
    document.getElementById('r-txt').textContent = 'Creer mon compte';
  }
};

window.doLogout = async function() {
  if (fbReady && FB.auth && fbUser) {
    try { await FB.set(FB.ref(FB.db, 'users/' + fbUser.uid + '/lastLogout'), new Date().toISOString()); } catch(e) {}
    await FB.signOut(FB.auth);
  } else { resetApp(); showAuth(); }
};

function clearFields() {
  ['l-id','l-pw','r-id','r-pw'].forEach(id => { document.getElementById(id).value = ''; });
}

function resetApp() {
  ops = []; isAdmin = false; showingAdmin = false;
  document.getElementById('l-txt').textContent = 'Se connecter';
  document.getElementById('r-txt').textContent = 'Creer mon compte';
  clearFields();
  document.getElementById('auth-err').textContent = '';
  document.getElementById('btn-admin').style.display = 'none';
  document.getElementById('admin-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'block';
}

function setErr(m) { document.getElementById('auth-err').textContent = m; }

function errMsg(c) {
  return ({
    'auth/user-not-found': 'Identifiant introuvable',
    'auth/wrong-password': 'Mot de passe incorrect',
    'auth/email-already-in-use': 'Identifiant deja utilise',
    'auth/weak-password': 'Mot de passe trop court (6 min)',
    'auth/invalid-credential': 'Identifiant ou mot de passe incorrect',
    'auth/invalid-email': 'Identifiant invalide'
  })[c] || 'Erreur de connexion';
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function enterApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

// ── FIREBASE DATA ──
function listenFB() {
  if (!fbReady || !fbUser) return;
  FB.onValue(FB.ref(FB.db, 'users/' + fbUser.uid + '/ops'), snap => {
    ops = snap.exists() ? Object.values(snap.val()) : [];
    render();
  });
}

async function saveFB() {
  if (!fbReady || !fbUser) { saveLocal(); return; }
  const obj = {};
  ops.forEach(o => { obj[o.id] = o; });
  await FB.set(FB.ref(FB.db, 'users/' + fbUser.uid + '/ops'), obj);
  try { await FB.set(FB.ref(FB.db, 'users/' + fbUser.uid + '/lastActivity'), new Date().toISOString()); } catch(e) {}
}

function saveLocal() { localStorage.setItem('mc_ops', JSON.stringify(ops)); }
function loadLocal() { ops = JSON.parse(localStorage.getItem('mc_ops') || '[]'); render(); }

// ── ADMIN ──
async function checkAdmin(uid) {
  if (!fbReady) return;
  try {
    const snap = await FB.get(FB.ref(FB.db, 'admins/' + uid));
    if (snap.exists()) {
      isAdmin = true;
      document.getElementById('btn-admin').style.display = 'flex';
    }
  } catch(e) { console.warn('Admin check:', e); }
}

async function loadAllUsers() {
  if (!isAdmin || !fbReady) return;
  try {
    const snap = await FB.get(FB.ref(FB.db, 'users'));
    const list = document.getElementById('admin-list');
    if (!snap.exists()) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><div class="empty-txt">Aucun compte enregistre</div></div>';
      return;
    }
    const all = snap.val();
    const uids = Object.keys(all);
    document.getElementById('admin-count').textContent = uids.length + ' compte(s)';

    list.innerHTML = uids.map(uid => {
      const uops = all[uid].ops ? Object.values(all[uid].ops) : [];
      let username = all[uid].username || '';
      if (!username) username = 'compte-' + uid.substring(0, 6);
      const solde = uops.reduce((a, o) => a + o.amount, 0);
      const sc = solde >= 0 ? 'var(--plus)' : 'var(--minus)';
      const sign = solde >= 0 ? '+' : '';
      const isCurrent = fbUser && uid === fbUser.uid;

      function buildOpHtml(o) {
        const icon = o.type === 'dep' ? '💸' : o.type === 'apl' ? '🏠' : '💰';
        const ac = o.amount >= 0 ? 'var(--plus)' : 'var(--minus)';
        const s = o.amount >= 0 ? '+' : '';
        const d = new Date(o.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        let histHtml = '';
        if (o.history && o.history.length > 0) {
          histHtml = '<div class="admin-history">';
          o.history.forEach(function(h) {
            const hd = new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                     + ' ' + new Date(h.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            h.changes.forEach(function(c) {
              if (c.type === 'amount') {
                const oldAmt = fmt(o.amount < 0 ? -c.old : c.old);
                const newAmt = fmt(o.amount < 0 ? -c.new : c.new);
                histHtml += '<div class="admin-history-row">✎ ' + hd + ' — montant : <span class="old">' + oldAmt + '</span> → <span class="new">' + newAmt + '</span></div>';
              } else {
                histHtml += '<div class="admin-history-row">✎ ' + hd + ' — libelle : <span class="old">' + esc(c.old) + '</span> → <span class="new">' + esc(c.new) + '</span></div>';
              }
            });
          });
          histHtml += '</div>';
        }
        return '<div class="admin-op-row" style="flex-direction:column;align-items:flex-start">'
          + '<div style="display:flex;justify-content:space-between;width:100%;padding:4px 0">'
          + '<span>' + icon + ' ' + esc(o.label) + ' <span style="color:var(--text2);font-size:0.7rem">' + d + '</span></span>'
          + '<span style="color:' + ac + ';font-weight:700">' + s + fmt(o.amount) + '</span>'
          + '</div>' + histHtml + '</div>';
      }

      const opsHtml = uops.length === 0
        ? '<div style="color:var(--text2);font-size:0.82rem;padding:8px 0">Aucune operation</div>'
        : uops.sort((a, b) => new Date(b.date) - new Date(a.date)).map(buildOpHtml).join('');

      function timeAgo(iso) {
        if (!iso) return 'jamais';
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 2) return "a l'instant";
        if (mins < 60) return 'il y a ' + mins + ' min';
        if (hours < 24) return 'il y a ' + hours + 'h';
        if (days < 2) return 'hier';
        return 'il y a ' + days + ' jours';
      }

      const lastLogin = all[uid].lastLogin;
      const lastActivity = all[uid].lastActivity;
      const lastLogout = all[uid].lastLogout;
      const loginTime = lastLogin ? new Date(lastLogin).getTime() : 0;
      const logoutTime = lastLogout ? new Date(lastLogout).getTime() : 0;
      const isRecent = loginTime > logoutTime && (Date.now() - loginTime) < 1800000;

      const activityHtml = '<div class="admin-activity">'
        + '<div class="admin-activity-item"><span class="dot' + (isRecent ? '' : ' old') + '"></span>Connexion : ' + timeAgo(lastLogin) + '</div>'
        + (lastLogout ? '<div class="admin-activity-item"><span class="dot old"></span>Deconnexion : ' + timeAgo(lastLogout) + '</div>' : '')
        + '<div class="admin-activity-item"><span class="dot old"></span>Activite : ' + timeAgo(lastActivity) + '</div>'
        + '</div>';

      return '<div class="admin-card">'
        + '<div class="admin-card-header" onclick="toggleAdminCard(this)">'
        + '<div>'
        + '<div style="font-weight:800;font-size:1rem">' + (isCurrent ? '⭐ ' : '') + esc(username) + (isCurrent ? ' (vous)' : '') + '</div>'
        + '<div style="font-size:0.72rem;color:var(--text2);font-family:Instrument Mono,monospace;margin-top:3px">' + uops.length + ' operation(s) · ' + (isRecent ? '<span style="color:var(--plus)">en ligne</span>' : 'hors ligne') + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:12px">'
        + '<span style="font-weight:900;font-size:1.1rem;color:' + sc + '">' + sign + fmt(solde) + '</span>'
        + '<span style="color:var(--text2)" class="chev">▼</span>'
        + '</div></div>'
        + '<div class="admin-card-body">' + activityHtml + opsHtml + '</div></div>';
    }).join('');
  } catch(e) { console.error('loadAllUsers:', e); }
}

window.toggleAdminCard = function(h) {
  const body = h.nextElementSibling;
  body.classList.toggle('open');
  h.querySelector('.chev').textContent = body.classList.contains('open') ? '▲' : '▼';
};

window.toggleAdmin = function() {
  showingAdmin = !showingAdmin;
  document.getElementById('admin-view').style.display = showingAdmin ? 'block' : 'none';
  document.getElementById('main-view').style.display = showingAdmin ? 'none' : 'block';
  const btn = document.getElementById('btn-admin');
  btn.style.background = showingAdmin ? 'var(--yellow-bg)' : '';
  btn.style.borderColor = showingAdmin ? 'var(--yellow)' : '';
  btn.textContent = showingAdmin ? '🏠' : '👑';
  if (showingAdmin) loadAllUsers();
};

// ── OPERATIONS ──
window.setType = function(t) {
  currentType = t;
  ['dep', 'apl', 'ent'].forEach(x => {
    document.getElementById('btn-' + x).className = 'type-btn' + (x === t ? ' active-' + x : '');
  });
  if (t === 'apl') {
    document.getElementById('qa-label').value = 'APL';
    document.getElementById('qa-amount').value = '199';
  } else {
    if (document.getElementById('qa-label').value === 'APL') document.getElementById('qa-label').value = '';
    if (document.getElementById('qa-amount').value === '199') document.getElementById('qa-amount').value = '';
    document.getElementById('qa-label').placeholder = t === 'dep' ? 'Ex: Assurance...' : 'Ex: Cantine, Remboursement...';
  }
};

window.addOp = function() {
  const label = document.getElementById('qa-label').value.trim();
  const amount = parseFloat(document.getElementById('qa-amount').value);
  if (!label) return flash('qa-label', 'Entrez un libelle');
  if (isNaN(amount) || amount <= 0) return flash('qa-amount', 'Montant invalide');
  ops.unshift({ id: Date.now().toString(), label, amount: currentType === 'dep' ? -Math.abs(amount) : Math.abs(amount), type: currentType, date: new Date().toISOString() });
  saveFB();
  if (!fbReady) render();
  document.getElementById('qa-label').value = '';
  document.getElementById('qa-amount').value = '';
  if (currentType === 'apl') setType('dep');
};

function flash(id, msg) {
  const el = document.getElementById(id);
  el.style.borderColor = 'var(--minus)';
  const old = el.placeholder;
  el.placeholder = msg;
  setTimeout(() => { el.style.borderColor = ''; el.placeholder = old; }, 1800);
}

window.deleteOp = function(id) {
  ops = ops.filter(o => o.id !== id);
  saveFB();
  if (!fbReady) render();
};

window.openEdit = function(id) {
  const op = ops.find(o => o.id === id);
  if (!op) return;
  editId = id;
  document.getElementById('edit-label').value = op.label;
  document.getElementById('edit-amount').value = Math.abs(op.amount);
  document.getElementById('overlay').classList.add('open');
};

window.closeEdit = function() {
  document.getElementById('overlay').classList.remove('open');
  editId = null;
};

window.saveEdit = function() {
  const op = ops.find(o => o.id === editId);
  if (!op) return;
  const label = document.getElementById('edit-label').value.trim();
  const amount = parseFloat(document.getElementById('edit-amount').value);
  if (!label || isNaN(amount) || amount <= 0) return;
  const changes = [];
  if (op.label !== label) changes.push({ type: 'label', old: op.label, new: label });
  if (Math.abs(op.amount) !== amount) changes.push({ type: 'amount', old: Math.abs(op.amount), new: amount });
  if (changes.length > 0) {
    if (!op.history) op.history = [];
    op.history.push({ date: new Date().toISOString(), changes });
  }
  op.label = label;
  op.amount = op.amount < 0 ? -amount : amount;
  saveFB();
  if (!fbReady) render();
  closeEdit();
};

window.setFilter = function(m) { filterMonth = m; render(); };

// ── RENDER ──
function render() {
  const filtered = filterMonth === 'all' ? ops : ops.filter(o => new Date(o.date).getMonth() === parseInt(filterMonth));
  const solde = filtered.reduce((a, o) => a + o.amount, 0);
  const plus = filtered.filter(o => o.amount > 0 && o.type !== 'apl').reduce((a, o) => a + o.amount, 0);
  const minus = filtered.filter(o => o.amount < 0).reduce((a, o) => a + Math.abs(o.amount), 0);
  const apl = filtered.filter(o => o.type === 'apl').reduce((a, o) => a + o.amount, 0);
  const el = document.getElementById('solde-display');
  el.textContent = fmt(solde);
  el.className = 'solde-amount ' + (solde > 0 ? 'pos' : solde < 0 ? 'neg' : 'zero');
  document.getElementById('total-plus').textContent = fmt(plus);
  document.getElementById('total-minus').textContent = fmt(minus);
  document.getElementById('total-apl').textContent = fmt(apl);
  document.getElementById('ops-count').textContent = filtered.length + ' op.';
  const months = [...new Set(ops.map(o => new Date(o.date).getMonth()))].sort();
  const mf = document.getElementById('month-filter');
  if (months.length > 1) {
    mf.innerHTML = '<button class="month-pill ' + (filterMonth === 'all' ? 'active' : '') + '" onclick="setFilter(\'all\')">Tout</button>'
      + months.map(m => '<button class="month-pill ' + (filterMonth == m ? 'active' : '') + '" onclick="setFilter(' + m + ')">' + MOIS[m] + '</button>').join('');
    mf.style.display = 'flex';
  } else { mf.style.display = 'none'; }
  const list = document.getElementById('ops-list');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📂</div><div class="empty-txt">Aucune operation' + (filterMonth !== 'all' ? ' ce mois-ci' : ' — ajoutez-en une ci-dessus') + '</div></div>';
    return;
  }
  list.innerHTML = filtered.map(o => {
    const icon = o.type === 'dep' ? '💸' : o.type === 'apl' ? '🏠' : '💰';
    const ac = o.type === 'dep' ? 'dep' : o.type === 'apl' ? 'apl' : 'ent';
    const tag = o.type === 'dep' ? 'depense' : o.type === 'apl' ? 'APL' : 'entree';
    const sign = o.amount >= 0 ? '+' : '';
    const d = new Date(o.date);
    return '<div class="op-item">'
      + '<div class="op-icon ' + ac + '">' + icon + '</div>'
      + '<div class="op-info"><div class="op-label">' + esc(o.label) + '<span class="tag tag-' + ac + '">' + tag + '</span></div>'
      + '<div class="op-date">' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</div>'
      + (o.history && o.history.length > 0 ? '<div class="op-history">' + o.history.map(h => {
          const hd = new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
          return h.changes.map(c => {
            if (c.type === 'amount') {
              const oldAmt = o.amount < 0 ? -c.old : c.old;
              const newAmt = o.amount < 0 ? -c.new : c.new;
              return '<span class="op-history-item">✎ ' + hd + ' : ' + fmt(oldAmt) + ' → ' + fmt(newAmt) + '</span>';
            } else {
              return '<span class="op-history-item">✎ ' + hd + ' : ' + esc(c.old) + ' → ' + esc(c.new) + '</span>';
            }
          }).join('');
        }).join('') + '</div>' : '')
      + '</div>'
      + '<div class="op-amount ' + ac + '">' + sign + fmt(o.amount) + '</div>'
      + '<button class="btn-action edit" onclick="openEdit(\'' + o.id + '\')" title="Modifier">✎</button>'
      + '<button class="btn-action del" onclick="deleteOp(\'' + o.id + '\')" title="Supprimer">✕</button>'
      + '</div>';
  }).join('');
}

// ── UTILITAIRES ──
function fmt(n) {
  return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function esc(s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

window.toggleTheme = function() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('theme-btn').textContent = dark ? '🌙' : '☀️';
};

if (!fbReady) loadLocal();
