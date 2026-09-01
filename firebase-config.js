/* ============================================================================
 * Firebase configuration for Pragati Vidyalaya ERP
 * ----------------------------------------------------------------------------
 * HOW TO FILL THIS IN (one time):
 *   1. Go to https://console.firebase.google.com  ->  create/open your project.
 *   2. Project settings (gear icon) -> "Your apps" -> Web app (</>) -> register.
 *   3. Copy the "firebaseConfig" values it shows you into the object below.
 *   4. In the console, enable:
 *        - Build > Authentication > Sign-in method > Email/Password
 *        - Build > Firestore Database  (create in production mode)
 *   5. Add each teacher as a user under Authentication > Users.
 *
 * Until real values are filled in, the app runs LOCAL-ONLY (localStorage) exactly
 * as before - cloud sync simply stays off. Nothing breaks.
 *
 * NOTE: these Firebase web keys are NOT secrets - they are safe to commit and
 * ship in client code. Your data is protected by Authentication + Firestore
 * security rules (see firestore.rules), not by hiding this config.
 * ========================================================================== */

window.PV_FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

// All devices that share this ID read/write the same class data.
// Keep it the same on every teacher's phone/computer for this class.
window.PV_SCHOOL_ID = "pragati-vidyalaya-class10";
