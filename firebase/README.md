# RM Digitals — Firebase setup

This project's backend (portfolio, reviews, and the admin panel) runs on
[Firebase](https://firebase.google.com) — Cloud Firestore for the
database, Firebase Authentication for the admin login, and (optionally)
Cloud Storage for portfolio images.

**No Firebase project is connected yet.** Until you complete the steps
below, the public site works entirely on its static content (the
concept portfolio, the static testimonials, and the EmailJS contact
form), and `admin.html` shows a "Firebase Not Connected Yet" message.
Nothing on the public site breaks in the meantime.

---

## ⚠️ Firebase Web config is not a secret — but these are

A Firebase Web App config (`apiKey`, `authDomain`, `projectId`, etc. —
what goes in `firebase-config.js`) is designed to be public. Anyone can
read it from the browser; that's expected. It only identifies which
Firebase project to talk to — it doesn't grant access by itself. Real
security comes from Firebase Authentication + the rules in
`firestore.rules` and `storage.rules`.

What must **NEVER** go in `firebase-config.js`, or anywhere in this
repository's frontend code:
- a service-account private key (anything containing `BEGIN PRIVATE KEY`)
- a Firebase Admin SDK credentials file (`firebase-adminsdk-*.json`)
- any Google Cloud service-account JSON
- database admin credentials

Those belong only in a trusted server environment or a Cloud Function —
never in code that ships to a browser.

---

## ⚠️ Cloud Storage may require billing

Cloud Storage for Firebase can require the project to be on the
**Blaze (pay-as-you-go)** plan rather than the free Spark plan. **Do
not enable billing, upgrade the project, or activate Storage without
explicitly deciding to.** If you don't want to enable billing yet,
skip Storage entirely — the "Project Image" field in `admin.html` is
optional; you can leave it blank or store images elsewhere and paste
a URL if a future version supports that. Everything else (Firestore,
Auth, the admin panel, portfolio, reviews) works on the free plan.

---

## Setup steps

1. Go to the [Firebase Console](https://console.firebase.google.com)
   and create a project.
2. Add a **Web App** to the project (the `</>` icon on the project
   overview page). Firebase will show you a config object.
3. Copy those six values into `firebase-config.js`, replacing every
   `REPLACE_WITH_...` placeholder.
4. Go to **Build → Firestore Database → Create database**. Choose
   **production mode**, NOT test mode (test mode uses a temporary
   `allow read, write: if true` rule you must never actually rely on).
5. Go to **Firestore → Rules**, paste the contents of `firestore.rules`
   in full, and click **Publish**.
6. Go to **Firestore → Indexes**, and either add the two composite
   indexes described in `firestore.indexes.json` manually, or deploy
   them with the Firebase CLI: `firebase deploy --only firestore:indexes`.
7. Go to **Build → Authentication → Sign-in method**, enable
   **Email/Password**.
8. Go to **Authentication → Users → Add user**, and manually create
   ONE user for yourself (your email + a password). This is a normal
   Firebase Auth user — it has no special permissions yet.
9. Copy that user's **UID** from the Users list.
10. Go to **Firestore → Data**, and manually create a new document:
    - Collection: `admins`
    - Document ID: paste the UID from step 9
    - Add any field, e.g. `role` (string) = `admin`

    This document's mere existence is what `firestore.rules` checks —
    there is no app feature anywhere that can create it; it must be
    done by hand, here, in the Console.
11. (Optional) Create a **second** Auth user, without an `admins`
    document, to use as a non-admin test account for the checklist below.
12. (Optional, only if you want image uploads) Go to **Build →
    Storage**. If prompted to enable billing, **stop and decide
    deliberately** — see the warning above. If you proceed, go to
    **Storage → Rules**, paste `storage.rules`, and Publish.
13. If you activated Storage, Firebase may need the **Cloud Firestore
    service agent** permission enabled for `storage.rules`'
    `firestore.exists()` cross-service check to work. If uploads fail
    with a permissions error even though the admin document exists,
    check **IAM & Admin** for the `firebase-service-account` /
    Firestore service agent role, or consult Firebase's current docs
    for "Storage Security Rules access Firestore."
14. Open `admin.html` locally (via a local server, not `file://`) and
    log in with your admin account.
15. Test anonymous access (see the checklist below) using a private/
    incognito browser window, signed out.
16. If you created a non-admin test user, confirm it can sign in but
    is immediately signed back out with "not authorised as admin."
17. Confirm you (the real admin) can add, edit, publish/unpublish,
    feature, and delete a test project.
18. Confirm review moderation works: submit a test review from the
    public site (logged out), confirm it's `pending` and invisible
    publicly, then approve it in `admin.html` and confirm it appears.
19. If Storage is active, try uploading a project image and confirm
    it appears and that deleting the project also removes the image.
20. Test locally, thoroughly, before this ever goes near production.

---

## Firestore Security Rules are not filters

This trips people up: a Security Rule like
`allow read: if resource.data.published == true` does **not** mean "let
anyone read the collection, but hide unpublished documents." A client
requesting the *whole* `projects` collection with no filter will be
**denied outright** for any document that doesn't satisfy the rule —
Firestore rejects the read, it doesn't silently redact results.

That's why `reviews-portfolio.js` queries
`where('published', '==', true)` explicitly (and `admin.html` doesn't,
because the signed-in admin's read is allowed by the `isAdmin()`
branch of the same rule regardless of the `published` value). The
query and the rule have to agree, or the read fails.

---

## Security test checklist

Run through this as a real test against your project — not just a code
read-through — before trusting it in production.

| Action | Anonymous visitor | Authenticated non-admin | Admin |
|---|---|---|---|
| Read published projects | YES | YES | YES |
| Read unpublished projects | NO | NO | YES |
| Create project | NO | NO | YES |
| Update project | NO | NO | YES |
| Delete project | NO | NO | YES |
| Read approved reviews | YES | YES | YES |
| Read pending reviews | NO | NO | YES |
| Create a pending review | YES | YES | YES |
| Create an approved/rejected review | NO | NO | — (use Approve/Reject action) |
| Update/approve/reject a review | NO | NO | YES |
| Delete a review | NO | NO | YES |
| Read `admins/{own uid}` | NO (not signed in) | YES (their own — will be empty/non-existent) | YES |
| List the `admins` collection | NO | NO | NO (nobody — not even admin; not needed) |
| Create/update/delete an `admins` document | NO | NO | NO (Console/trusted access only) |
| Read leads | NO | NO | YES (once lead capture is activated) |
| Write leads | NO | NO | YES |
| Upload a portfolio image | NO | NO | YES (if Storage is active) |

If any row behaves differently than shown, treat it as a security bug
and fix the relevant rule in `firestore.rules` / `storage.rules` before
going further.

---

## Admin bootstrap — how the first admin account gets created

There is no "promote to admin" button anywhere in this app, on purpose.

1. Create the user manually in Firebase Authentication (Console, not code).
2. Copy that user's UID.
3. Manually create a document at `admins/{UID}` in Firestore (Console,
   not code) — any field, its existence is what matters.
4. Log in at `admin.html` and confirm access.
5. Confirm a different, non-admin account is correctly denied.

---

## Known limitations / future work

- **Review spam:** `reviews-portfolio.js` includes a basic honeypot
  field (`#rvWebsite`, CSS-hidden and out of the tab order) — a filled
  value silently drops the submission. This stops naive bots, not a
  determined one. Firestore rules correctly restrict *what* a public
  submission can contain, but nothing here rate-limits repeated
  submissions. Classify remaining anti-spam hardening as **incomplete**:
  future options include Firebase **App Check**, a Cloud Function with
  server-side validation and rate limiting, or Cloudflare Turnstile.
- **Storage file-type/size enforcement:** `storage.rules` checks
  `request.resource.size` and `request.resource.contentType` — this is
  a genuine server-side Firebase Storage Rules capability (more
  reliable than the equivalent best-effort metadata check that would
  be needed on some other backends), but has **not been verified
  against a live Firebase project** in this codebase — test it with a
  real oversized/wrong-type upload before trusting it.
- **App Check:** not enabled this milestone. It helps confirm requests
  come from your real app/website rather than a scripted client, but it
  does not replace Authentication or Security Rules. Future hardening.
- **Leads / lead-capture pipeline:** `leads/{leadId}` exists in
  `firestore.rules` as a foundation only — admin-only, zero public
  access. The public contact form still goes through EmailJS. A
  secure, validated, anti-spam-protected path from the contact form
  into `leads` (most likely a Cloud Function) is future work.
- **Client portal, invoices, quote calculator:** not part of this
  backend foundation — future milestones.
