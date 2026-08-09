/* ============================================================
   FIREBASE CONFIG — placeholder, not yet connected to a real project.
   ============================================================
   HOW TO ACTIVATE (full detail in firebase/README.md):
   1. Go to https://console.firebase.google.com and create a project
      (the free "Spark" plan covers Firestore + Auth; Cloud Storage
      may require upgrading to "Blaze" pay-as-you-go — see the
      billing note in firebase/README.md before deciding on that).
   2. In the project, add a Web App and copy its config object into
      the six constants below, replacing every REPLACE_WITH_ placeholder.
   3. Enable Cloud Firestore — start in "production mode", NOT test
      mode, then paste firestore.rules into the Rules tab and Publish.
   4. Enable Authentication → Sign-in method → Email/Password.
   5. Manually create ONE Authentication user for yourself.
   6. Copy that user's UID, then manually create a Firestore document
      at admins/{that UID} (any field, e.g. { role: "admin" }) — this
      is the trusted allow-list firestore.rules checks. There is no
      app feature that can create this document; it must be done by
      hand in the Firebase Console.
   7. Open admin.html and log in with that account.

   Until step 2 is done, the dynamic portfolio/reviews features and
   the admin panel safely no-op (see isFirebaseConfigured() below) —
   nothing on the public site breaks in the meantime. The static
   concept portfolio and static testimonials remain the fallback.
   ============================================================

   NOTE — this file is NOT a secret.
   A Firebase Web App config (apiKey, authDomain, projectId, etc.) is
   designed to be embedded in public client code — anyone can read it
   from the browser, and that is expected and safe. It identifies
   which Firebase project to talk to; it does not grant access to
   anything by itself. The real security boundary is Firebase
   Authentication + the rules in firestore.rules and storage.rules.

   What must NEVER go in this file, or anywhere in frontend code:
     - a service-account private key ("BEGIN PRIVATE KEY")
     - Firebase Admin SDK credentials (firebase-adminsdk-*.json)
     - any Google Cloud service-account JSON
     - database admin credentials
   Those belong only in a trusted server environment or a Cloud
   Function, never in code that ships to a browser.
   ============================================================ */

export const firebaseConfig = {
    apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
    authDomain: "REPLACE_WITH_FIREBASE_AUTH_DOMAIN",
    projectId: "REPLACE_WITH_FIREBASE_PROJECT_ID",
    storageBucket: "REPLACE_WITH_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_FIREBASE_MESSAGING_SENDER_ID",
    appId: "REPLACE_WITH_FIREBASE_APP_ID"
};

export function isFirebaseConfigured() {
    return firebaseConfig.apiKey !== "REPLACE_WITH_FIREBASE_API_KEY" && !!firebaseConfig.apiKey;
}
