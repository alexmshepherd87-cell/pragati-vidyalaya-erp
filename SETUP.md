# Pragati Vidyalaya ERP — PWA + Firebase Setup

This app is a Progressive Web App (installable on phones, works offline) with
**optional** Firebase cloud sync so one class's data stays in step across all
your devices.

> **Important:** The app works perfectly with **no setup at all** — data lives
> in the browser (localStorage), same as before. Firebase only adds
> cross-device sync. If you never fill in `firebase-config.js`, cloud sync
> simply stays off and nothing breaks.

---

## Files in this project

| File | What it is |
|------|-----------|
| `pragati_v19.html` | The app itself |
| `index.html` | Entry page (redirects into the app) |
| `manifest.json` | PWA manifest (icons, name, theme) |
| `sw.js` | Service worker — offline caching |
| `icon-192.png`, `icon-512.png` | App icons (512 is upscaled — replace with a crisp original when you have one) |
| `firebase-config.js` | **You paste your Firebase keys here** |
| `pv-sync.js` | Cloud sync engine (no need to edit) |
| `firebase.json`, `.firebaserc`, `firestore.rules` | Firebase Hosting + database config |
| `pragati-data-backup.json` | A recovered data export that had been stuck inside `manifest.json` — kept safe here |

---

## Part A — Create the Firebase project (one time, ~10 min)

1. Go to <https://console.firebase.google.com> and **Add project**
   (e.g. `pragati-vidyalaya`). Google Analytics is optional — you can skip it.

2. **Register a Web app:** Project settings (⚙️ gear, top-left) → *Your apps* →
   click the web icon `</>` → give it a nickname → **Register app**.
   Firebase shows you a `firebaseConfig = { ... }` block. Keep it open.

3. **Enable Email/Password sign-in:** left menu → **Build → Authentication →
   Get started → Sign-in method →** enable **Email/Password → Save**.

4. **Add your teacher login(s):** Authentication → **Users → Add user** →
   enter an email + password. Repeat for each teacher who should have access.

5. **Create the database:** Build → **Firestore Database → Create database** →
   choose a location → start in **production mode** (the rules in this repo
   will lock it down properly).

---

## Part B — Put your keys into the app

1. Open `firebase-config.js` and replace the `PASTE_...` placeholders with the
   values from the `firebaseConfig` block in step A-2:

   ```js
   window.PV_FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "pragati-vidyalaya.firebaseapp.com",
     projectId: "pragati-vidyalaya",
     storageBucket: "pragati-vidyalaya.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef..."
   };
   window.PV_SCHOOL_ID = "pragati-vidyalaya-class10"; // keep identical on every device
   ```

   > These web keys are **not secrets** — they're meant to ship in the browser.
   > Your data is protected by the login + `firestore.rules`, not by hiding them.

2. Open `.firebaserc` and replace `PASTE_PROJECT_ID` with your real
   `projectId` (e.g. `pragati-vidyalaya`).

---

## Part C — Deploy to Firebase Hosting

You need [Node.js](https://nodejs.org) installed. Then, in this project folder:

```bash
npm install -g firebase-tools     # once
firebase login                    # opens a browser to log into YOUR Google account
firebase deploy                   # uploads the site + Firestore rules
```

`firebase deploy` prints a **Hosting URL** like
`https://pragati-vidyalaya.web.app` — that's your live app. Open it on a phone
and use the browser's **"Add to Home screen" / "Install app"** to install the PWA.

Deploy only hosting or only rules if you prefer:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

---

## Part D — Using cloud sync

1. Open the app → **Settings** → the **Cloud Sync (Firebase)** card at the top.
2. Sign in with a teacher email/password you created in step A-4.
3. On the **first** device you sign in on, your existing local data is uploaded
   to the cloud automatically ("Cloud initialised from this device").
4. On every **other** device, sign in with the same account — it pulls the
   cloud data down and stays in sync in real time from then on.

Manual controls are on the same card:
- **Upload this device** — force-push this device's data up.
- **Download latest** — force-pull the cloud copy down.

### What syncs
Students, attendance, marks, records, homework, contacts, co-curricular,
library, subjects, exam types, and the marks log — the same set as the app's
**Export/Import JSON**.

### What stays local (by design)
- The **4-digit PIN** lock (it's a per-device lock).
- Student **photos** (they can be large; kept on-device to stay under
  Firestore's per-document size limit).

---

## Troubleshooting

- **"Cloud not configured" in Settings** → `firebase-config.js` still has
  `PASTE_...` placeholders.
- **Can't sign in** → make sure Email/Password is enabled (A-3) and the user
  exists (A-4). "Wrong email or password" also appears for a non-existent user.
- **Nothing syncs but sign-in works** → confirm `PV_SCHOOL_ID` is *identical*
  on all devices, and that you deployed the Firestore rules
  (`firebase deploy --only firestore:rules`).
- **Updated the app but the phone shows the old version** → the service worker
  caches the shell. Bump `CACHE_VERSION` at the top of `sw.js` before deploying;
  the new worker takes over on next launch.
