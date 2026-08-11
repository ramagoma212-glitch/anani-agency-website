/* ============================================================
   RM Digitals — Client Portal logic (Milestone 22, invite flow
   hardened post-22)
   ============================================================
   Security model: a signed-in user only ever sees data reachable
   through their OWN clientAccounts/{uid} mapping — never a value
   read from the URL. Every list query below explicitly filters by
   the resolved clientId (rules are not filters — see
   firebase/README.md and firestore.rules for the matching server
   side of every rule referenced here).

   Invite handling: the ?invite= token is held locally (this tab
   only, see PENDING_INVITE_KEY) and is NEVER used to fetch
   portalInvites/{token} until the visitor is signed in AND their
   email is verified — firestore.rules itself now enforces that same
   gate server-side (an anonymous or wrong-email get() is denied
   outright, returning nothing about the invite), so this is
   defense-in-depth, not the actual boundary. See redeemInvite().
   ============================================================ */

import { isFirebaseConfigured } from './firebase-config.js';

if (!isFirebaseConfigured()) {
    document.getElementById('configWarning').style.display = 'block';
} else {
    runPortal();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function formatDateOnly(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRand(n) {
    const num = Number(n);
    const safe = Number.isFinite(num) ? Math.max(0, num) : 0;
    return 'R' + safe.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clampProgress(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

const STAGE_LABELS = {
    awaiting_content: 'Awaiting Content', planning: 'Planning', design: 'Design',
    development: 'Development', client_review: 'Client Review', revisions: 'Revisions',
    ready_to_launch: 'Ready to Launch', completed: 'Completed', on_hold: 'On Hold', cancelled: 'Cancelled'
};
const INVOICE_DISPLAY_LABELS = {
    draft: 'Draft', sent: 'Sent', part_paid: 'Part Paid', paid: 'Paid',
    overdue: 'Overdue', cancelled: 'Cancelled', overpaid: 'Overpaid'
};
const PENDING_INVITE_KEY = 'rmPortalPendingInvite';

function friendlyAuthError(err) {
    const code = (err && err.code) || '';
    const map = {
        'auth/invalid-email': "That email address doesn't look valid.",
        'auth/user-not-found': "We couldn't find an account with that email.",
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/too-many-requests': 'Too many attempts — please wait a few minutes and try again.',
        'auth/user-disabled': 'This account has been disabled. Please contact RM Digitals.',
        'auth/email-already-in-use': 'An account with that email already exists — try signing in instead.',
        'auth/weak-password': 'Please choose a stronger password (at least 6 characters).',
        'auth/missing-password': 'Please enter a password.'
    };
    return map[code] || 'Something went wrong. Please try again, or contact RM Digitals if it keeps happening.';
}

async function runPortal() {
    const { firebaseConfig } = await import('./firebase-config.js');
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    const fsMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);

    /* sessionStorage, not localStorage — the token is never persisted
       beyond this browser tab's lifetime ("session-only handling" per
       the hardening brief). This still covers the real use case (client
       leaves THIS tab open to check email for verification, comes back
       to it) — if they instead close the tab and click the invite link
       again later, the URL still carries the token and re-seeds this. */
    function pendingInviteToken() {
        try { return sessionStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
    }
    function clearPendingInviteToken() {
        try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
    }

    const cards = ['signInCard', 'registerCard', 'forgotCard', 'verifyCard', 'noAccessCard'];
    function switchAuthCard(id) {
        document.getElementById('authPanel').style.display = 'block';
        document.getElementById('portalPanel').style.display = 'none';
        cards.forEach(c => { document.getElementById(c).style.display = c === id ? 'block' : 'none'; });
    }

    /* Global Escape-key close for the read-only Project/Invoice/Receipt
       modals (Milestone 24 accessibility audit). */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.lead-modal-overlay.active').forEach(overlay => overlay.classList.remove('active'));
    });

    /* Capture ?invite=TOKEN once, hold it for this tab only (see
       pendingInviteToken() above), and never let the value flow
       anywhere except the one redemption call below — it is never used
       as an identifier or trusted for authorization by itself, never
       logged, and this page never fetches the invite document for an
       unauthenticated visitor (see redeemInvite()) — only the token
       itself is held locally until sign-in + email verification. */
    const urlToken = new URLSearchParams(window.location.search).get('invite');
    if (urlToken) {
        try { sessionStorage.setItem(PENDING_INVITE_KEY, urlToken); } catch { /* ignore storage errors */ }
        switchAuthCard('registerCard');
    }

    document.getElementById('showForgotBtn').addEventListener('click', () => switchAuthCard('forgotCard'));
    document.getElementById('showRegisterBtn').addEventListener('click', () => switchAuthCard('registerCard'));
    document.getElementById('showSignInFromRegisterBtn').addEventListener('click', () => switchAuthCard('signInCard'));
    document.getElementById('showSignInFromForgotBtn').addEventListener('click', () => switchAuthCard('signInCard'));

    /* ── Sign In ── */
    document.getElementById('siBtn').addEventListener('click', async () => {
        const msg = document.getElementById('siMsg');
        const email = document.getElementById('siEmail').value.trim();
        const password = document.getElementById('siPassword').value;
        if (!email || !password) { msg.textContent = 'Please enter your email and password.'; msg.className = 'form-msg error'; return; }
        msg.textContent = ''; msg.className = 'form-msg';
        try {
            await authMod.signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            msg.textContent = friendlyAuthError(err);
            msg.className = 'form-msg error';
        }
    });

    /* ── Register ──
       Only ever creates the Firebase Auth account + sends verification
       — the clientAccounts mapping is created later (after sign-in +
       verification) by redeemInvite(), gated entirely by
       firestore.rules, never trusted from this form. */
    document.getElementById('regBtn').addEventListener('click', async () => {
        const msg = document.getElementById('regMsg');
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regPasswordConfirm').value;
        if (!email || !password) { msg.textContent = 'Please enter your email and choose a password.'; msg.className = 'form-msg error'; return; }
        if (password.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; msg.className = 'form-msg error'; return; }
        if (password !== confirm) { msg.textContent = "Passwords don't match."; msg.className = 'form-msg error'; return; }
        msg.textContent = ''; msg.className = 'form-msg';
        try {
            const cred = await authMod.createUserWithEmailAndPassword(auth, email, password);
            await authMod.sendEmailVerification(cred.user);
        } catch (err) {
            msg.textContent = friendlyAuthError(err);
            msg.className = 'form-msg error';
        }
    });

    /* ── Forgot Password ──
       Always shows the same success message regardless of whether the
       account exists, so this can never be used to check which emails
       are registered. */
    document.getElementById('fpBtn').addEventListener('click', async () => {
        const msg = document.getElementById('fpMsg');
        const email = document.getElementById('fpEmail').value.trim();
        if (!email) { msg.textContent = 'Please enter your email address.'; msg.className = 'form-msg error'; return; }
        try {
            await authMod.sendPasswordResetEmail(auth, email);
        } catch (err) {
            if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-email') {
                msg.textContent = friendlyAuthError(err);
                msg.className = 'form-msg error';
                return;
            }
        }
        msg.textContent = 'If that email has an account, a reset link is on its way.';
        msg.className = 'form-msg success';
    });

    document.getElementById('resendVerifyBtn').addEventListener('click', async () => {
        const msg = document.getElementById('verifyMsg');
        if (!auth.currentUser) return;
        try {
            await authMod.sendEmailVerification(auth.currentUser);
            msg.textContent = 'Verification email sent — please check your inbox.';
            msg.className = 'form-msg success';
        } catch (err) {
            msg.textContent = friendlyAuthError(err);
            msg.className = 'form-msg error';
        }
    });

    document.getElementById('verifySignOutBtn').addEventListener('click', () => authMod.signOut(auth));
    document.getElementById('noAccessSignOutBtn').addEventListener('click', () => authMod.signOut(auth));
    document.getElementById('portalSignOutBtn').addEventListener('click', () => authMod.signOut(auth));

    /* ── Invite redemption ──
       Only ever called for a signed-in, verified user (checked below,
       and re-checked server-side). firestore.rules now gates the read
       itself — it only succeeds when this user's verified email
       matches the invite's email AND the invite is active AND
       unexpired, all three checked server-side (see the "hardened
       post-22" note in firestore.rules). That means a denied read is
       the EXPECTED, correct outcome for a wrong email, an expired
       invite, or an already-used one — and this function deliberately
       cannot tell those apart anymore (neither can the message it
       returns), because distinguishing them would itself leak which
       reason applied to whoever's asking. Nothing here trusts the
       client — every write below is independently re-validated by its
       own rule regardless of what this function does. */
    async function redeemInvite(token) {
        const user = auth.currentUser;
        if (!user || !user.emailVerified) return { ok: false, reason: 'not_verified' };

        let inviteSnap;
        try {
            inviteSnap = await fsMod.getDoc(fsMod.doc(db, 'portalInvites', token));
        } catch {
            // Deliberately no error detail captured or logged here — see
            // the comment above. One uniform outcome for every denial.
            return { ok: false, reason: 'not_eligible' };
        }
        if (!inviteSnap.exists()) return { ok: false, reason: 'not_eligible' };
        const invite = inviteSnap.data();

        try {
            await fsMod.setDoc(fsMod.doc(db, 'clientAccounts', user.uid), {
                clientId: invite.clientId,
                email: user.email,
                active: true,
                createdAt: fsMod.serverTimestamp(),
                inviteId: token
            });
        } catch {
            return { ok: false, reason: 'create_failed' };
        }
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'portalInvites', token), {
                active: false, redeemedAt: fsMod.serverTimestamp(), redeemedBy: user.uid
            });
        } catch (err) {
            // Non-fatal — the account mapping above already succeeded,
            // which is the part that actually matters for access. Logs
            // only the error message, never the token itself.
            console.warn('Could not mark invite as redeemed:', err.message);
        }
        return { ok: true, clientId: invite.clientId };
    }

    function showNoAccess(message) {
        document.getElementById('noAccessCard').querySelector('.card-sub').textContent = message;
        switchAuthCard('noAccessCard');
    }

    /* ── Auth state machine ── */
    authMod.onAuthStateChanged(auth, async (user) => {
        if (!user) { switchAuthCard(pendingInviteToken() ? 'registerCard' : 'signInCard'); return; }

        await user.reload().catch(() => {});
        if (!user.emailVerified) {
            document.getElementById('verifyEmailText').textContent = user.email || '';
            switchAuthCard('verifyCard');
            return;
        }

        let accountSnap;
        try {
            accountSnap = await fsMod.getDoc(fsMod.doc(db, 'clientAccounts', user.uid));
        } catch (err) {
            showNoAccess('We could not check your account access right now (' + err.message + '). Please try again shortly.');
            return;
        }

        if (!accountSnap.exists()) {
            const token = pendingInviteToken();
            if (token) {
                const result = await redeemInvite(token);
                if (result.ok) {
                    clearPendingInviteToken();
                    enterPortal(result.clientId, user);
                    return;
                }
                /* One deliberately uniform message covers "not_eligible"
                   whether the real cause was a wrong email, an expired
                   invite, or an already-used one — the server-side rule
                   can no longer be read in any of those cases, so this
                   page has no way to tell them apart, and intentionally
                   doesn't try to (see redeemInvite()'s comment). */
                const reasonMessages = {
                    not_verified: 'Please verify your email first.',
                    not_eligible: "We couldn't find an active invite for your account. Please make sure you're signed in with the exact email address RM Digitals sent the invite to, and that the link hasn't expired or already been used. Contact RM Digitals if you need a new invite.",
                    create_failed: 'We could not activate your account right now. Please try again shortly.'
                };
                showNoAccess(reasonMessages[result.reason] || 'We could not link your account. Please contact RM Digitals.');
                return;
            }
            showNoAccess("Your account isn't linked to an RM Digitals client yet. If you have an invite link from RM Digitals, please use it directly — otherwise, contact us and we'll help.");
            return;
        }

        const account = accountSnap.data();
        if (!account.active) {
            showNoAccess('Your Client Portal access has been disabled. Please contact RM Digitals if you believe this is a mistake.');
            return;
        }
        enterPortal(account.clientId, user);
    });

    /* ── Portal dashboard ── */
    let activeProjects = [];
    let activeInvoices = [];
    let activeReceipts = [];

    async function enterPortal(clientId, user) {
        document.getElementById('authPanel').style.display = 'none';
        document.getElementById('portalPanel').style.display = 'block';
        document.getElementById('whoName').textContent = user.email || '';

        await Promise.all([
            loadPortalProjects(clientId),
            loadPortalReceipts(clientId).then(() => loadPortalInvoices(clientId))
        ]);
    }

    async function loadPortalProjects(clientId) {
        const list = document.getElementById('portalProjectsList');
        list.innerHTML = '<p class="empty-note">Loading…</p>';
        try {
            const q = fsMod.query(fsMod.collection(db, 'clientPortalProjects'), fsMod.where('clientId', '==', clientId));
            const snap = await fsMod.getDocs(q);
            activeProjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load your projects: ${escapeHtml(err.message)}</p>`;
            return;
        }
        if (!activeProjects.length) { list.innerHTML = '<p class="empty-note">No projects linked to the portal yet.</p>'; return; }
        list.innerHTML = '';
        activeProjects.forEach(p => {
            const row = document.createElement('div');
            row.className = 'portal-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(p.projectName)}</strong>
                    <span>${escapeHtml(STAGE_LABELS[p.stage] || p.stage)} · ${clampProgress(p.progress)}% complete</span>
                </div>
            `;
            row.addEventListener('click', () => openProjectDetail(p));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openProjectDetail(p); });
            list.appendChild(row);
        });
    }

    function openProjectDetail(p) {
        document.getElementById('pdProjectName').textContent = p.projectName || '';
        document.getElementById('pdProjectType').textContent = p.projectType || '';
        const progress = clampProgress(p.progress);
        document.getElementById('pdProgressBar').style.width = progress + '%';
        document.getElementById('pdProgressText').textContent = progress;
        document.getElementById('pdStageText').textContent = STAGE_LABELS[p.stage] || p.stage || '';
        document.getElementById('pdTargetDate').textContent = p.targetDate ? formatDateOnly(p.targetDate) : 'Not yet set';

        const liveRow = document.getElementById('pdLiveUrlRow');
        if (p.liveWebsiteUrl) {
            liveRow.style.display = 'block';
            document.getElementById('pdLiveUrlLink').href = p.liveWebsiteUrl;
        } else {
            liveRow.style.display = 'none';
        }

        const descSection = document.getElementById('pdDescriptionSection');
        if (p.description) { descSection.style.display = 'block'; document.getElementById('pdDescription').textContent = p.description; }
        else descSection.style.display = 'none';

        const checklistSection = document.getElementById('pdChecklistSection');
        const checklistList = document.getElementById('pdChecklistList');
        const checklist = p.contentChecklist || [];
        if (!checklist.length) { checklistSection.style.display = 'none'; }
        else {
            checklistSection.style.display = 'block';
            checklistList.innerHTML = '';
            checklist.forEach(item => {
                const row = document.createElement('div');
                row.className = 'checklist-item ' + (item.received ? 'done' : 'pending');
                row.innerHTML = `<i class="fas ${item.received ? 'fa-circle-check' : 'fa-circle'}"></i><span></span>`;
                row.querySelector('span').textContent = item.label;
                checklistList.appendChild(row);
            });
        }

        const completionSection = document.getElementById('pdCompletionSection');
        const completionList = document.getElementById('pdCompletionList');
        const completion = p.completionChecklist || [];
        if (!completion.length) { completionSection.style.display = 'none'; }
        else {
            completionSection.style.display = 'block';
            completionList.innerHTML = '';
            completion.forEach(item => {
                const cls = item.status === 'completed' ? 'done' : item.status === 'na' ? 'na' : 'pending';
                const icon = item.status === 'completed' ? 'fa-circle-check' : item.status === 'na' ? 'fa-circle-minus' : 'fa-circle';
                const row = document.createElement('div');
                row.className = 'checklist-item ' + cls;
                row.innerHTML = `<i class="fas ${icon}"></i><span></span>`;
                row.querySelector('span').textContent = item.label;
                completionList.appendChild(row);
            });
        }

        document.getElementById('projectDetailOverlay').classList.add('active');
    }
    document.getElementById('projectDetailClose').addEventListener('click', () => document.getElementById('projectDetailOverlay').classList.remove('active'));
    document.getElementById('projectDetailOverlay').addEventListener('click', (e) => { if (e.target.id === 'projectDetailOverlay') document.getElementById('projectDetailOverlay').classList.remove('active'); });

    /* ── Receipts (loaded first — invoices derive "Paid" from these) ──
       The portal has no access to clientProjects (by design — see
       firestore.rules), so it can't read raw payment records the way
       admin.js does. Receipts are the client-facing proof-of-payment
       record, already scoped to this client, so they're the honest,
       secure source for what a client sees as "paid" here — an
       invoice payment the admin hasn't yet issued a receipt for
       simply won't show as paid until it does. */
    async function loadPortalReceipts(clientId) {
        const list = document.getElementById('portalReceiptsList');
        list.innerHTML = '<p class="empty-note">Loading…</p>';
        try {
            const q = fsMod.query(fsMod.collection(db, 'receipts'), fsMod.where('clientId', '==', clientId));
            const snap = await fsMod.getDocs(q);
            activeReceipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load your receipts: ${escapeHtml(err.message)}</p>`;
            return;
        }
        if (!activeReceipts.length) { list.innerHTML = '<p class="empty-note">No receipts yet.</p>'; return; }
        list.innerHTML = '';
        activeReceipts
            .slice()
            .sort((a, b) => {
                const at = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
                const bt = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
                return bt - at;
            })
            .forEach(r => {
                const row = document.createElement('div');
                row.className = 'portal-row';
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.innerHTML = `
                    <div class="info">
                        <strong>${escapeHtml(r.receiptNumber)}</strong>
                        <span>${escapeHtml(formatDateOnly(r.paymentDate))}${r.voided ? ' · Voided' : ''}</span>
                    </div>
                    <div class="amount-col">${formatRand(r.amount)}</div>
                `;
                row.addEventListener('click', () => openReceiptPreview(r));
                row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openReceiptPreview(r); });
                list.appendChild(row);
            });
    }

    function openReceiptPreview(r) {
        document.getElementById('rpReceiptNumber').textContent = r.receiptNumber || '';
        document.getElementById('rpDate').textContent = formatDateOnly(r.paymentDate);
        document.getElementById('rpVoidedRow').style.display = r.voided ? 'block' : 'none';
        document.getElementById('rpInvoiceRef').textContent = r.invoiceNumber || 'No related invoice';
        document.getElementById('rpAmount').textContent = formatRand(r.amount);
        document.getElementById('rpMethod').textContent = r.paymentMethod || '—';
        document.getElementById('rpDescription').textContent = r.description || '';
        document.getElementById('receiptPreviewOverlay').classList.add('active');
    }
    document.getElementById('receiptPreviewClose').addEventListener('click', () => document.getElementById('receiptPreviewOverlay').classList.remove('active'));
    document.getElementById('receiptPreviewOverlay').addEventListener('click', (e) => { if (e.target.id === 'receiptPreviewOverlay') document.getElementById('receiptPreviewOverlay').classList.remove('active'); });
    document.getElementById('rpPrintBtn').addEventListener('click', () => window.print());

    function computePortalInvoicePaid(invoice) {
        return activeReceipts
            .filter(r => r.invoiceId === invoice.id && !r.voided)
            .reduce((sum, r) => sum + Math.max(0, Number(r.amount) || 0), 0);
    }
    function portalInvoiceStatus(invoice, paid) {
        if (invoice.workflowStatus === 'cancelled') return 'cancelled';
        if (invoice.workflowStatus === 'draft') return 'draft';
        const total = Math.max(0, Number(invoice.total) || 0);
        const outstanding = total - paid;
        if (paid > total + 0.001) return 'overpaid';
        if (outstanding <= 0.001) return 'paid';
        if (invoice.workflowStatus === 'sent' && invoice.dueDate && outstanding > 0.001) {
            const due = invoice.dueDate.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate);
            const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
            if (due.getTime() < startOfToday.getTime()) return 'overdue';
        }
        if (paid > 0.001) return 'part_paid';
        return 'sent';
    }

    async function loadPortalInvoices(clientId) {
        const list = document.getElementById('portalInvoicesList');
        list.innerHTML = '<p class="empty-note">Loading…</p>';
        try {
            const q = fsMod.query(fsMod.collection(db, 'invoices'), fsMod.where('clientId', '==', clientId));
            const snap = await fsMod.getDocs(q);
            // Draft invoices are internal working documents — never shown to
            // the client until the admin marks them Sent.
            activeInvoices = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(inv => inv.workflowStatus !== 'draft');
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load your invoices: ${escapeHtml(err.message)}</p>`;
            return;
        }
        if (!activeInvoices.length) { list.innerHTML = '<p class="empty-note">No invoices yet.</p>'; return; }
        list.innerHTML = '';
        activeInvoices
            .slice()
            .sort((a, b) => {
                const at = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
                const bt = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
                return bt - at;
            })
            .forEach(inv => {
                const paid = computePortalInvoicePaid(inv);
                const disp = portalInvoiceStatus(inv, paid);
                const row = document.createElement('div');
                row.className = 'portal-row';
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.innerHTML = `
                    <div class="info">
                        <strong>${escapeHtml(inv.invoiceNumber)}</strong>
                        <span>${escapeHtml(inv.title || '')}</span>
                    </div>
                    <div class="amount-col">${formatRand(inv.total)}</div>
                    <span class="status-badge status-${escapeHtml(disp)}">${escapeHtml(INVOICE_DISPLAY_LABELS[disp] || disp)}</span>
                `;
                row.addEventListener('click', () => openInvoicePreview(inv));
                row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openInvoicePreview(inv); });
                list.appendChild(row);
            });
    }

    function openInvoicePreview(invoice) {
        const paid = computePortalInvoicePaid(invoice);
        const total = Math.max(0, Number(invoice.total) || 0);
        const outstanding = total - paid;
        const disp = portalInvoiceStatus(invoice, paid);

        const badge = document.getElementById('ipStatusBadge');
        badge.textContent = INVOICE_DISPLAY_LABELS[disp] || disp;
        badge.className = 'status-badge status-' + disp;

        document.getElementById('ipTypeLabel').textContent = (invoice.invoiceType ? invoice.invoiceType.charAt(0).toUpperCase() + invoice.invoiceType.slice(1) : 'Standard') + ' Invoice';
        document.getElementById('ipInvoiceNumber').textContent = invoice.invoiceNumber || '';
        document.getElementById('ipIssueDate').textContent = invoice.issueDate ? formatDateOnly(invoice.issueDate) : '—';
        document.getElementById('ipDueDate').textContent = invoice.dueDate ? formatDateOnly(invoice.dueDate) : '—';
        document.getElementById('ipTitle').textContent = invoice.title || '';
        document.getElementById('ipDescription').textContent = invoice.description || '';

        const tbody = document.getElementById('ipItemsBody');
        tbody.innerHTML = '';
        (invoice.items || []).forEach(item => {
            const tr = document.createElement('tr');
            const tdDesc = document.createElement('td'); tdDesc.textContent = item.description;
            const tdQty = document.createElement('td'); tdQty.textContent = item.quantity;
            const tdPrice = document.createElement('td'); tdPrice.textContent = formatRand(item.unitPrice);
            const tdTotal = document.createElement('td'); tdTotal.textContent = formatRand(item.lineTotal);
            tr.append(tdDesc, tdQty, tdPrice, tdTotal);
            tbody.appendChild(tr);
        });

        document.getElementById('ipSubtotal').textContent = formatRand(invoice.subtotal);
        const discountRow = document.getElementById('ipDiscountRow');
        if (invoice.discountAmount > 0) {
            discountRow.style.display = 'flex';
            discountRow.querySelector('span').textContent = invoice.discountType === 'percent' ? `Discount (${invoice.discountValue}%)` : 'Discount';
            document.getElementById('ipDiscount').textContent = '-' + formatRand(invoice.discountAmount);
        } else {
            discountRow.style.display = 'none';
        }
        document.getElementById('ipTotal').textContent = formatRand(total);
        document.getElementById('ipPaid').textContent = formatRand(paid);
        const outLabel = document.getElementById('ipOutstandingLabel');
        const outEl = document.getElementById('ipOutstanding');
        if (outstanding < -0.001) { outLabel.textContent = 'Overpaid'; outEl.textContent = formatRand(Math.abs(outstanding)); }
        else { outLabel.textContent = 'Outstanding'; outEl.textContent = formatRand(outstanding); }

        const piSection = document.getElementById('ipPaymentInstructionsSection');
        if (invoice.paymentInstructions) { piSection.style.display = 'block'; document.getElementById('ipPaymentInstructions').textContent = invoice.paymentInstructions; }
        else piSection.style.display = 'none';

        document.getElementById('invoicePreviewOverlay').classList.add('active');
    }
    document.getElementById('invoicePreviewClose').addEventListener('click', () => document.getElementById('invoicePreviewOverlay').classList.remove('active'));
    document.getElementById('invoicePreviewOverlay').addEventListener('click', (e) => { if (e.target.id === 'invoicePreviewOverlay') document.getElementById('invoicePreviewOverlay').classList.remove('active'); });
    document.getElementById('ipPrintBtn').addEventListener('click', () => window.print());
}
