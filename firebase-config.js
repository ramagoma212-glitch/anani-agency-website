/* ============================================================
   FIREBASE CONFIG — placeholder, not yet connected to a real project.
   ============================================================
   HOW TO ACTIVATE:
   1. Go to https://console.firebase.google.com and create a project
      (free "Spark" plan is enough for this site).
   2. In the project, enable:
        - Firestore Database (start in "production mode")
        - Authentication → Sign-in method → Email/Password
   3. In Project Settings → General → "Your apps" → add a Web app.
      Firebase will show you a config object — copy its values into
      the object below, replacing every "REPLACE_ME" placeholder.
   4. In Firestore, go to Rules and paste the contents of
      firestore.rules (in this same folder), then Publish.
   5. In Authentication → Users, manually add ONE user for yourself
      (your email + a password) — this is the only account that will
      be allowed to use admin.html, enforced by firestore.rules.
   6. Open admin.html, log in with that account, and you're live.

   Until step 3 is done, review submission / display and the admin
   panel will safely no-op (see the isFirebaseConfigured() checks in
   reviews-portfolio.js and admin.html) — nothing on the public site
   breaks in the meantime.
   ============================================================ */

export const firebaseConfig = {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME.firebaseapp.com",
    projectId: "REPLACE_ME",
    storageBucket: "REPLACE_ME.appspot.com",
    messagingSenderId: "REPLACE_ME",
    appId: "REPLACE_ME"
};

/* The one email allowed to act as admin (must match the user you
   create in Firebase Authentication in step 5 above). This is also
   enforced server-side in firestore.rules — this constant is only
   used client-side to decide what UI to show. */
export const ADMIN_EMAIL = "ramagoma212@gmail.com";

export function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "REPLACE_ME" && !!firebaseConfig.apiKey;
}
