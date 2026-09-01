/* ============================================================================
 * Pragati Vidyalaya ERP - Cloud Sync layer (Firebase Auth + Firestore)
 * ----------------------------------------------------------------------------
 * Design goals:
 *   - STRICTLY ADDITIVE. If Firebase is absent, unconfigured, blocked or the
 *     device is offline, the app behaves exactly as before (pure localStorage).
 *   - Two clean seams in the app: every read goes through gd() (localStorage)
 *     and every write goes through sd(). We wrap sd() to also push to the cloud,
 *     and we push cloud changes back into localStorage + re-render.
 *   - Sign-in is OPTIONAL and lives in Settings. No login => local-only.
 *
 * Data model in Firestore:
 *   schools/{PV_SCHOOL_ID}/kv/{storageKey}  ->  { json: "<stringified value>",
 *                                                 u: <serverTimestamp>, by: uid }
 *   Values are stored as JSON strings to sidestep Firestore's nested-array rules.
 *
 * Synced keys mirror the app's own Export/Import set (students, attendance,
 * marks, records, homework, contacts, co-curricular, library, subjects,
 * exam types, marks log). Device PIN and photos stay local by design.
 * ========================================================================== */
(function () {
  'use strict';

  var TAG = '[pv-sync]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {} }
  function toast(msg, kind) { try { if (typeof window.showToast === 'function') window.showToast(msg, kind || 'ok'); } catch (e) {} }

  // ---- Which localStorage keys we sync (mirror the app's Export set) ----------
  function keyList() {
    var K = window.K || {};
    var ks = [K.stu, K.att, K.marks, K.recs, K.hw, K.contacts, K.cc, K.lib, K.subj, K.exam, K.mlog];
    // Fallback to literal keys if K is somehow unavailable.
    var fallback = ['pv_stu','pv_att','pv_marks','pv_recs','pv_hw','pv_contacts','pv_cc','pv_lib','pv_subj','pv_exam','pv_mlog'];
    ks = ks.filter(function (k) { return typeof k === 'string' && k; });
    return ks.length ? ks : fallback;
  }
  var SYNC_KEYS = keyList();
  function isSynced(k) { return SYNC_KEYS.indexOf(k) !== -1; }

  var MAX_DOC = 900000; // ~0.9 MB guard under Firestore's 1 MB/doc limit.

  // ---- State ------------------------------------------------------------------
  var state = {
    ready: false,      // Firebase initialised & configured
    signedIn: false,
    user: null,
    db: null,
    auth: null,
    unsub: null,       // realtime listener unsubscribe
    reason: ''         // why cloud is off, for the UI
  };

  // ---- Re-render tracking: remember the current page and refresh it -----------
  window.__pvPage = window.__pvPage || 'dash';
  (function wrapGo() {
    var orig = window.go;
    if (typeof orig === 'function') {
      window.go = function (pg) { window.__pvPage = pg; return orig.apply(this, arguments); };
    }
  })();
  function refresh() { try { if (typeof window.go === 'function') window.go(window.__pvPage || 'dash'); } catch (e) {} }

  // ---- Wrap sd() so every write also pushes to the cloud (debounced) ----------
  var pushTimers = {};
  (function wrapSd() {
    var orig = window.sd;
    window.sd = function (k, v) {
      var r = (typeof orig === 'function') ? orig.apply(this, arguments) : undefined;
      try {
        if (state.signedIn && isSynced(k)) {
          clearTimeout(pushTimers[k]);
          pushTimers[k] = setTimeout(function () { pushKey(k); }, 400);
        }
      } catch (e) { log('sd hook error', e); }
      return r;
    };
    if (typeof orig !== 'function') log('WARN: original sd() not found; writes will be local-only until it exists');
  })();

  // ---- Firestore helpers ------------------------------------------------------
  function schoolId() { return window.PV_SCHOOL_ID || 'pragati-default'; }
  function colRef() { return state.db.collection('schools').doc(schoolId()).collection('kv'); }
  function stamp() { return firebase.firestore.FieldValue.serverTimestamp(); }

  function pushKey(k) {
    if (!state.signedIn || !state.db) return;
    var val = localStorage.getItem(k);
    if (val == null) val = 'null';
    if (val.length > MAX_DOC) { log('skip push, too large:', k, val.length); toast('“' + k + '” too big for cloud; kept local', 'err'); return; }
    colRef().doc(k).set({
      json: val,
      u: stamp(),
      by: state.user ? state.user.uid : null
    }).catch(function (e) { log('push failed', k, e && e.code); });
  }

  // Apply an incoming cloud value into localStorage. Returns true if it changed.
  function applyCloud(k, json) {
    if (json == null) return false;
    var cur = localStorage.getItem(k);
    if (cur === json) return false;
    try { localStorage.setItem(k, json); } catch (e) { log('localStorage set failed', k, e); return false; }
    return true;
  }

  // Initial reconciliation on sign-in, then attach the realtime listener.
  function startSync() {
    colRef().get().then(function (snap) {
      var changed = false;
      var have = {};
      snap.forEach(function (doc) {
        have[doc.id] = true;
        if (!isSynced(doc.id)) return;
        var d = doc.data();
        if (applyCloud(doc.id, d && d.json)) changed = true;
      });

      if (snap.empty) {
        // First device for this school: seed the cloud from local data.
        SYNC_KEYS.forEach(pushKey);
        toast('Cloud initialised from this device', 'ok');
      } else {
        // Push up any keys that exist locally but not yet in the cloud.
        SYNC_KEYS.forEach(function (k) {
          if (!have[k] && localStorage.getItem(k) != null) pushKey(k);
        });
        if (changed) refresh();
        toast('Data loaded from cloud', 'ok');
      }
      attachListener();
      renderPanel();
    }).catch(function (e) {
      log('startSync error', e);
      state.reason = 'Sync error: ' + (e && e.code || e);
      renderPanel();
    });
  }

  function attachListener() {
    if (state.unsub) { try { state.unsub(); } catch (e) {} }
    state.unsub = colRef().onSnapshot(function (snap) {
      var changed = false;
      snap.docChanges().forEach(function (ch) {
        if (ch.doc.metadata.hasPendingWrites) return; // ignore our own just-written echo
        var k = ch.doc.id;
        if (!isSynced(k)) return;
        var d = ch.doc.data();
        if (applyCloud(k, d && d.json)) changed = true;
      });
      if (changed) { refresh(); toast('Synced from cloud', 'ok'); }
    }, function (e) { log('listener error', e && e.code); });
  }

  function stopSync() {
    if (state.unsub) { try { state.unsub(); } catch (e) {} state.unsub = null; }
  }

  // ---- Initialise Firebase (guarded) ------------------------------------------
  function initFirebase() {
    if (typeof firebase === 'undefined' || !firebase.initializeApp) {
      state.reason = 'Firebase SDK not loaded (offline or blocked). Running local-only.';
      return false;
    }
    var cfg = window.PV_FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || cfg.apiKey === 'PASTE_API_KEY' || String(cfg.apiKey).indexOf('PASTE_') === 0) {
      state.reason = 'Firebase not configured yet. Fill in firebase-config.js to enable cloud sync.';
      return false;
    }
    try {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(cfg);
      state.auth = firebase.auth();
      state.db = firebase.firestore();
      try {
        state.db.enablePersistence({ synchronizeTabs: true }).catch(function () {/* multi-tab or unsupported */});
      } catch (e) {}
      state.ready = true;
      state.auth.onAuthStateChanged(function (user) {
        state.user = user;
        state.signedIn = !!user;
        if (user) { log('signed in', user.email); startSync(); }
        else { log('signed out'); stopSync(); }
        renderPanel();
      });
      return true;
    } catch (e) {
      state.reason = 'Firebase init failed: ' + (e && e.message || e);
      log(state.reason);
      return false;
    }
  }

  // ---- Public actions (used by the Settings panel) ----------------------------
  function signIn(email, pass, msgEl) {
    if (!state.ready) { if (msgEl) msgEl.textContent = state.reason; return; }
    if (msgEl) { msgEl.style.color = 'var(--muted)'; msgEl.textContent = 'Signing in…'; }
    state.auth.signInWithEmailAndPassword(email, pass).then(function () {
      if (msgEl) { msgEl.style.color = 'var(--green)'; msgEl.textContent = 'Signed in.'; }
    }).catch(function (e) {
      if (msgEl) { msgEl.style.color = 'var(--red)'; msgEl.textContent = friendlyAuthError(e); }
    });
  }
  function signOutNow() { if (state.auth) state.auth.signOut(); }

  function forceUpload() {
    if (!state.signedIn) { toast('Sign in first', 'err'); return; }
    SYNC_KEYS.forEach(pushKey);
    toast('This device’s data pushed to cloud', 'ok');
  }
  function forceDownload() {
    if (!state.signedIn) { toast('Sign in first', 'err'); return; }
    colRef().get().then(function (snap) {
      var changed = false;
      snap.forEach(function (doc) { if (isSynced(doc.id)) { var d = doc.data(); if (applyCloud(doc.id, d && d.json)) changed = true; } });
      if (changed) refresh();
      toast('Pulled latest from cloud', 'ok');
    }).catch(function () { toast('Download failed', 'err'); });
  }

  function friendlyAuthError(e) {
    var c = e && e.code || '';
    if (c === 'auth/invalid-email') return 'That email address is not valid.';
    if (c === 'auth/user-not-found' || c === 'auth/wrong-password' || c === 'auth/invalid-credential') return 'Wrong email or password.';
    if (c === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
    if (c === 'auth/network-request-failed') return 'No network. Check your connection.';
    return (e && e.message) || 'Sign-in failed.';
  }

  // ---- Settings panel UI ------------------------------------------------------
  function renderPanel() {
    var host = document.getElementById('p-settings');
    if (!host) return;
    var card = document.getElementById('pv-cloud-card');
    if (!card) {
      card = document.createElement('div');
      card.className = 'card';
      card.id = 'pv-cloud-card';
      var head = host.querySelector('.page-head');
      if (head && head.parentNode === host) host.insertBefore(card, head.nextSibling);
      else host.insertBefore(card, host.firstChild);
    }

    var statusHtml, body;
    if (!state.ready) {
      statusHtml = '<span class="badge badge-gray">Cloud off</span>';
      body = '<p class="page-sub" style="margin-bottom:10px">' + escapeHtml(state.reason || 'Cloud sync is not available.') + '</p>' +
             '<p class="page-sub">Your data is safe on this device. Use <b>Export / Import JSON</b> below to move it manually.</p>';
    } else if (state.signedIn) {
      statusHtml = '<span class="badge badge-green">Synced</span>';
      body =
        '<p class="page-sub" style="margin-bottom:12px">Signed in as <b>' + escapeHtml(state.user && state.user.email || '') + '</b>. ' +
        'Changes on this device sync automatically to the cloud and to your other devices.</p>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn-ghost btn-sm" id="pv-btn-upload">&#11014; Upload this device</button>' +
          '<button class="btn btn-ghost btn-sm" id="pv-btn-download">&#11015; Download latest</button>' +
          '<button class="btn btn-red btn-sm" id="pv-btn-signout">Sign out</button>' +
        '</div>';
    } else {
      statusHtml = '<span class="badge badge-orange">Not signed in</span>';
      body =
        '<p class="page-sub" style="margin-bottom:12px">Sign in with your teacher account to sync this class across all your devices.</p>' +
        '<div class="field" style="margin-bottom:8px"><label>Email</label><input type="text" id="pv-email" autocomplete="username" placeholder="you@example.com"/></div>' +
        '<div class="field" style="margin-bottom:8px"><label>Password</label><input type="password" id="pv-pass" autocomplete="current-password" placeholder="Your password"/></div>' +
        '<button class="btn btn-blue btn-sm" id="pv-btn-signin">Sign in &amp; sync</button>' +
        '<div id="pv-auth-msg" style="font-size:12px;margin-top:8px;min-height:16px;color:var(--muted)"></div>';
    }

    card.innerHTML =
      '<div class="card-head"><div class="card-title">&#9729; Cloud Sync (Firebase)</div>' + statusHtml + '</div>' +
      '<div class="card-body">' + body + '</div>';

    // Wire buttons (elements are fresh each render).
    var byId = function (id) { return document.getElementById(id); };
    if (byId('pv-btn-signin')) byId('pv-btn-signin').onclick = function () {
      signIn((byId('pv-email').value || '').trim(), byId('pv-pass').value || '', byId('pv-auth-msg'));
    };
    if (byId('pv-pass')) byId('pv-pass').onkeydown = function (ev) { if (ev.key === 'Enter' && byId('pv-btn-signin')) byId('pv-btn-signin').click(); };
    if (byId('pv-btn-signout')) byId('pv-btn-signout').onclick = signOutNow;
    if (byId('pv-btn-upload')) byId('pv-btn-upload').onclick = forceUpload;
    if (byId('pv-btn-download')) byId('pv-btn-download').onclick = forceDownload;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Boot -------------------------------------------------------------------
  function boot() {
    initFirebase();      // sets state.ready / state.reason
    renderPanel();       // show status in Settings (created lazily; safe if hidden)
    // Re-render the panel whenever the user navigates to Settings, so it stays current.
    var origGo = window.go;
    if (typeof origGo === 'function') {
      window.go = function (pg) { var r = origGo.apply(this, arguments); if (pg === 'settings') renderPanel(); return r; };
    }
    log(state.ready ? 'ready' : ('local-only: ' + state.reason));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Expose a tiny handle for debugging.
  window.PVSync = { state: state, uploadNow: forceUpload, downloadNow: forceDownload, signOut: signOutNow };
})();
