// =====================================================================
//  Rozpočet Rodinka – ukladanie do Firebase (Firestore) + prihlásenie
//  Spoločné pre index.html (zadávanie) aj nahlad.html (prehľad).
// =====================================================================

const firebaseConfig = {
  apiKey: "AIzaSyD4VwjWfZ3NPdiiTFs3F52Nw5hfLyyaCzQ",
  authDomain: "rozpocet-rodinka.firebaseapp.com",
  projectId: "rozpocet-rodinka",
  storageBucket: "rozpocet-rodinka.firebasestorage.app",
  messagingSenderId: "49910695562",
  appId: "1:49910695562:web:1397cf77f9aacc42cc4f73"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();

// Offline režim – zápisy bez internetu sa odošlú, keď sa pripojenie vráti
fbDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.warn('Offline režim nie je dostupný:', err.code);
});

const FB_ITEMS = fbDb.collection('items');
const FB_SETTINGS = fbDb.collection('settings').doc('rodinka');

let fbUnsubItems = null;
let fbUnsubSettings = null;

// ---------- Prihlasovacia obrazovka ----------
(function injectLoginUI() {
  const css = document.createElement('style');
  css.textContent = `
    #fb-login { position: fixed; inset: 0; background: #faf7fd; z-index: 9999;
      display: none; align-items: center; justify-content: center; padding: 20px; }
    #fb-login.active { display: flex; }
    #fb-login .box { background: #fff; border-radius: 16px; padding: 32px 28px; max-width: 360px;
      width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(124,58,237,.12); font-family: inherit; }
    #fb-login img { width: 72px; height: 72px; border-radius: 16px; margin-bottom: 12px; }
    #fb-login h2 { margin: 0 0 6px; color: #1e293b; font-size: 20px; }
    #fb-login p { color: #64748b; font-size: 14px; margin: 0 0 22px; line-height: 1.45; }
    #fb-login .msg { color: #ef4444; font-size: 13px; margin-top: 14px; min-height: 1em; }
    #fb-login button { width: 100%; padding: 12px; border: none; border-radius: 10px; background: #7c3aed;
      color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
    #fb-login button.secondary { background: #e2e8f0; color: #1e293b; margin-top: 8px; }
    .fb-status { font-size: 12px; color: #64748b; white-space: nowrap; }
  `;
  document.head.appendChild(css);

  const div = document.createElement('div');
  div.id = 'fb-login';
  div.innerHTML = `
    <div class="box">
      <img src="icon-512.png" alt="">
      <h2>Rozpočet Rodinka</h2>
      <p>Prihlás sa Google účtom, ktorý má prístup k rozpočtu.</p>
      <button type="button" onclick="fbLogin()">Prihlásiť sa cez Google</button>
      <button type="button" class="secondary" id="fb-logout-btn" style="display:none" onclick="fbLogout()">Odhlásiť a vybrať iný účet</button>
      <div class="msg" id="fb-login-msg"></div>
    </div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(div));
  if (document.body) document.body.appendChild(div);
})();

function fbShowLogin(msg, showLogout) {
  const el = document.getElementById('fb-login');
  if (!el) return;
  el.classList.add('active');
  document.getElementById('fb-login-msg').textContent = msg || '';
  document.getElementById('fb-logout-btn').style.display = showLogout ? 'block' : 'none';
}

function fbHideLogin() {
  const el = document.getElementById('fb-login');
  if (el) el.classList.remove('active');
}

async function fbLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fbAuth.signInWithPopup(provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await fbAuth.signInWithRedirect(provider);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      fbShowLogin('Prihlásenie zlyhalo: ' + (e.message || e.code));
    }
  }
}

function fbLogout() {
  if (fbUnsubItems) fbUnsubItems();
  if (fbUnsubSettings) fbUnsubSettings();
  fbUnsubItems = fbUnsubSettings = null;
  fbAuth.signOut();
}

function fbSetStatus(text) {
  const el = document.getElementById('fb-status');
  if (el) el.textContent = text;
}

function fbHandleError(err) {
  console.error(err);
  if (err && err.code === 'permission-denied') {
    const email = fbAuth.currentUser ? fbAuth.currentUser.email : '';
    fbShowLogin('Účet ' + email + ' nemá prístup k rozpočtu.', true);
  } else {
    fbSetStatus('⚠ Chyba spojenia');
  }
}

// ---------- Spustenie: počúvanie zmien v databáze ----------
// onItems(pole položiek), onSettings(objekt alebo null, ak ešte neexistuje)
function fbStart({ onItems, onSettings }) {
  fbAuth.onAuthStateChanged(user => {
    if (fbUnsubItems) fbUnsubItems();
    if (fbUnsubSettings) fbUnsubSettings();
    fbUnsubItems = fbUnsubSettings = null;

    if (!user) {
      fbShowLogin('');
      return;
    }
    fbHideLogin();
    fbSetStatus('Načítavam…');

    fbUnsubItems = FB_ITEMS.onSnapshot({ includeMetadataChanges: true }, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onItems(arr);
      if (snap.metadata.hasPendingWrites) fbSetStatus('⏳ Ukladám…');
      else if (snap.metadata.fromCache) fbSetStatus('📴 Offline');
      else fbSetStatus('✓ Uložené online');
    }, fbHandleError);

    fbUnsubSettings = FB_SETTINGS.onSnapshot(doc => {
      if (doc.exists) onSettings(doc.data());
      else if (!doc.metadata.fromCache) onSettings(null); // naozaj neexistuje (overené na serveri)
    }, fbHandleError);
  });
}

// Chyba pri zápise – účet s prístupom iba na prezeranie (napr. prehľad pre manželku)
function fbHandleWriteError(err) {
  console.error(err);
  if (err && err.code === 'permission-denied') {
    alert('Tento účet môže rozpočet iba prezerať, zmeny sa neuložili.');
  } else {
    fbSetStatus('⚠ Chyba pri ukladaní');
  }
}

// ---------- Zápisy ----------
// Zápisy nečakáme (await) – pri offline režime by čakali až na pripojenie.
// Zmena sa v appke prejaví hneď cez onSnapshot.
function fbAddItem(item) {
  const data = { ...item, ts: Date.now() };
  delete data.id;
  FB_ITEMS.add(data).catch(fbHandleWriteError);
}

function fbUpdateItem(id, item) {
  const data = { ...item };
  delete data.id;
  delete data.ts;
  FB_ITEMS.doc(id).update(data).catch(fbHandleWriteError);
}

function fbDeleteItem(id) {
  FB_ITEMS.doc(id).delete().catch(fbHandleWriteError);
}

function fbSaveSettings(categories, balances) {
  FB_SETTINGS.set({ categories, balances }).catch(fbHandleWriteError);
}

// ---------- Jednorazový prenos z Google Tabuľky ----------
async function fbImportFromSheet(scriptUrl, parseDateAndMonth, parseAmount) {
  const res = await fetch(scriptUrl);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return 0;

  const base = Date.now() - data.length;
  const rows = data.map((row, idx) => {
    const parsed = parseDateAndMonth(row.date);
    return {
      account: 'Rodinka',
      date: parsed.date,
      month: parsed.month,
      title: String(row.title ?? ''),
      cat: String(row.cat ?? ''),
      nature: String(row.nature ?? ''),
      type: String(row.type ?? ''),
      amount: parseAmount(row.amount),
      ts: base + idx // zachová poradie zo Sheetu
    };
  });

  for (let i = 0; i < rows.length; i += 400) {
    const batch = fbDb.batch();
    rows.slice(i, i + 400).forEach(r => batch.set(FB_ITEMS.doc(), r));
    await batch.commit();
  }
  return rows.length;
}

// ---------- Záloha do súboru (otvorí sa v Exceli) ----------
function fbDownloadBackup(items) {
  const esc = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const sorted = items.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || ((a.ts || 0) - (b.ts || 0)));
  const lines = [['Dátum', 'Položka', 'Kategória', 'Povaha', 'Typ', 'Suma'].join(';')];
  sorted.forEach(i => {
    lines.push([i.date, i.title, i.cat, i.nature, i.type, String(i.amount).replace('.', ',')].map(esc).join(';'));
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rozpocet-zaloha-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
