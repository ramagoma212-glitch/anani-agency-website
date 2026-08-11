/* ============================================================
   RM Digitals — Admin panel logic
   ============================================================
   Covers: Firebase Auth login/session, admins/{uid} role gate,
   Reviews moderation, Projects CRUD, Leads CRM.

   Split out of admin.html into its own file once the Leads CRM
   made the inline script unwieldy — see Milestone 11.
   ============================================================ */

import { isFirebaseConfigured } from './firebase-config.js';

if (!isFirebaseConfigured()) {
    document.getElementById('configWarning').style.display = 'block';
} else {
    runAdmin();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function isSafeHttpUrl(url) {
    if (!url) return true; // empty is allowed (optional field)
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function formatDateOnly(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* Always clamps to a finite, non-negative number before formatting — this
   is what stops NaN or negative totals ever reaching the screen (Part G/J
   of the quotes milestone). */
function formatRand(n) {
    const num = Number(n);
    const safe = Number.isFinite(num) ? Math.max(0, num) : 0;
    return 'R' + safe.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABELS = {
    new: 'New', contacted: 'Contacted', quote_sent: 'Quote Sent', won: 'Won', lost: 'Lost'
};
const SOURCE_LABELS = {
    manual: 'Manual', website_email: 'Website / Email', whatsapp: 'WhatsApp', referral: 'Referral', other: 'Other'
};

/* ── Quotes (Milestone 17) ──────────────────────────────────────── */
const QUOTE_STATUS_LABELS = {
    draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired'
};

/* Quick Add reference prices — these mirror the CURRENT public pricing
   exactly (pricing.html), but are only a starting point for the line
   item: the administrator can freely edit description/price/quantity
   or remove the row entirely. Nothing here forces the final quote. */
const QUICK_ADD_SERVICES = [
    { label: 'Landing Page', price: 2500 },
    { label: 'Starter Business Website', price: 4500 },
    { label: 'Professional Business Website', price: 6500 },
    { label: 'Business Growth Website', price: 8500 },
    { label: 'Ecommerce Website', price: 12500 },
    { label: 'Custom Web System / Portal', price: 18000 },
    { label: 'SEO Health Check', price: 750 },
    { label: 'Website Care (maintenance, per month)', price: 499 },
    { label: 'Business Care (maintenance, per month)', price: 899 },
    { label: 'Priority Care (maintenance, per month)', price: 1499 },
    { label: 'Additional webpage', price: 750 },
    { label: 'SEO copywriting (per page)', price: 600 },
    { label: 'Google Business Profile setup', price: 1500 },
    { label: 'Google Search Console setup', price: 750 },
    { label: 'Google Analytics setup', price: 750 },
    { label: 'Basic WhatsApp click-to-chat integration', price: 350 },
    { label: 'Advanced WhatsApp automation', price: 2500 },
    { label: 'AI website chatbot setup', price: 2500 },
    { label: 'Booking system', price: 2000 },
    { label: 'Newsletter integration', price: 1500 },
    { label: 'Payment gateway integration', price: 2500 },
    { label: 'Blog setup', price: 1500 },
    { label: 'Additional revision round', price: 500 }
];

/* ── Clients & Client Projects (Milestone 18) ────────────────────── */
const CLIENT_STATUS_LABELS = { active: 'Active', past: 'Past Client', archived: 'Archived' };
const STAGE_LABELS = {
    awaiting_content: 'Awaiting Content', planning: 'Planning', design: 'Design',
    development: 'Development', client_review: 'Client Review', revisions: 'Revisions',
    ready_to_launch: 'Ready to Launch', completed: 'Completed', on_hold: 'On Hold', cancelled: 'Cancelled'
};
const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const ACTIVE_STAGES = ['awaiting_content', 'planning', 'design', 'development', 'client_review', 'revisions', 'ready_to_launch', 'on_hold'];
const STARTER_CHECKLIST_ITEMS = [
    'Business/company information', 'Logo', 'Services or product information',
    'Website text/copy', 'Images', 'Contact details', 'Social media links'
];
/* Optional nudge only — never applied without the admin confirming
   (Part G: "never overwrite admin choice without confirmation"). */
const STAGE_SUGGESTED_PROGRESS = {
    awaiting_content: 5, planning: 15, design: 30, development: 55,
    client_review: 75, revisions: 85, ready_to_launch: 95, completed: 100
};

function clampProgress(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

/* South African-friendly normalisation for WhatsApp/duplicate-matching:
   a leading 0 becomes 27 (075 123 4567 -> 27751234567); anything already
   starting with a country code (or otherwise) is left as-is. Returns null
   when there aren't enough digits to be a real number. */
function normalizePhoneForWa(phone) {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '27' + digits.slice(1);
    if (digits.length < 8) return null;
    return digits;
}

function isOverdue(project) {
    if (!project || !project.targetDate) return false;
    if (project.stage === 'completed' || project.stage === 'cancelled') return false;
    const target = project.targetDate.toDate ? project.targetDate.toDate() : new Date(project.targetDate);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    return target.getTime() < startOfToday.getTime();
}
function isDueSoon(project) {
    if (!project || !project.targetDate) return false;
    if (project.stage === 'completed' || project.stage === 'cancelled') return false;
    if (isOverdue(project)) return false;
    const target = project.targetDate.toDate ? project.targetDate.toDate() : new Date(project.targetDate);
    return target.getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

const DEFAULT_QUOTE_TERMS =
`This quote is valid until the date shown above.
Work begins once the agreed deposit/payment arrangement is confirmed.
Final delivery depends on receiving required content and information from the client.
Changes outside the agreed scope may require an updated quote.
Third-party costs such as domains, premium software, paid plugins or external services are excluded unless specifically listed.
Final ownership/handover occurs according to the agreed payment arrangement.`;

/* ── Project Completion, Portfolio & Review Workflow (Milestone 19) ── */
const COMPLETION_STARTER_ITEMS = [
    'Final functionality testing', 'Mobile / responsive testing', 'Forms and contact actions tested',
    'Client review completed', 'Final revisions completed', 'Client approval received',
    'Domain / hosting / launch completed', 'Website launched', 'Client handover completed',
    'Final payment status reviewed'
];
const PORTFOLIO_PERMISSION_LABELS = { not_asked: 'Not Asked', granted: 'Granted', declined: 'Declined' };
const REVIEW_REQUEST_LABELS = {
    not_requested: 'Not Requested', requested: 'Requested', submitted: 'Submitted / Pending Approval',
    approved: 'Approved', declined: 'Submitted / Not Approved'
};
/* Current live production URL (custom domain intentionally deferred —
   see Milestones 15/16). Update this constant, nowhere else, if/when
   the site moves to rmdigitals.co.za. */
const PUBLIC_SITE_URL = 'https://ramagoma212-glitch.github.io/anani-agency-website/';
function reviewRequestUrl() { return PUBLIC_SITE_URL + '?review=1#testimonials'; }
function reviewRequestMessage(name) {
    return `Hi ${name || ''}, thank you for trusting RM Digitals with your website project. We'd appreciate hearing about your experience — your feedback helps us improve and helps other businesses understand what it's like to work with us. You can share it here: ${reviewRequestUrl()}`;
}

/* ── Invoices & Receipts (Milestone 20) ──────────────────────────── */
const INVOICE_DISPLAY_LABELS = {
    draft: 'Draft', sent: 'Sent', part_paid: 'Part Paid', paid: 'Paid',
    overdue: 'Overdue', cancelled: 'Cancelled', overpaid: 'Overpaid'
};

async function runAdmin() {
    const { firebaseConfig } = await import('./firebase-config.js');
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    const fsMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    let storageMod = null;

    const app = initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);

    const loginPanel = document.getElementById('loginPanel');
    const appPanel = document.getElementById('appPanel');
    const loginMsg = document.getElementById('loginMsg');

    /* A signed-in Firebase user is NOT enough — they must also
       have a document at admins/{uid}. This is a UX convenience
       only; the real security boundary is firestore.rules. No
       data query of any kind (reviews/projects/leads) runs before
       this check succeeds. */
    async function checkAdminAndEnter(user) {
        let adminDoc;
        try {
            adminDoc = await fsMod.getDoc(fsMod.doc(db, 'admins', user.uid));
        } catch (err) {
            adminDoc = { exists: () => false };
        }

        if (!adminDoc.exists()) {
            await authMod.signOut(auth);
            loginMsg.textContent = 'This account is not authorised as admin.';
            loginMsg.className = 'error';
            loginPanel.style.display = 'block';
            appPanel.style.display = 'none';
            return;
        }

        loginPanel.style.display = 'none';
        appPanel.style.display = 'block';
        document.getElementById('whoEmail').textContent = user.email;
        loadReviews('pending');
        loadProjects();
        loadLeads();
        loadQuotes();
        loadClients();
        // Invoices depend on allClientProjects (to compute live paid/outstanding
        // totals from each project's payments), so they load only once client
        // projects are in — everything else above loads independently/in parallel.
        loadClientProjects().then(() => { loadInvoices(); loadReceipts(); });
    }

    authMod.onAuthStateChanged(auth, (user) => {
        if (user) {
            checkAdminAndEnter(user);
        } else {
            loginPanel.style.display = 'block';
            appPanel.style.display = 'none';
        }
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        loginMsg.textContent = '';
        loginMsg.className = 'info';
        if (!email || !password) {
            loginMsg.textContent = 'Please enter your email and password.';
            loginMsg.className = 'error';
            return;
        }
        try {
            await authMod.signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            loginMsg.textContent = 'Login failed — check email and password.';
            loginMsg.className = 'error';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => authMod.signOut(auth));

    /* Global Escape-key close for every modal overlay (Milestone 24
       accessibility audit) — every admin modal shares the
       .lead-modal-overlay class, so one listener covers all of them
       without touching any individual modal's open/close logic. */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.lead-modal-overlay.active').forEach(overlay => overlay.classList.remove('active'));
    });

    /* ============================================================
       REVIEWS (pending / approved / rejected tabs)
       ============================================================ */
    let currentTab = 'pending';
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            currentTab = btn.dataset.status;
            loadReviews(currentTab);
        });
    });

    async function loadReviews(status) {
        const list = document.getElementById('reviewList');
        list.innerHTML = '<p class="empty-note">Loading…</p>';

        let snap;
        try {
            const q = fsMod.query(
                fsMod.collection(db, 'reviews'),
                fsMod.where('status', '==', status),
                fsMod.orderBy('createdAt', 'desc')
            );
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load reviews: ${escapeHtml(err.message)}</p>`;
            return;
        }
        if (snap.empty) {
            list.innerHTML = `<p class="empty-note">No ${escapeHtml(status)} reviews.</p>`;
            return;
        }

        list.innerHTML = '';
        snap.forEach(docSnap => {
            const r = docSnap.data();
            const stars = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
            const item = document.createElement('div');
            item.className = 'pending-item';
            item.innerHTML = `
                <div class="stars">${stars}</div>
                <div><strong>${escapeHtml(r.name)}</strong> ${r.company ? '· ' + escapeHtml(r.company) : ''} ${r.featured ? '<span class="badge on-featured" style="font-size:.68rem;padding:2px 8px;border-radius:100px;border:1px solid rgba(255,214,10,.3);color:var(--gold);">Featured</span>' : ''}</div>
                <div class="meta">${escapeHtml(r.projectName || '')}</div>
                <p>${escapeHtml(r.message)}</p>
                <div class="pending-actions">
                    ${status !== 'approved' ? `<button class="btn-approve" data-act="approve">Approve</button>` : ''}
                    ${status !== 'rejected' ? `<button class="btn-reject" data-act="reject">Reject</button>` : ''}
                    ${status === 'approved' ? `<button class="btn-feature" data-act="toggle-feature" data-value="${!r.featured}">${r.featured ? 'Unfeature' : 'Feature'}</button>` : ''}
                    <button class="btn-del-review" data-act="delete">Delete</button>
                </div>
            `;
            list.appendChild(item);

            const approveBtn = item.querySelector('[data-act="approve"]');
            if (approveBtn) approveBtn.addEventListener('click', async () => {
                approveBtn.disabled = true;
                await fsMod.updateDoc(fsMod.doc(db, 'reviews', docSnap.id), { status: 'approved', approvedAt: fsMod.serverTimestamp() });
                loadReviews(currentTab);
            });
            const rejectBtn = item.querySelector('[data-act="reject"]');
            if (rejectBtn) rejectBtn.addEventListener('click', async () => {
                rejectBtn.disabled = true;
                await fsMod.updateDoc(fsMod.doc(db, 'reviews', docSnap.id), { status: 'rejected' });
                loadReviews(currentTab);
            });
            const featureBtn = item.querySelector('[data-act="toggle-feature"]');
            if (featureBtn) featureBtn.addEventListener('click', async () => {
                await fsMod.updateDoc(fsMod.doc(db, 'reviews', docSnap.id), { featured: featureBtn.dataset.value === 'true' });
                loadReviews(currentTab);
            });
            const delBtn = item.querySelector('[data-act="delete"]');
            delBtn.addEventListener('click', async () => {
                if (!confirm('Delete this review permanently?')) return;
                await fsMod.deleteDoc(fsMod.doc(db, 'reviews', docSnap.id));
                loadReviews(currentTab);
            });
        });
    }

    /* ============================================================
       PROJECTS (add / edit / publish / feature / delete)
       ============================================================ */
    const form = document.getElementById('projectForm');
    const formTitle = document.getElementById('projectFormTitle');
    const submitBtn = document.getElementById('projectSubmitBtn');
    const cancelEditBtn = document.getElementById('projectCancelEditBtn');
    let allProjects = []; // cached after each loadProjects() — used by the Milestone 19 portfolio-status check
    let pendingPortfolioSourceProjectId = null; // set by "Prepare Portfolio Draft" (Milestone 19), consumed on next new-project save

    function resetForm() {
        form.reset();
        document.getElementById('pId').value = '';
        formTitle.textContent = 'Add a Project';
        submitBtn.textContent = 'Add Project';
        cancelEditBtn.style.display = 'none';
    }
    cancelEditBtn.addEventListener('click', resetForm);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('projectFormMsg');
        submitBtn.disabled = true;

        const liveUrl = document.getElementById('pLiveUrl').value.trim();
        const caseStudyUrl = document.getElementById('pCaseStudyUrl').value.trim();
        if (!isSafeHttpUrl(liveUrl) || !isSafeHttpUrl(caseStudyUrl)) {
            msg.textContent = '⚠️ URLs must start with http:// or https://';
            msg.className = 'form-msg error';
            submitBtn.disabled = false;
            return;
        }

        const slug = document.getElementById('pSlug').value.trim().toLowerCase();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
            msg.textContent = '⚠️ Slug must be lowercase letters, numbers and hyphens only.';
            msg.className = 'form-msg error';
            submitBtn.disabled = false;
            return;
        }

        const editingId = document.getElementById('pId').value;

        try {
            // Application-enforced slug uniqueness: query before saving.
            const dupeQuery = fsMod.query(fsMod.collection(db, 'projects'), fsMod.where('slug', '==', slug));
            const dupeSnap = await fsMod.getDocs(dupeQuery);
            const dupeConflict = dupeSnap.docs.some(d => d.id !== editingId);
            if (dupeConflict) {
                throw new Error('That slug is already used by another project — choose a different one.');
            }

            const docRef = editingId
                ? fsMod.doc(db, 'projects', editingId)
                : fsMod.doc(fsMod.collection(db, 'projects'));

            let imageUrl, imagePath;
            const file = document.getElementById('pImage').files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5MB.');
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Image must be JPG, PNG or WebP.');
                if (!storageMod) storageMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js');
                const storage = storageMod.getStorage(app);
                // imagePath is the raw Storage path (needed later to delete
                // the file); imageUrl is the public download URL (a signed
                // https link with a token — NOT usable with ref() directly).
                imagePath = `projects/${docRef.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const storageRef = storageMod.ref(storage, imagePath);
                await storageMod.uploadBytes(storageRef, file);
                imageUrl = await storageMod.getDownloadURL(storageRef);
            }

            const services = document.getElementById('pServices').value
                .split(',').map(s => s.trim()).filter(Boolean);

            const record = {
                slug,
                businessName: document.getElementById('pBusiness').value.trim(),
                category: document.getElementById('pCategory').value,
                description: document.getElementById('pDescription').value.trim(),
                services,
                liveUrl: liveUrl || null,
                caseStudyUrl: caseStudyUrl || null,
                published: document.getElementById('pPublished').checked,
                featured: document.getElementById('pFeatured').checked,
                sortOrder: Number(document.getElementById('pSortOrder').value) || 0,
                updatedAt: fsMod.serverTimestamp()
            };
            if (imageUrl) { record.imageUrl = imageUrl; record.imagePath = imagePath; }

            if (editingId) {
                await fsMod.updateDoc(docRef, record);
            } else {
                record.createdAt = fsMod.serverTimestamp();
                await fsMod.setDoc(docRef, record);

                // Milestone 19: if this new portfolio project was created via
                // "Prepare Portfolio Draft" from a Client Project, link them —
                // private -> public relationship only, the public `projects`
                // document itself gains no new fields.
                if (pendingPortfolioSourceProjectId) {
                    try {
                        await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', pendingPortfolioSourceProjectId), {
                            portfolioProjectId: docRef.id,
                            portfolioPreparedAt: fsMod.serverTimestamp(),
                            updatedAt: fsMod.serverTimestamp()
                        });
                    } catch (linkErr) {
                        console.warn('Portfolio draft saved, but could not link back to the client project:', linkErr.message);
                    }
                    pendingPortfolioSourceProjectId = null;
                    if (typeof loadClientProjects === 'function') loadClientProjects();
                }
            }

            resetForm();
            msg.textContent = '✅ Saved.';
            msg.className = 'form-msg success';
            loadProjects();
        } catch (err) {
            console.error(err);
            msg.textContent = '❌ Could not save project: ' + err.message;
            msg.className = 'form-msg error';
        } finally {
            submitBtn.disabled = false;
        }
    });

    async function loadProjects() {
        const list = document.getElementById('projectList');
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'projects'), fsMod.orderBy('sortOrder', 'asc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load projects: ${escapeHtml(err.message)}</p>`;
            return;
        }
        allProjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (snap.empty) {
            list.innerHTML = '<p class="empty-note">No projects added yet.</p>';
            return;
        }

        list.innerHTML = '';
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const row = document.createElement('div');
            row.className = 'project-row';
            row.innerHTML = `
                <img src="${p.imageUrl ? escapeHtml(p.imageUrl) : 'images/mylog.webp'}" alt="" />
                <div class="info">
                    <strong>${escapeHtml(p.businessName)}</strong>
                    <span>${escapeHtml(p.category)} · ${escapeHtml((p.services || []).join(', '))}</span>
                    <div class="badges">
                        <span class="badge ${p.published ? 'on-published' : ''}">${p.published ? 'Published' : 'Draft'}</span>
                        ${p.featured ? '<span class="badge on-featured">Featured</span>' : ''}
                    </div>
                </div>
                <div class="row-actions">
                    <button data-act="toggle-published" data-value="${!p.published}">${p.published ? 'Unpublish' : 'Publish'}</button>
                    <button data-act="toggle-featured" data-value="${!p.featured}">${p.featured ? 'Unfeature' : 'Feature'}</button>
                    <button data-act="edit">Edit</button>
                    <button data-act="delete" class="btn-delete">Delete</button>
                </div>
            `;
            list.appendChild(row);

            row.querySelector('[data-act="toggle-published"]').addEventListener('click', async (ev) => {
                await fsMod.updateDoc(fsMod.doc(db, 'projects', docSnap.id), { published: ev.currentTarget.dataset.value === 'true', updatedAt: fsMod.serverTimestamp() });
                loadProjects();
            });
            row.querySelector('[data-act="toggle-featured"]').addEventListener('click', async (ev) => {
                await fsMod.updateDoc(fsMod.doc(db, 'projects', docSnap.id), { featured: ev.currentTarget.dataset.value === 'true', updatedAt: fsMod.serverTimestamp() });
                loadProjects();
            });
            row.querySelector('[data-act="edit"]').addEventListener('click', () => {
                document.getElementById('pId').value = docSnap.id;
                document.getElementById('pBusiness').value = p.businessName || '';
                document.getElementById('pSlug').value = p.slug || '';
                document.getElementById('pCategory').value = p.category || 'Business Website';
                document.getElementById('pSortOrder').value = p.sortOrder ?? 0;
                document.getElementById('pDescription').value = p.description || '';
                document.getElementById('pServices').value = (p.services || []).join(', ');
                document.getElementById('pLiveUrl').value = p.liveUrl || '';
                document.getElementById('pCaseStudyUrl').value = p.caseStudyUrl || '';
                document.getElementById('pPublished').checked = !!p.published;
                document.getElementById('pFeatured').checked = !!p.featured;
                formTitle.textContent = 'Edit Project';
                submitBtn.textContent = 'Save Changes';
                cancelEditBtn.style.display = 'block';
                form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
                if (!confirm('Delete this project from the live site?')) return;
                try {
                    await fsMod.deleteDoc(fsMod.doc(db, 'projects', docSnap.id));
                    if (p.imagePath) {
                        try {
                            if (!storageMod) storageMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js');
                            const storage = storageMod.getStorage(app);
                            await storageMod.deleteObject(storageMod.ref(storage, p.imagePath));
                        } catch (imgErr) {
                            console.warn('Project deleted, but its image could not be removed from Storage:', imgErr.message);
                        }
                    }
                } catch (err) {
                    alert('Could not delete: ' + err.message);
                    return;
                }
                loadProjects();
            });
        });
    }

    /* ============================================================
       LEADS CRM
       ============================================================
       Design notes:
       - Admin is authorised to read ALL leads (RLS-equivalent rule:
         firestore.rules `match /leads/{leadId} { allow read, write:
         if isAdmin(); }` — unchanged from Milestone 9/10).
       - Fetched once per load via getDocs, ordered by createdAt desc
         (a single-field order — no composite index needed). Status
         filtering, search and re-sorting all happen client-side in
         memory, since the admin-only dataset is small and this
         avoids needing new Firestore indexes entirely (see
         firestore.indexes.json — unchanged this milestone).
       - Deliberately NOT using onSnapshot: this is a single-admin
         tool with no concurrent-editor scenario to react to in real
         time: a plain reload-after-mutation model (matching the
         existing Projects/Reviews sections) is simpler and avoids
         an unnecessary live listener running for the entire admin
         session.
       - The public website NEVER queries `leads` — this file is
         only loaded by admin.html, never by index.html or any
         other public page.
       ============================================================ */

    let allLeads = [];

    async function loadLeads() {
        const list = document.getElementById('leadList');
        list.innerHTML = '<p class="empty-note">Loading leads…</p>';

        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'leads'), fsMod.orderBy('createdAt', 'desc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load leads: ${escapeHtml(err.message)}</p>`;
            return;
        }

        allLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLeadSummary();
        renderLeadList();
        refreshDashboard();
    }

    function renderLeadSummary() {
        const counts = { new: 0, contacted: 0, quote_sent: 0, won: 0, lost: 0 };
        allLeads.forEach(l => { if (counts.hasOwnProperty(l.status)) counts[l.status]++; });
        document.getElementById('lsTotal').textContent = allLeads.length;
        document.getElementById('lsNew').textContent = counts.new;
        document.getElementById('lsContacted').textContent = counts.contacted;
        document.getElementById('lsQuoteSent').textContent = counts.quote_sent;
        document.getElementById('lsWon').textContent = counts.won;
        document.getElementById('lsLost').textContent = counts.lost;
    }

    function renderLeadList() {
        const list = document.getElementById('leadList');
        const searchTerm = (document.getElementById('leadSearch').value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('leadFilterStatus').value;
        const sortMode = document.getElementById('leadSort').value;

        let filtered = allLeads.filter(l => {
            if (statusFilter !== 'all' && l.status !== statusFilter) return false;
            if (!searchTerm) return true;
            const haystack = [l.name, l.email, l.phone, l.serviceInterest, l.subject]
                .filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });

        if (sortMode === 'oldest') {
            filtered = filtered.slice().reverse();
        } else if (sortMode === 'status') {
            const order = ['new', 'contacted', 'quote_sent', 'won', 'lost'];
            filtered = filtered.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
        }
        // 'newest' is the default fetch order already.

        if (allLeads.length === 0) {
            list.innerHTML = '<p class="empty-note">No leads yet. New enquiries can be added manually for now — automatic website lead capture will be added after the secure submission workflow is built.</p>';
            return;
        }
        if (filtered.length === 0) {
            list.innerHTML = '<p class="empty-note">No leads match your search/filter.</p>';
            return;
        }

        list.innerHTML = '';
        filtered.forEach(lead => {
            const row = document.createElement('div');
            row.className = 'lead-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(lead.name)}</strong>
                    <span>${escapeHtml(lead.serviceInterest || 'No service specified')}${lead.packageInterest ? ' · ' + escapeHtml(lead.packageInterest) : ''}</span>
                </div>
                <div class="meta-col">${escapeHtml(lead.budget || '—')}</div>
                <div class="meta-col">${formatDate(lead.createdAt)}</div>
                <span class="status-badge status-${escapeHtml(lead.status)}">${escapeHtml(STATUS_LABELS[lead.status] || lead.status)}</span>
            `;
            row.addEventListener('click', () => openLeadDetail(lead.id));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openLeadDetail(lead.id); });
            list.appendChild(row);
        });
    }

    document.getElementById('leadSearch').addEventListener('input', renderLeadList);
    document.getElementById('leadFilterStatus').addEventListener('change', renderLeadList);
    document.getElementById('leadSort').addEventListener('change', renderLeadList);

    /* ── Manual "Add Lead" form ── */
    const leadForm = document.getElementById('leadForm');
    const leadAddToggleBtn = document.getElementById('leadAddToggleBtn');
    const leadCancelBtn = document.getElementById('leadCancelBtn');

    leadAddToggleBtn.addEventListener('click', () => {
        leadForm.style.display = leadForm.style.display === 'none' ? 'block' : 'none';
    });
    leadCancelBtn.addEventListener('click', () => {
        leadForm.reset();
        leadForm.style.display = 'none';
    });

    leadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('leadFormMsg');
        const name = document.getElementById('lName').value.trim();
        const email = document.getElementById('lEmail').value.trim();
        const phone = document.getElementById('lPhone').value.trim();

        if (!name) {
            msg.textContent = '⚠️ Name is required.';
            msg.className = 'form-msg error';
            return;
        }
        if (!email && !phone) {
            msg.textContent = '⚠️ Provide at least an email or a phone number.';
            msg.className = 'form-msg error';
            return;
        }
        if (email && !isValidEmail(email)) {
            msg.textContent = '⚠️ That email address doesn\'t look valid.';
            msg.className = 'form-msg error';
            return;
        }

        try {
            await fsMod.addDoc(fsMod.collection(db, 'leads'), {
                name,
                email: email || null,
                phone: phone || null,
                serviceInterest: document.getElementById('lService').value || null,
                packageInterest: document.getElementById('lPackage').value || null,
                budget: document.getElementById('lBudget').value.trim() || null,
                subject: document.getElementById('lSubject').value.trim() || null,
                message: document.getElementById('lMessage').value.trim() || '',
                source: document.getElementById('lSource').value,
                status: 'new',
                notes: '',
                createdAt: fsMod.serverTimestamp(),
                updatedAt: fsMod.serverTimestamp()
            });
            leadForm.reset();
            leadForm.style.display = 'none';
            msg.textContent = '';
            loadLeads();
        } catch (err) {
            console.error(err);
            msg.textContent = '❌ Could not add lead: ' + err.message;
            msg.className = 'form-msg error';
        }
    });

    /* ── Lead detail modal ── */
    const leadModalOverlay = document.getElementById('leadModalOverlay');
    let activeLeadId = null;

    function closeLeadModal() {
        leadModalOverlay.classList.remove('active');
        activeLeadId = null;
    }
    document.getElementById('leadModalClose').addEventListener('click', closeLeadModal);
    leadModalOverlay.addEventListener('click', (e) => { if (e.target === leadModalOverlay) closeLeadModal(); });

    function safeMailto(email, subject) {
        if (!email || !isValidEmail(email)) return null;
        return `mailto:${encodeURIComponent(email)}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
    }
    function safeTel(phone) {
        if (!phone) return null;
        const digits = phone.replace(/[^\d+]/g, '');
        if (digits.length < 7) return null;
        return `tel:${digits}`;
    }
    function safeWhatsapp(phone, name) {
        if (!phone) return null;
        const digits = phone.replace(/[^\d]/g, '');
        if (digits.length < 8) return null;
        const greeting = `Hi ${name || ''}, this is RM Digitals following up on your website enquiry.`.trim();
        return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
    }

    function openLeadDetail(id) {
        const lead = allLeads.find(l => l.id === id);
        if (!lead) return;
        activeLeadId = id;

        document.getElementById('lmName').textContent = lead.name || '(no name)';
        const badge = document.getElementById('lmStatusBadge');
        badge.textContent = STATUS_LABELS[lead.status] || lead.status;
        badge.className = 'status-badge status-' + lead.status;
        document.getElementById('lmStatusSelect').value = lead.status;

        document.getElementById('lmEmail').textContent = lead.email || '—';
        document.getElementById('lmPhone').textContent = lead.phone || '—';
        document.getElementById('lmService').textContent = lead.serviceInterest || '—';
        document.getElementById('lmPackage').textContent = lead.packageInterest || '—';
        document.getElementById('lmBudget').textContent = lead.budget || '—';
        document.getElementById('lmSource').textContent = SOURCE_LABELS[lead.source] || lead.source || '—';
        document.getElementById('lmCreated').textContent = formatDate(lead.createdAt);
        document.getElementById('lmUpdated').textContent = formatDate(lead.updatedAt);
        document.getElementById('lmSubject').textContent = lead.subject || '—';
        document.getElementById('lmMessage').textContent = lead.message || '—';
        document.getElementById('lmNotes').value = lead.notes || '';

        const actions = document.getElementById('lmContactActions');
        actions.innerHTML = '';
        const mailtoUrl = safeMailto(lead.email, `Re: Your RM Digitals enquiry`);
        if (mailtoUrl) {
            const a = document.createElement('a');
            a.href = mailtoUrl;
            a.innerHTML = '<i class="fas fa-envelope"></i> Email';
            actions.appendChild(a);
        }
        const telUrl = safeTel(lead.phone);
        if (telUrl) {
            const a = document.createElement('a');
            a.href = telUrl;
            a.innerHTML = '<i class="fas fa-phone"></i> Call';
            actions.appendChild(a);
        }
        const waUrl = safeWhatsapp(lead.phone, lead.name);
        if (waUrl) {
            const a = document.createElement('a');
            a.href = waUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp';
            actions.appendChild(a);
        }
        if (lead.status !== 'quote_sent') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Mark Quote Sent';
            btn.addEventListener('click', () => updateLeadStatus('quote_sent'));
            actions.appendChild(btn);
        }

        document.getElementById('leadDetailMsg').textContent = '';
        document.getElementById('lmStartProjectWrap').style.display = lead.status === 'won' ? 'block' : 'none';
        leadModalOverlay.classList.add('active');
    }

    async function updateLeadStatus(newStatus) {
        if (!activeLeadId) return;
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'leads', activeLeadId), { status: newStatus, updatedAt: fsMod.serverTimestamp() });
            await loadLeads();
            openLeadDetail(activeLeadId);
        } catch (err) {
            document.getElementById('leadDetailMsg').textContent = '❌ Could not update status: ' + err.message;
            document.getElementById('leadDetailMsg').className = 'form-msg error';
        }
    }
    document.getElementById('lmStatusSelect').addEventListener('change', (e) => updateLeadStatus(e.target.value));

    document.getElementById('lmSaveNotesBtn').addEventListener('click', async () => {
        if (!activeLeadId) return;
        const notes = document.getElementById('lmNotes').value;
        if (notes.length > 4000) {
            document.getElementById('leadDetailMsg').textContent = '⚠️ Notes must be under 4000 characters.';
            document.getElementById('leadDetailMsg').className = 'form-msg error';
            return;
        }
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'leads', activeLeadId), { notes, updatedAt: fsMod.serverTimestamp() });
            document.getElementById('leadDetailMsg').textContent = '✅ Notes saved.';
            document.getElementById('leadDetailMsg').className = 'form-msg success';
            await loadLeads();
        } catch (err) {
            document.getElementById('leadDetailMsg').textContent = '❌ Could not save notes: ' + err.message;
            document.getElementById('leadDetailMsg').className = 'form-msg error';
        }
    });

    document.getElementById('lmDeleteBtn').addEventListener('click', async () => {
        if (!activeLeadId) return;
        if (!confirm('Delete this lead permanently? This cannot be undone.')) return;
        try {
            await fsMod.deleteDoc(fsMod.doc(db, 'leads', activeLeadId));
            closeLeadModal();
            loadLeads();
        } catch (err) {
            alert('Could not delete lead: ' + err.message);
        }
    });

    document.getElementById('lmCreateQuoteBtn').addEventListener('click', () => {
        const lead = allLeads.find(l => l.id === activeLeadId);
        if (!lead) return;
        closeLeadModal();
        openQuoteBuilder({ lead });
    });

    /* ============================================================
       QUOTES (Milestone 17)
       ============================================================
       Design notes (mirrors the Leads CRM patterns above):
       - Admin-only, via firestore.rules `match /quotes/{quoteId}
         { allow read, write: if isAdmin(); }`.
       - Fetched once per load via getDocs, ordered by createdAt desc
         (single-field order — no composite index needed, same
         reasoning as Leads).
       - Client-side filter/search/sort, same as Leads — the admin-
         only dataset is small.
       - "Expired" is never a STORED status value — it's computed at
         render time from validUntil when the stored status is
         'sent', so the real status field (draft/sent/accepted/
         declined) is never silently overwritten by a date rollover.
       - All client/admin-entered text is rendered via escapeHtml()
         (template-string paths) or .textContent (quote preview) —
         never raw innerHTML of untrusted data. See openQuotePreview.
       ============================================================ */

    let allQuotes = [];
    let qbItems = [];        // line items while the builder is open
    let activeQuoteId = null; // quote currently shown in the preview

    function isQuoteExpired(quote) {
        if (quote.status !== 'sent' || !quote.validUntil) return false;
        const validDate = quote.validUntil.toDate ? quote.validUntil.toDate() : new Date(quote.validUntil);
        return validDate.getTime() < Date.now();
    }
    function displayQuoteStatus(quote) {
        return isQuoteExpired(quote) ? 'expired' : quote.status;
    }

    /* Readable quote number: RMQ-YYYY-MMDD-XXX. A 3-digit random
       suffix keeps it short and professional; a quick existence
       check (same pattern as the project-slug uniqueness check
       above) avoids obvious duplicates without needing a fully
       atomic global counter, which would be unnecessary complexity
       for this single-admin tool. */
    async function generateQuoteNumber() {
        const now = new Date();
        const year = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        for (let attempt = 0; attempt < 5; attempt++) {
            const suffix = String(Math.floor(Math.random() * 900) + 100);
            const candidate = `RMQ-${year}-${mm}${dd}-${suffix}`;
            const dupeQuery = fsMod.query(fsMod.collection(db, 'quotes'), fsMod.where('quoteNumber', '==', candidate));
            const dupeSnap = await fsMod.getDocs(dupeQuery);
            if (dupeSnap.empty) return candidate;
        }
        return `RMQ-${year}-${mm}${dd}-${Date.now().toString().slice(-4)}`;
    }

    function defaultValidUntil() {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().slice(0, 10);
    }
    function tsToDateInput(ts) {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toISOString().slice(0, 10);
    }

    async function loadQuotes() {
        const list = document.getElementById('quoteList');
        list.innerHTML = '<p class="empty-note">Loading quotes…</p>';
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'quotes'), fsMod.orderBy('createdAt', 'desc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load quotes: ${escapeHtml(err.message)}</p>`;
            return;
        }
        allQuotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderQuoteSummary();
        renderQuoteList();
        refreshDashboard();
    }

    function renderQuoteSummary() {
        const counts = { draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0 };
        let totalValue = 0, acceptedValue = 0;
        allQuotes.forEach(q => {
            const disp = displayQuoteStatus(q);
            if (counts.hasOwnProperty(disp)) counts[disp]++;
            totalValue += Number(q.total) || 0;
            if (q.status === 'accepted') acceptedValue += Number(q.total) || 0;
        });
        document.getElementById('qsDraft').textContent = counts.draft;
        document.getElementById('qsSent').textContent = counts.sent;
        document.getElementById('qsAccepted').textContent = counts.accepted;
        document.getElementById('qsDeclined').textContent = counts.declined;
        document.getElementById('qsExpired').textContent = counts.expired;
        document.getElementById('qsTotalValue').textContent = formatRand(totalValue);
        document.getElementById('qsAcceptedValue').textContent = formatRand(acceptedValue);
    }

    function renderQuoteList() {
        const list = document.getElementById('quoteList');
        const searchTerm = (document.getElementById('quoteSearch').value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('quoteFilterStatus').value;
        const sortMode = document.getElementById('quoteSort').value;

        let filtered = allQuotes.filter(q => {
            const disp = displayQuoteStatus(q);
            if (statusFilter !== 'all' && disp !== statusFilter) return false;
            if (!searchTerm) return true;
            const haystack = [q.quoteNumber, q.clientName, q.businessName, q.title].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });

        if (sortMode === 'oldest') {
            filtered = filtered.slice().reverse();
        } else if (sortMode === 'status') {
            const order = ['draft', 'sent', 'expired', 'accepted', 'declined'];
            filtered = filtered.slice().sort((a, b) => order.indexOf(displayQuoteStatus(a)) - order.indexOf(displayQuoteStatus(b)));
        } else if (sortMode === 'amount') {
            filtered = filtered.slice().sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
        }

        if (allQuotes.length === 0) {
            list.innerHTML = '<p class="empty-note">No quotes yet. Open a lead and click "Create Quote", or use "New Quote" above.</p>';
            return;
        }
        if (filtered.length === 0) {
            list.innerHTML = '<p class="empty-note">No quotes match your search/filter.</p>';
            return;
        }

        list.innerHTML = '';
        filtered.forEach(quote => {
            const disp = displayQuoteStatus(quote);
            const row = document.createElement('div');
            row.className = 'quote-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(quote.quoteNumber)}</strong>
                    <span>${escapeHtml(quote.clientName)}${quote.businessName ? ' · ' + escapeHtml(quote.businessName) : ''} — ${escapeHtml(quote.title)}</span>
                </div>
                <div class="meta-col">${formatDate(quote.createdAt)}</div>
                <div class="amount-col">${formatRand(quote.total)}</div>
                <span class="status-badge status-${escapeHtml(disp)}">${escapeHtml(QUOTE_STATUS_LABELS[disp] || disp)}</span>
            `;
            row.addEventListener('click', () => openQuotePreview(quote.id));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openQuotePreview(quote.id); });
            list.appendChild(row);
        });
    }

    document.getElementById('quoteSearch').addEventListener('input', renderQuoteList);
    document.getElementById('quoteFilterStatus').addEventListener('change', renderQuoteList);
    document.getElementById('quoteSort').addEventListener('change', renderQuoteList);
    document.getElementById('quoteNewBtn').addEventListener('click', () => openQuoteBuilder({}));

    /* ── Quote Builder ── */
    const qaSelect = document.getElementById('qbQuickAdd');
    QUICK_ADD_SERVICES.forEach((svc, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${svc.label} — ${formatRand(svc.price)}`;
        qaSelect.appendChild(opt);
    });

    function renderQbItems() {
        const list = document.getElementById('qbItemsList');
        const empty = document.getElementById('qbItemsEmpty');
        list.innerHTML = '';
        empty.style.display = qbItems.length ? 'none' : 'block';
        qbItems.forEach((item, idx) => {
            const qty = Math.max(0, Number(item.quantity) || 0);
            const price = Math.max(0, Number(item.unitPrice) || 0);
            const row = document.createElement('div');
            row.className = 'quote-item-row';
            row.innerHTML = `
                <input type="text" class="item-desc" value="${escapeHtml(item.description)}" maxlength="200" placeholder="Item description" />
                <input type="number" class="item-qty" min="0" step="1" value="${qty}" />
                <input type="number" class="item-price" min="0" step="0.01" value="${price}" />
                <span class="line-total">${formatRand(qty * price)}</span>
                <button type="button" class="remove-item" aria-label="Remove line item"><i class="fas fa-times"></i></button>
            `;
            row.querySelector('.item-desc').addEventListener('input', (e) => { qbItems[idx].description = e.target.value; });
            const recalcRow = () => {
                const q2 = Math.max(0, Number(qbItems[idx].quantity) || 0);
                const p2 = Math.max(0, Number(qbItems[idx].unitPrice) || 0);
                row.querySelector('.line-total').textContent = formatRand(q2 * p2);
                updateQbTotals();
            };
            row.querySelector('.item-qty').addEventListener('input', (e) => { qbItems[idx].quantity = e.target.value; recalcRow(); });
            row.querySelector('.item-price').addEventListener('input', (e) => { qbItems[idx].unitPrice = e.target.value; recalcRow(); });
            row.querySelector('.remove-item').addEventListener('click', () => { qbItems.splice(idx, 1); renderQbItems(); updateQbTotals(); });
            list.appendChild(row);
        });
    }

    function updateQbTotals() {
        const subtotal = qbItems.reduce((sum, it) => {
            const qty = Math.max(0, Number(it.quantity) || 0);
            const price = Math.max(0, Number(it.unitPrice) || 0);
            return sum + qty * price;
        }, 0);
        const discountType = document.getElementById('qbDiscountType').value;
        const discountValueRaw = Math.max(0, Number(document.getElementById('qbDiscountValue').value) || 0);
        let discountAmount = 0;
        if (discountType === 'percent') {
            discountAmount = subtotal * Math.min(100, discountValueRaw) / 100;
        } else if (discountType === 'fixed') {
            discountAmount = discountValueRaw;
        }
        discountAmount = Math.min(discountAmount, subtotal); // never push total negative
        const total = Math.max(0, subtotal - discountAmount);
        document.getElementById('qbSubtotalOut').textContent = formatRand(subtotal);
        document.getElementById('qbDiscountOut').textContent = formatRand(discountAmount);
        document.getElementById('qbTotalOut').textContent = formatRand(total);
        return { subtotal, discountAmount, total };
    }

    qaSelect.addEventListener('change', (e) => {
        const idx = Number(e.target.value);
        if (!Number.isNaN(idx) && QUICK_ADD_SERVICES[idx]) {
            const svc = QUICK_ADD_SERVICES[idx];
            qbItems.push({ description: svc.label, quantity: 1, unitPrice: svc.price });
            renderQbItems();
            updateQbTotals();
        }
        e.target.value = '';
    });
    document.getElementById('qbAddCustomItemBtn').addEventListener('click', () => {
        qbItems.push({ description: '', quantity: 1, unitPrice: 0 });
        renderQbItems();
        updateQbTotals();
    });
    document.getElementById('qbDiscountType').addEventListener('change', (e) => {
        const valueInput = document.getElementById('qbDiscountValue');
        valueInput.disabled = e.target.value === 'none';
        if (e.target.value === 'none') valueInput.value = 0;
        updateQbTotals();
    });
    document.getElementById('qbDiscountValue').addEventListener('input', updateQbTotals);
    document.getElementById('qbPaymentSelect').addEventListener('change', (e) => {
        if (e.target.value) document.getElementById('qbPaymentText').value = e.target.value;
    });

    function openQuoteBuilder({ lead = null, quote = null } = {}) {
        document.getElementById('qbFormMsg').textContent = '';
        document.getElementById('qbQuoteId').value = quote ? quote.id : '';
        document.getElementById('qbLeadId').value = quote ? (quote.leadId || '') : (lead ? lead.id : '');
        document.getElementById('qbQuoteNumber').value = quote ? quote.quoteNumber : '';
        document.getElementById('qbHeading').textContent = quote ? `Edit Quote ${quote.quoteNumber}` : 'New Quote';

        const budgetNote = document.getElementById('qbBudgetContext');
        if (!quote && lead && lead.budget) {
            document.getElementById('qbBudgetContextText').textContent = `Client indicated budget: ${lead.budget}`;
            budgetNote.style.display = 'flex';
        } else {
            budgetNote.style.display = 'none';
        }

        document.getElementById('qbClientName').value = quote ? (quote.clientName || '') : (lead ? (lead.name || '') : '');
        document.getElementById('qbBusinessName').value = quote ? (quote.businessName || '') : '';
        document.getElementById('qbClientEmail').value = quote ? (quote.clientEmail || '') : (lead ? (lead.email || '') : '');
        document.getElementById('qbClientPhone').value = quote ? (quote.clientPhone || '') : (lead ? (lead.phone || '') : '');
        document.getElementById('qbQuoteTitle').value = quote ? (quote.title || '') : (lead ? (lead.packageInterest || lead.serviceInterest || '') : '');
        document.getElementById('qbDescription').value = quote ? (quote.description || '') : (lead ? (lead.message || '') : '');
        qbItems = quote ? (quote.items || []).map(it => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })) : [];
        document.getElementById('qbDiscountType').value = quote ? (quote.discountType || 'none') : 'none';
        document.getElementById('qbDiscountValue').value = quote ? (quote.discountValue || 0) : 0;
        document.getElementById('qbDiscountValue').disabled = (quote ? (quote.discountType || 'none') : 'none') === 'none';
        document.getElementById('qbValidUntil').value = quote && quote.validUntil ? tsToDateInput(quote.validUntil) : defaultValidUntil();
        document.getElementById('qbPaymentSelect').value = '';
        document.getElementById('qbPaymentText').value = quote ? (quote.paymentArrangement || '') : '';
        document.getElementById('qbTerms').value = quote ? (quote.terms || DEFAULT_QUOTE_TERMS) : DEFAULT_QUOTE_TERMS;
        document.getElementById('qbNotes').value = quote ? (quote.notes || '') : '';

        renderQbItems();
        updateQbTotals();
        document.getElementById('quoteBuilderOverlay').classList.add('active');
    }

    async function saveQuoteFromBuilder({ andPreview = false } = {}) {
        const msg = document.getElementById('qbFormMsg');
        const clientName = document.getElementById('qbClientName').value.trim();
        const quoteTitle = document.getElementById('qbQuoteTitle').value.trim();
        const validUntilStr = document.getElementById('qbValidUntil').value;
        const email = document.getElementById('qbClientEmail').value.trim();

        if (!clientName) { msg.textContent = '⚠️ Client name is required.'; msg.className = 'form-msg error'; return null; }
        if (!quoteTitle) { msg.textContent = '⚠️ Quote title is required.'; msg.className = 'form-msg error'; return null; }
        if (!validUntilStr) { msg.textContent = '⚠️ Please set a valid-until date.'; msg.className = 'form-msg error'; return null; }
        if (email && !isValidEmail(email)) { msg.textContent = '⚠️ That client email doesn\'t look valid.'; msg.className = 'form-msg error'; return null; }

        const items = qbItems
            .map(it => ({
                description: (it.description || '').toString().trim(),
                quantity: Math.max(0, Number(it.quantity) || 0),
                unitPrice: Math.max(0, Number(it.unitPrice) || 0)
            }))
            .filter(it => it.description || it.quantity || it.unitPrice)
            .map(it => ({ ...it, lineTotal: it.quantity * it.unitPrice }));

        const { subtotal, discountAmount, total } = updateQbTotals();
        const discountType = document.getElementById('qbDiscountType').value;
        const discountValue = Math.max(0, Number(document.getElementById('qbDiscountValue').value) || 0);
        const editingId = document.getElementById('qbQuoteId').value;
        const leadId = document.getElementById('qbLeadId').value || null;

        const record = {
            leadId,
            clientName,
            clientEmail: email || null,
            clientPhone: document.getElementById('qbClientPhone').value.trim() || null,
            businessName: document.getElementById('qbBusinessName').value.trim() || null,
            title: quoteTitle,
            description: document.getElementById('qbDescription').value.trim(),
            items,
            subtotal,
            discountType,
            discountValue,
            discountAmount,
            total,
            validUntil: fsMod.Timestamp.fromDate(new Date(validUntilStr + 'T23:59:59')),
            paymentArrangement: document.getElementById('qbPaymentText').value.trim(),
            terms: document.getElementById('qbTerms').value,
            notes: document.getElementById('qbNotes').value,
            updatedAt: fsMod.serverTimestamp()
        };

        try {
            let quoteId = editingId;
            if (editingId) {
                // quoteNumber, status, createdAt and the sent/accepted/declined
                // timestamps are deliberately NOT in `record` — updateDoc only
                // touches the keys present, so editing a quote can never
                // silently overwrite its number or history (Part W).
                await fsMod.updateDoc(fsMod.doc(db, 'quotes', editingId), record);
            } else {
                record.quoteNumber = await generateQuoteNumber();
                record.status = 'draft';
                record.createdAt = fsMod.serverTimestamp();
                record.sentAt = null;
                record.acceptedAt = null;
                record.declinedAt = null;
                record.createdBy = auth.currentUser.uid;
                const docRef = fsMod.doc(fsMod.collection(db, 'quotes'));
                await fsMod.setDoc(docRef, record);
                quoteId = docRef.id;
            }
            msg.textContent = '✅ Quote saved.';
            msg.className = 'form-msg success';
            await loadQuotes();
            if (andPreview) {
                document.getElementById('quoteBuilderOverlay').classList.remove('active');
                openQuotePreview(quoteId);
            }
            return quoteId;
        } catch (err) {
            console.error(err);
            msg.textContent = '❌ Could not save quote: ' + err.message;
            msg.className = 'form-msg error';
            return null;
        }
    }

    document.getElementById('quoteBuilderClose').addEventListener('click', () => {
        document.getElementById('quoteBuilderOverlay').classList.remove('active');
    });
    document.getElementById('quoteBuilderOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'quoteBuilderOverlay') document.getElementById('quoteBuilderOverlay').classList.remove('active');
    });
    document.getElementById('qbSaveBtn').addEventListener('click', async () => {
        const id = await saveQuoteFromBuilder({ andPreview: false });
        if (id) document.getElementById('quoteBuilderOverlay').classList.remove('active');
    });
    document.getElementById('qbSaveAndPreviewBtn').addEventListener('click', () => saveQuoteFromBuilder({ andPreview: true }));

    /* ── Quote Preview / print / share / status / duplicate / delete ── */
    function openQuotePreview(id) {
        const quote = allQuotes.find(q => q.id === id);
        if (!quote) return;
        activeQuoteId = id;
        const disp = displayQuoteStatus(quote);

        const statusBadge = document.getElementById('qpStatusBadge');
        statusBadge.textContent = QUOTE_STATUS_LABELS[disp] || disp;
        statusBadge.className = 'status-badge status-' + disp;
        document.getElementById('qpStatusSelect').value = quote.status;

        // Everything below writes via textContent, never innerHTML, for any
        // client/admin-entered field — the quote preview is the one place
        // this milestone treats as fully untrusted-input-safe by construction
        // (Part X), not just by escaping.
        document.getElementById('qpQuoteNumber').textContent = quote.quoteNumber;
        document.getElementById('qpDate').textContent = formatDateOnly(quote.createdAt);
        document.getElementById('qpValidUntil').textContent = quote.validUntil ? formatDateOnly(quote.validUntil) : '—';

        const clientBlock = document.getElementById('qpClientBlock');
        clientBlock.innerHTML = '';
        [quote.clientName, quote.businessName, quote.clientEmail, quote.clientPhone].filter(Boolean).forEach(line => {
            const p = document.createElement('div');
            p.textContent = line;
            clientBlock.appendChild(p);
        });

        document.getElementById('qpTitle').textContent = quote.title || '';
        document.getElementById('qpDescription').textContent = quote.description || '';

        const tbody = document.getElementById('qpItemsBody');
        tbody.innerHTML = '';
        (quote.items || []).forEach(item => {
            const tr = document.createElement('tr');
            const tdDesc = document.createElement('td'); tdDesc.textContent = item.description;
            const tdQty = document.createElement('td'); tdQty.textContent = item.quantity;
            const tdPrice = document.createElement('td'); tdPrice.textContent = formatRand(item.unitPrice);
            const tdTotal = document.createElement('td'); tdTotal.textContent = formatRand(item.lineTotal);
            tr.append(tdDesc, tdQty, tdPrice, tdTotal);
            tbody.appendChild(tr);
        });

        document.getElementById('qpSubtotal').textContent = formatRand(quote.subtotal);
        const discountRow = document.getElementById('qpDiscountRow');
        if (quote.discountAmount > 0) {
            discountRow.style.display = 'flex';
            discountRow.querySelector('span').textContent = quote.discountType === 'percent' ? `Discount (${quote.discountValue}%)` : 'Discount';
            document.getElementById('qpDiscount').textContent = '-' + formatRand(quote.discountAmount);
        } else {
            discountRow.style.display = 'none';
        }
        document.getElementById('qpTotal').textContent = formatRand(quote.total);

        const paymentSection = document.getElementById('qpPaymentSection');
        if (quote.paymentArrangement) {
            paymentSection.style.display = 'block';
            document.getElementById('qpPayment').textContent = quote.paymentArrangement;
        } else {
            paymentSection.style.display = 'none';
        }

        const notesSection = document.getElementById('qpNotesSection');
        if (quote.notes) {
            notesSection.style.display = 'block';
            document.getElementById('qpNotes').textContent = quote.notes;
        } else {
            notesSection.style.display = 'none';
        }

        document.getElementById('qpTerms').textContent = quote.terms || '';

        document.getElementById('qpStartProjectBtn').style.display = quote.status === 'accepted' ? 'inline-flex' : 'none';
        document.getElementById('qpCreateInvoiceBtn').style.display = quote.status === 'accepted' ? 'inline-flex' : 'none';

        document.getElementById('quotePreviewOverlay').classList.add('active');
    }

    document.getElementById('quotePreviewClose').addEventListener('click', () => {
        document.getElementById('quotePreviewOverlay').classList.remove('active');
    });
    document.getElementById('quotePreviewOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'quotePreviewOverlay') document.getElementById('quotePreviewOverlay').classList.remove('active');
    });
    document.getElementById('qpPrintBtn').addEventListener('click', () => window.print());

    document.getElementById('qpEditBtn').addEventListener('click', () => {
        const quote = allQuotes.find(q => q.id === activeQuoteId);
        if (!quote) return;
        document.getElementById('quotePreviewOverlay').classList.remove('active');
        openQuoteBuilder({ quote });
    });

    async function duplicateQuote(id) {
        const quote = allQuotes.find(q => q.id === id);
        if (!quote) return;
        try {
            const record = {
                leadId: quote.leadId || null,
                quoteNumber: await generateQuoteNumber(),
                clientName: quote.clientName,
                clientEmail: quote.clientEmail || null,
                clientPhone: quote.clientPhone || null,
                businessName: quote.businessName || null,
                title: quote.title,
                description: quote.description || '',
                items: (quote.items || []).map(it => ({ ...it })),
                subtotal: quote.subtotal,
                discountType: quote.discountType,
                discountValue: quote.discountValue,
                discountAmount: quote.discountAmount,
                total: quote.total,
                status: 'draft',
                validUntil: fsMod.Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
                paymentArrangement: quote.paymentArrangement || '',
                terms: quote.terms || '',
                notes: quote.notes || '',
                createdAt: fsMod.serverTimestamp(),
                updatedAt: fsMod.serverTimestamp(),
                sentAt: null,
                acceptedAt: null,
                declinedAt: null,
                createdBy: auth.currentUser.uid
            };
            const docRef = fsMod.doc(fsMod.collection(db, 'quotes'));
            await fsMod.setDoc(docRef, record);
            await loadQuotes();
            document.getElementById('quotePreviewOverlay').classList.remove('active');
            openQuotePreview(docRef.id);
        } catch (err) {
            alert('Could not duplicate quote: ' + err.message);
        }
    }
    document.getElementById('qpDuplicateBtn').addEventListener('click', () => duplicateQuote(activeQuoteId));

    document.getElementById('qpEmailBtn').addEventListener('click', () => {
        const quote = allQuotes.find(q => q.id === activeQuoteId);
        if (!quote) return;
        if (!quote.clientEmail || !isValidEmail(quote.clientEmail)) {
            alert('This quote has no valid client email on file.');
            return;
        }
        const subject = `RM Digitals Quote ${quote.quoteNumber}`;
        const body = `Hi ${quote.clientName || ''},\n\nYour RM Digitals website quote ${quote.quoteNumber} (${formatRand(quote.total)}) is ready for your review. Please let me know if you have any questions.\n\nKind regards,\nAnani — RM Digitals`;
        window.location.href = `mailto:${encodeURIComponent(quote.clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });

    document.getElementById('qpWhatsappBtn').addEventListener('click', () => {
        const quote = allQuotes.find(q => q.id === activeQuoteId);
        if (!quote || !quote.clientPhone) { alert('This quote has no client phone number on file.'); return; }
        // Recipient is always the CLIENT's own number from the quote —
        // never RM Digitals' own WhatsApp number (Part Q).
        const digits = quote.clientPhone.replace(/[^\d]/g, '');
        if (digits.length < 8) { alert('This quote has no valid client phone number on file.'); return; }
        const greeting = `Hi ${quote.clientName || ''}, your RM Digitals website quote ${quote.quoteNumber} is ready. Please review it and let me know if you have any questions.`;
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`, '_blank', 'noopener,noreferrer');
    });

    async function updateQuoteStatus(newStatus) {
        if (!activeQuoteId) return;
        const quote = allQuotes.find(q => q.id === activeQuoteId);
        if (!quote) return;
        const update = { status: newStatus, updatedAt: fsMod.serverTimestamp() };
        if (newStatus === 'sent' && !quote.sentAt) update.sentAt = fsMod.serverTimestamp();
        if (newStatus === 'accepted' && !quote.acceptedAt) update.acceptedAt = fsMod.serverTimestamp();
        if (newStatus === 'declined' && !quote.declinedAt) update.declinedAt = fsMod.serverTimestamp();

        try {
            await fsMod.updateDoc(fsMod.doc(db, 'quotes', activeQuoteId), update);

            // Lead status integration (Part S) — never overwrites Won/Lost,
            // and Declined never auto-marks a lead Lost (admin decides).
            if (quote.leadId) {
                const leadRef = fsMod.doc(db, 'leads', quote.leadId);
                const leadSnap = await fsMod.getDoc(leadRef);
                if (leadSnap.exists()) {
                    const lead = leadSnap.data();
                    if (newStatus === 'sent' && lead.status !== 'won' && lead.status !== 'lost') {
                        await fsMod.updateDoc(leadRef, { status: 'quote_sent', updatedAt: fsMod.serverTimestamp() });
                    } else if (newStatus === 'accepted' && lead.status !== 'won' && lead.status !== 'lost') {
                        if (confirm('Quote accepted! Mark the linked lead as Won?')) {
                            await fsMod.updateDoc(leadRef, { status: 'won', updatedAt: fsMod.serverTimestamp() });
                        }
                    }
                    await loadLeads();
                }
            }

            await loadQuotes();
            openQuotePreview(activeQuoteId);
        } catch (err) {
            alert('Could not update quote status: ' + err.message);
        }
    }
    document.getElementById('qpStatusSelect').addEventListener('change', (e) => updateQuoteStatus(e.target.value));

    document.getElementById('qpDeleteBtn').addEventListener('click', async () => {
        if (!activeQuoteId) return;
        if (!confirm('Delete this quote permanently? This cannot be undone.')) return;
        try {
            await fsMod.deleteDoc(fsMod.doc(db, 'quotes', activeQuoteId));
            document.getElementById('quotePreviewOverlay').classList.remove('active');
            activeQuoteId = null;
            loadQuotes();
        } catch (err) {
            alert('Could not delete quote: ' + err.message);
        }
    });

    /* ============================================================
       CLIENTS (Milestone 18)
       ============================================================
       Same admin-only, getDocs-once, client-side filter/search
       pattern as Leads/Quotes above — see those sections' design
       notes for the full reasoning (no composite indexes needed).
       ============================================================ */

    let allClients = [];
    let activeClientId = null;

    async function loadClients() {
        const list = document.getElementById('clientList');
        list.innerHTML = '<p class="empty-note">Loading clients…</p>';
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'clients'), fsMod.orderBy('createdAt', 'desc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load clients: ${escapeHtml(err.message)}</p>`;
            return;
        }
        allClients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderClientList();
        refreshDashboard();
    }

    /* Duplicate-client detection (Part L) — fetches the small admin-only
       client list once and matches client-side on normalised email/phone,
       rather than adding Firestore query complexity for an OR-style
       match. Never merges or auto-creates on a match; callers decide. */
    async function findMatchingClient(email, phone) {
        const normEmail = email ? String(email).trim().toLowerCase() : null;
        const normPhone = normalizePhoneForWa(phone);
        if (!normEmail && !normPhone) return null;
        if (!allClients.length) await loadClients();
        return allClients.find(c => {
            const cEmail = c.email ? String(c.email).trim().toLowerCase() : null;
            const cPhone = normalizePhoneForWa(c.phone);
            return (normEmail && cEmail && cEmail === normEmail) || (normPhone && cPhone && cPhone === normPhone);
        }) || null;
    }

    function renderClientList() {
        const list = document.getElementById('clientList');
        const searchTerm = (document.getElementById('clientSearch').value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('clientFilterStatus').value;

        let filtered = allClients.filter(c => {
            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
            if (!searchTerm) return true;
            const haystack = [c.name, c.businessName, c.email, c.phone].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });

        if (allClients.length === 0) {
            list.innerHTML = '<p class="empty-note">No clients yet. Clients are created automatically when you Start a Client Project from an accepted quote or a Won lead, or manually via "New Client".</p>';
            return;
        }
        if (filtered.length === 0) {
            list.innerHTML = '<p class="empty-note">No clients match your search/filter.</p>';
            return;
        }

        list.innerHTML = '';
        filtered.forEach(client => {
            const projectCount = allClientProjects.filter(p => p.clientId === client.id).length;
            const row = document.createElement('div');
            row.className = 'client-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(client.name)}</strong>
                    <span>${escapeHtml([client.businessName, client.email || client.phone].filter(Boolean).join(' · '))}</span>
                </div>
                <div class="meta-col">${projectCount} project${projectCount === 1 ? '' : 's'}</div>
                <span class="status-badge status-${escapeHtml(client.status)}">${escapeHtml(CLIENT_STATUS_LABELS[client.status] || client.status)}</span>
            `;
            row.addEventListener('click', () => openClientProfile(client.id));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openClientProfile(client.id); });
            list.appendChild(row);
        });
    }
    document.getElementById('clientSearch').addEventListener('input', renderClientList);
    document.getElementById('clientFilterStatus').addEventListener('change', renderClientList);
    document.getElementById('clientNewBtn').addEventListener('click', () => openClientProfile(null));

    function renderCmContactActions(client) {
        const actions = document.getElementById('cmContactActions');
        actions.innerHTML = '';
        if (!client) return;
        const mailtoUrl = safeMailto(client.email, `RM Digitals — ${client.name}`);
        if (mailtoUrl) { const a = document.createElement('a'); a.href = mailtoUrl; a.innerHTML = '<i class="fas fa-envelope"></i> Email'; actions.appendChild(a); }
        const telUrl = safeTel(client.phone);
        if (telUrl) { const a = document.createElement('a'); a.href = telUrl; a.innerHTML = '<i class="fas fa-phone"></i> Call'; actions.appendChild(a); }
        const waDigits = normalizePhoneForWa(client.phone);
        if (waDigits) {
            const a = document.createElement('a');
            a.href = `https://wa.me/${waDigits}?text=${encodeURIComponent('Hi ' + (client.name || '') + ', this is RM Digitals.')}`;
            a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp';
            actions.appendChild(a);
        }
    }

    function openClientProfile(id) {
        activeClientId = id;
        const client = id ? allClients.find(c => c.id === id) : null;
        document.getElementById('clientDetailMsg').textContent = '';
        document.getElementById('cmClientId').value = client ? client.id : '';
        document.getElementById('cmHeading').textContent = client ? client.name : 'New Client';

        const status = client ? (client.status || 'active') : 'active';
        const badge = document.getElementById('cmStatusBadge');
        badge.textContent = CLIENT_STATUS_LABELS[status] || status;
        badge.className = 'status-badge status-' + status;
        document.getElementById('cmStatusSelect').value = status;

        document.getElementById('cmName').value = client ? (client.name || '') : '';
        document.getElementById('cmBusinessName').value = client ? (client.businessName || '') : '';
        document.getElementById('cmEmail').value = client ? (client.email || '') : '';
        document.getElementById('cmPhone').value = client ? (client.phone || '') : '';
        document.getElementById('cmAltPhone').value = client ? (client.alternativePhone || '') : '';
        document.getElementById('cmWebsite').value = client ? (client.website || '') : '';
        document.getElementById('cmNotes').value = client ? (client.notes || '') : '';

        renderCmContactActions(client);

        const projectsList = document.getElementById('cmProjectsList');
        if (client) {
            const projects = allClientProjects.filter(p => p.clientId === client.id);
            if (!projects.length) {
                projectsList.innerHTML = '<p class="empty-note">No projects yet.</p>';
            } else {
                projectsList.innerHTML = '';
                projects.forEach(p => {
                    const row = document.createElement('div');
                    row.className = 'cp-row';
                    row.innerHTML = `<div class="info"><strong>${escapeHtml(p.projectName)}</strong></div><span class="stage-badge stage-${escapeHtml(p.stage)}">${escapeHtml(STAGE_LABELS[p.stage] || p.stage)}</span>`;
                    row.addEventListener('click', () => {
                        document.getElementById('clientModalOverlay').classList.remove('active');
                        openProjectDetail({ project: p });
                    });
                    projectsList.appendChild(row);
                });
            }
        } else {
            projectsList.innerHTML = '<p class="empty-note">Save this client first.</p>';
        }

        renderCmInvoicesAndReceipts(client);
        renderPortalAccessSection(client);

        document.getElementById('clientModalOverlay').classList.add('active');
    }

    function renderCmInvoicesAndReceipts(client) {
        const invoicesList = document.getElementById('cmInvoicesList');
        const receiptsList = document.getElementById('cmReceiptsList');
        if (!client) {
            invoicesList.innerHTML = '<p class="empty-note">Save this client first.</p>';
            receiptsList.innerHTML = '<p class="empty-note">Save this client first.</p>';
            return;
        }
        const clientInvoices = allInvoices.filter(inv => inv.clientId === client.id);
        if (!clientInvoices.length) {
            invoicesList.innerHTML = '<p class="empty-note">No invoices yet.</p>';
        } else {
            invoicesList.innerHTML = '';
            clientInvoices.forEach(inv => {
                const disp = displayInvoiceStatus(inv);
                const row = document.createElement('div');
                row.className = 'invoice-row';
                row.innerHTML = `
                    <div class="info"><strong>${escapeHtml(inv.invoiceNumber)}</strong><span>${escapeHtml(inv.title || '')}</span></div>
                    <div class="amount-col">${formatRand(inv.total)}</div>
                    <span class="status-badge status-${escapeHtml(disp)}">${escapeHtml(INVOICE_DISPLAY_LABELS[disp] || disp)}</span>
                `;
                row.addEventListener('click', () => {
                    document.getElementById('clientModalOverlay').classList.remove('active');
                    openInvoicePreview(inv.id);
                });
                invoicesList.appendChild(row);
            });
        }
        const clientReceipts = allReceipts.filter(r => r.clientId === client.id);
        if (!clientReceipts.length) {
            receiptsList.innerHTML = '<p class="empty-note">No receipts yet.</p>';
        } else {
            receiptsList.innerHTML = '';
            clientReceipts.forEach(r => {
                const row = document.createElement('div');
                row.className = 'receipt-row';
                row.innerHTML = `
                    <div class="info"><strong>${escapeHtml(r.receiptNumber)}</strong></div>
                    <div class="amount-col">${formatRand(r.amount)}</div>
                    <span class="status-badge ${r.voided ? 'status-voided' : 'status-paid'}">${r.voided ? 'Voided' : 'Issued'}</span>
                `;
                row.addEventListener('click', () => {
                    document.getElementById('clientModalOverlay').classList.remove('active');
                    openReceiptPreview(r.id);
                });
                receiptsList.appendChild(row);
            });
        }
    }
    document.getElementById('clientModalClose').addEventListener('click', () => document.getElementById('clientModalOverlay').classList.remove('active'));
    document.getElementById('clientModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'clientModalOverlay') document.getElementById('clientModalOverlay').classList.remove('active'); });

    document.getElementById('cmSaveBtn').addEventListener('click', async () => {
        const msg = document.getElementById('clientDetailMsg');
        const name = document.getElementById('cmName').value.trim();
        const email = document.getElementById('cmEmail').value.trim();
        const website = document.getElementById('cmWebsite').value.trim();
        if (!name) { msg.textContent = '⚠️ Name is required.'; msg.className = 'form-msg error'; return; }
        if (email && !isValidEmail(email)) { msg.textContent = '⚠️ That email doesn\'t look valid.'; msg.className = 'form-msg error'; return; }
        if (website && !isSafeHttpUrl(website)) { msg.textContent = '⚠️ Website must start with http:// or https://'; msg.className = 'form-msg error'; return; }

        const record = {
            name,
            businessName: document.getElementById('cmBusinessName').value.trim() || null,
            email: email || null,
            phone: document.getElementById('cmPhone').value.trim() || null,
            alternativePhone: document.getElementById('cmAltPhone').value.trim() || null,
            website: website || null,
            status: document.getElementById('cmStatusSelect').value,
            notes: document.getElementById('cmNotes').value,
            updatedAt: fsMod.serverTimestamp()
        };

        try {
            const editingId = document.getElementById('cmClientId').value;
            if (editingId) {
                await fsMod.updateDoc(fsMod.doc(db, 'clients', editingId), record);
            } else {
                record.sourceLeadId = null;
                record.createdFromQuoteId = null;
                record.createdAt = fsMod.serverTimestamp();
                record.createdBy = auth.currentUser.uid;
                const docRef = fsMod.doc(fsMod.collection(db, 'clients'));
                await fsMod.setDoc(docRef, record);
                document.getElementById('cmClientId').value = docRef.id;
                activeClientId = docRef.id;
            }
            msg.textContent = '✅ Client saved.';
            msg.className = 'form-msg success';
            await loadClients();
            openClientProfile(activeClientId);
        } catch (err) {
            msg.textContent = '❌ Could not save client: ' + err.message;
            msg.className = 'form-msg error';
        }
    });

    /* "Archive" is the only destructive-adjacent action offered (Part P) —
       there is no true delete path, so a client with linked quotes/leads/
       projects can never be permanently removed by mistake. */
    document.getElementById('cmDeleteBtn').addEventListener('click', async () => {
        if (!activeClientId) { document.getElementById('clientModalOverlay').classList.remove('active'); return; }
        const activeProjects = allClientProjects.filter(p => p.clientId === activeClientId && ACTIVE_STAGES.includes(p.stage));
        const warning = activeProjects.length
            ? `This client has ${activeProjects.length} active project(s). Archive anyway? Their quotes/leads/project history is preserved.`
            : 'Archive this client? Their quotes/leads/project history is preserved.';
        if (!confirm(warning)) return;
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'clients', activeClientId), { status: 'archived', updatedAt: fsMod.serverTimestamp() });
            document.getElementById('clientModalOverlay').classList.remove('active');
            await loadClients();
        } catch (err) {
            alert('Could not archive client: ' + err.message);
        }
    });

    document.getElementById('cmNewProjectBtn').addEventListener('click', () => {
        const client = allClients.find(c => c.id === activeClientId);
        if (!client) { alert('Please save this client first.'); return; }
        document.getElementById('clientModalOverlay').classList.remove('active');
        openProjectDetail({ client });
    });

    /* ── Client Picker — standalone "New Project" with no quote/lead/client context ── */
    // Generalised (Milestone 20): originally only opened the Project
    // Detail modal; now accepts any callback so the same find-or-create
    // client flow can also feed the Invoice Builder.
    let clientPickerOnChoose = (client) => openProjectDetail({ client });

    function renderCpkResults(term) {
        const results = document.getElementById('cpkResults');
        const t = term.trim().toLowerCase();
        const matches = !t ? allClients.slice(0, 8) : allClients.filter(c => {
            const haystack = [c.name, c.businessName, c.email, c.phone].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(t);
        }).slice(0, 8);
        if (!matches.length) { results.innerHTML = '<p class="empty-note">No matching clients.</p>'; return; }
        results.innerHTML = '';
        matches.forEach(c => {
            const row = document.createElement('div');
            row.className = 'client-row';
            row.innerHTML = `<div class="info"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.businessName || '')}</span></div>`;
            row.addEventListener('click', () => {
                document.getElementById('clientPickerOverlay').classList.remove('active');
                clientPickerOnChoose(c);
            });
            results.appendChild(row);
        });
    }
    function openClientPicker(onChoose) {
        clientPickerOnChoose = typeof onChoose === 'function' ? onChoose : (client) => openProjectDetail({ client });
        document.getElementById('cpkSearch').value = '';
        document.getElementById('cpkName').value = '';
        document.getElementById('cpkBusiness').value = '';
        document.getElementById('cpkEmail').value = '';
        document.getElementById('cpkPhone').value = '';
        document.getElementById('cpkDuplicateNote').style.display = 'none';
        document.getElementById('cpkMsg').textContent = '';
        renderCpkResults('');
        document.getElementById('clientPickerOverlay').classList.add('active');
    }
    document.getElementById('cpkSearch').addEventListener('input', (e) => renderCpkResults(e.target.value));
    document.getElementById('clientPickerClose').addEventListener('click', () => document.getElementById('clientPickerOverlay').classList.remove('active'));
    document.getElementById('clientPickerOverlay').addEventListener('click', (e) => { if (e.target.id === 'clientPickerOverlay') document.getElementById('clientPickerOverlay').classList.remove('active'); });

    document.getElementById('cpkCreateBtn').addEventListener('click', async () => {
        const msg = document.getElementById('cpkMsg');
        const name = document.getElementById('cpkName').value.trim();
        const email = document.getElementById('cpkEmail').value.trim();
        const phone = document.getElementById('cpkPhone').value.trim();
        if (!name) { msg.textContent = '⚠️ Name is required.'; msg.className = 'form-msg error'; return; }
        if (email && !isValidEmail(email)) { msg.textContent = '⚠️ That email doesn\'t look valid.'; msg.className = 'form-msg error'; return; }

        const match = await findMatchingClient(email, phone);
        if (match) {
            const note = document.getElementById('cpkDuplicateNote');
            note.innerHTML = `Existing client found: <strong>${escapeHtml(match.name)}</strong>${match.businessName ? ' (' + escapeHtml(match.businessName) + ')' : ''}. `;
            const useBtn = document.createElement('button');
            useBtn.type = 'button'; useBtn.className = 'btn-logout'; useBtn.textContent = 'Use This Client';
            useBtn.addEventListener('click', () => {
                document.getElementById('clientPickerOverlay').classList.remove('active');
                clientPickerOnChoose(match);
            });
            note.appendChild(useBtn);
            note.style.display = 'block';
            return;
        }

        try {
            const clientRef = fsMod.doc(fsMod.collection(db, 'clients'));
            const record = {
                name, businessName: document.getElementById('cpkBusiness').value.trim() || null,
                email: email || null, phone: phone || null, alternativePhone: null, website: null,
                status: 'active', sourceLeadId: null, createdFromQuoteId: null, notes: '',
                createdAt: fsMod.serverTimestamp(), updatedAt: fsMod.serverTimestamp(), createdBy: auth.currentUser.uid
            };
            await fsMod.setDoc(clientRef, record);
            await loadClients();
            document.getElementById('clientPickerOverlay').classList.remove('active');
            clientPickerOnChoose({ id: clientRef.id, ...record });
        } catch (err) {
            msg.textContent = '❌ Could not create client: ' + err.message;
            msg.className = 'form-msg error';
        }
    });

    /* ============================================================
       CLIENT PROJECTS (Milestone 18)
       ============================================================ */

    let allClientProjects = [];
    let cpItemsPayments = [];
    let cpItemsChecklist = [];
    let cpItemsTasks = [];
    let cpItemsCompletion = [];

    async function loadClientProjects() {
        const list = document.getElementById('cpList');
        list.innerHTML = '<p class="empty-note">Loading projects…</p>';
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'clientProjects'), fsMod.orderBy('createdAt', 'desc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load client projects: ${escapeHtml(err.message)}</p>`;
            return;
        }
        allClientProjects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        await renderCpDashboard();
        renderCpList();
        refreshDashboard();
    }

    /* Two lightweight, server-side-filtered counts (Milestone 19 dashboard
       only) — not cached, since Reviews already has its own live admin
       section; this just needs the numbers, not the records. */
    async function loadReviewCountsForDashboard() {
        try {
            const pendingSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'reviews'), fsMod.where('status', '==', 'pending')));
            const approvedSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'reviews'), fsMod.where('status', '==', 'approved')));
            return { pending: pendingSnap.size, approved: approvedSnap.size };
        } catch (err) {
            console.warn('Could not load review counts:', err.message);
            return { pending: 0, approved: 0 };
        }
    }

    async function renderCpDashboard() {
        const counts = { active: 0, awaiting_content: 0, development: 0, client_review: 0, ready_to_launch: 0, completed: 0, overdue: 0 };
        let totalContract = 0, totalPaid = 0;
        allClientProjects.forEach(p => {
            if (ACTIVE_STAGES.includes(p.stage)) counts.active++;
            if (counts.hasOwnProperty(p.stage)) counts[p.stage]++;
            if (isOverdue(p)) counts.overdue++;
            totalContract += Math.max(0, Number(p.contractValue) || 0);
            totalPaid += Math.max(0, Number(p.amountPaid) || 0);
        });
        document.getElementById('cpsActive').textContent = counts.active;
        document.getElementById('cpsAwaitingContent').textContent = counts.awaiting_content;
        document.getElementById('cpsDevelopment').textContent = counts.development;
        document.getElementById('cpsClientReview').textContent = counts.client_review;
        document.getElementById('cpsReadyToLaunch').textContent = counts.ready_to_launch;
        document.getElementById('cpsOverdue').textContent = counts.overdue;
        document.getElementById('cpsCompleted').textContent = counts.completed;

        document.getElementById('cpfContractValue').textContent = formatRand(totalContract);
        document.getElementById('cpfPaymentsRecorded').textContent = formatRand(totalPaid);
        document.getElementById('cpfOutstanding').textContent = formatRand(Math.max(0, totalContract - totalPaid));
        document.getElementById('cpfAccepted').textContent = formatRand(totalContract);

        /* Milestone 19: completion/marketing summary — secondary to the
           pipeline dashboard above, per Part Z ("do not overload"). */
        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        let completedTotal = 0, completedThisMonth = 0, permissionPending = 0, readyForPortfolio = 0, portfolioDrafts = 0, portfolioPublished = 0, reviewsRequested = 0;
        allClientProjects.forEach(p => {
            if (p.stage === 'completed') {
                completedTotal++;
                if (p.completedAt) {
                    const d = p.completedAt.toDate ? p.completedAt.toDate() : new Date(p.completedAt);
                    if (d.getTime() >= startOfMonth.getTime()) completedThisMonth++;
                }
                const permission = p.portfolioPermission || 'not_asked';
                if (permission === 'not_asked') permissionPending++;
                if (permission === 'granted' && !p.portfolioProjectId) readyForPortfolio++;
            }
            if (p.portfolioProjectId) {
                portfolioDrafts++;
                const linked = allProjects.find(pp => pp.id === p.portfolioProjectId);
                if (linked && linked.published) portfolioPublished++;
            }
            if (p.reviewRequestStatus && p.reviewRequestStatus !== 'not_requested') reviewsRequested++;
        });
        document.getElementById('cpmCompletedTotal').textContent = completedTotal;
        document.getElementById('cpmCompletedThisMonth').textContent = completedThisMonth;
        document.getElementById('cpmPermissionPending').textContent = permissionPending;
        document.getElementById('cpmReadyForPortfolio').textContent = readyForPortfolio;
        document.getElementById('cpmPortfolioDrafts').textContent = portfolioDrafts;
        document.getElementById('cpmPortfolioPublished').textContent = portfolioPublished;
        document.getElementById('cpmReviewsRequested').textContent = reviewsRequested;

        const reviewCounts = await loadReviewCountsForDashboard();
        document.getElementById('cpmReviewsAwaiting').textContent = reviewCounts.pending;
        document.getElementById('cpmReviewsApproved').textContent = reviewCounts.approved;

        renderCpAttention();
        renderCpFollowUp();
    }

    function renderCpFollowUp() {
        const list = document.getElementById('cpFollowUpList');
        const items = [];
        allClientProjects.filter(p => p.stage === 'completed').forEach(p => {
            const permission = p.portfolioPermission || 'not_asked';
            const reviewStatus = p.reviewRequestStatus || 'not_requested';
            if (permission === 'not_asked') items.push({ id: p.id, text: `Portfolio permission not asked: ${p.projectName}` });
            else if (permission === 'granted' && !p.portfolioProjectId) items.push({ id: p.id, text: `Portfolio granted, no draft prepared yet: ${p.projectName}` });
            if (reviewStatus === 'not_requested') items.push({ id: p.id, text: `Review not requested: ${p.projectName}` });
            else if (reviewStatus === 'requested' && !p.linkedReviewId) items.push({ id: p.id, text: `Review requested, not yet linked: ${p.projectName}` });
            if (Number(p.balance) > 0.001) items.push({ id: p.id, text: `Outstanding final payment (${formatRand(p.balance)}): ${p.projectName}` });
        });
        if (!items.length) { list.innerHTML = '<li class="empty-note">No completed projects need follow-up right now.</li>'; return; }
        list.innerHTML = '';
        items.slice(0, 12).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.text;
            li.addEventListener('click', () => {
                const project = allClientProjects.find(p => p.id === item.id);
                if (project) openProjectDetail({ project });
            });
            list.appendChild(li);
        });
    }

    function renderCpAttention() {
        const list = document.getElementById('cpAttentionList');
        const items = [];
        allClientProjects.forEach(p => { if (isOverdue(p)) items.push({ id: p.id, text: `Overdue: ${p.projectName} (target ${formatDateOnly(p.targetDate)})`, weight: 0 }); });
        allClientProjects.forEach(p => { if (isDueSoon(p)) items.push({ id: p.id, text: `Due soon: ${p.projectName} (target ${formatDateOnly(p.targetDate)})`, weight: 1 }); });
        allClientProjects.forEach(p => { if (p.stage === 'awaiting_content') items.push({ id: p.id, text: `Awaiting content: ${p.projectName}`, weight: 2 }); });
        allClientProjects.forEach(p => { if ((p.priority === 'urgent' || p.priority === 'high') && ACTIVE_STAGES.includes(p.stage)) items.push({ id: p.id, text: `${PRIORITY_LABELS[p.priority]} priority: ${p.projectName}`, weight: 3 }); });
        items.sort((a, b) => a.weight - b.weight);

        if (!items.length) { list.innerHTML = '<li class="empty-note">Nothing needs attention right now.</li>'; return; }
        list.innerHTML = '';
        items.slice(0, 10).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.text; // textContent — project names are untrusted input
            li.addEventListener('click', () => {
                const project = allClientProjects.find(p => p.id === item.id);
                if (project) openProjectDetail({ project });
            });
            list.appendChild(li);
        });
    }

    function renderCpList() {
        const list = document.getElementById('cpList');
        const searchTerm = (document.getElementById('cpSearch').value || '').trim().toLowerCase();
        const stageFilter = document.getElementById('cpFilterStage').value;
        const priorityFilter = document.getElementById('cpFilterPriority').value;
        const workflowFilter = document.getElementById('cpFilterWorkflow').value;
        const sortMode = document.getElementById('cpSort').value;

        let filtered = allClientProjects.filter(p => {
            if (stageFilter === 'active') { if (!ACTIVE_STAGES.includes(p.stage)) return false; }
            else if (stageFilter !== 'all' && p.stage !== stageFilter) return false;
            if (priorityFilter !== 'all' && p.priority !== priorityFilter) return false;
            if (workflowFilter !== 'all') {
                const permission = p.portfolioPermission || 'not_asked';
                const reviewStatus = p.reviewRequestStatus || 'not_requested';
                if (workflowFilter === 'permission_pending' && permission !== 'not_asked') return false;
                if (workflowFilter === 'ready_for_portfolio' && !(permission === 'granted' && !p.portfolioProjectId)) return false;
                if (workflowFilter === 'review_not_requested' && reviewStatus !== 'not_requested') return false;
                if (workflowFilter === 'review_requested' && reviewStatus !== 'requested') return false;
                if (workflowFilter === 'review_submitted' && reviewStatus !== 'submitted') return false;
                if (workflowFilter === 'review_approved' && reviewStatus !== 'approved') return false;
            }
            if (!searchTerm) return true;
            const client = allClients.find(c => c.id === p.clientId);
            const haystack = [p.projectName, client ? client.name : '', client ? client.businessName : ''].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });

        if (sortMode === 'target') {
            filtered = filtered.slice().sort((a, b) => {
                const at = a.targetDate ? (a.targetDate.toDate ? a.targetDate.toDate().getTime() : new Date(a.targetDate).getTime()) : Infinity;
                const bt = b.targetDate ? (b.targetDate.toDate ? b.targetDate.toDate().getTime() : new Date(b.targetDate).getTime()) : Infinity;
                return at - bt;
            });
        } else if (sortMode === 'priority') {
            const order = ['urgent', 'high', 'normal', 'low'];
            filtered = filtered.slice().sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
        } else if (sortMode === 'stage') {
            const order = ['awaiting_content', 'planning', 'design', 'development', 'client_review', 'revisions', 'ready_to_launch', 'on_hold', 'completed', 'cancelled'];
            filtered = filtered.slice().sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
        }

        if (allClientProjects.length === 0) {
            list.innerHTML = '<p class="empty-note">No client projects yet. Convert an accepted quote or a Won lead, or use "New Project" above.</p>';
            return;
        }
        if (filtered.length === 0) {
            list.innerHTML = '<p class="empty-note">No projects match your search/filter.</p>';
            return;
        }

        list.innerHTML = '';
        filtered.forEach(p => {
            const client = allClients.find(c => c.id === p.clientId);
            const row = document.createElement('div');
            row.className = 'cp-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            const dueTag = isOverdue(p) ? ' <span style="color:#ff7070;">· Overdue</span>' : (isDueSoon(p) ? ' <span style="color:var(--gold);">· Due Soon</span>' : '');
            const progress = clampProgress(p.progress);
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(p.projectName)}</strong>
                    <span>${escapeHtml(client ? client.name : 'No client')}${dueTag}</span>
                </div>
                <div class="progress-wrap">
                    <div class="progress-bar"><div class="fill" style="width:${progress}%;"></div></div>
                    <div class="progress-label">${progress}%</div>
                </div>
                <div class="amount-col">${formatRand(p.contractValue)}</div>
                <span class="priority-badge priority-${escapeHtml(p.priority || 'normal')}">${escapeHtml(PRIORITY_LABELS[p.priority] || 'Normal')}</span>
                <span class="stage-badge stage-${escapeHtml(p.stage)}">${escapeHtml(STAGE_LABELS[p.stage] || p.stage)}</span>
            `;
            row.addEventListener('click', () => openProjectDetail({ project: p }));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openProjectDetail({ project: p }); });
            list.appendChild(row);
        });
    }
    document.getElementById('cpSearch').addEventListener('input', renderCpList);
    document.getElementById('cpFilterStage').addEventListener('change', renderCpList);
    document.getElementById('cpFilterPriority').addEventListener('change', renderCpList);
    document.getElementById('cpFilterWorkflow').addEventListener('change', renderCpList);
    document.getElementById('cpSort').addEventListener('change', renderCpList);
    document.getElementById('cpNewBtn').addEventListener('click', () => openClientPicker());

    /* ── Project Detail (create + edit combined — Part V) ── */

    function renderCpContactActions(client) {
        const actions = document.getElementById('cpContactActions');
        actions.innerHTML = '';
        if (!client) return;
        const mailtoUrl = safeMailto(client.email, `RM Digitals — ${client.name}`);
        if (mailtoUrl) { const a = document.createElement('a'); a.href = mailtoUrl; a.innerHTML = '<i class="fas fa-envelope"></i> Email'; actions.appendChild(a); }
        const telUrl = safeTel(client.phone);
        if (telUrl) { const a = document.createElement('a'); a.href = telUrl; a.innerHTML = '<i class="fas fa-phone"></i> Call'; actions.appendChild(a); }
        const waDigits = normalizePhoneForWa(client.phone);
        if (waDigits) {
            const a = document.createElement('a');
            a.href = `https://wa.me/${waDigits}?text=${encodeURIComponent('Hi ' + (client.name || '') + ', this is RM Digitals regarding your website project.')}`;
            a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.innerHTML = '<i class="fab fa-whatsapp"></i> WhatsApp';
            actions.appendChild(a);
        }
    }

    function updateCpProgressBar() {
        const val = clampProgress(document.getElementById('cpProgress').value);
        document.getElementById('cpProgress').value = val;
        document.getElementById('cpProgressFill').style.width = val + '%';
    }
    document.getElementById('cpProgress').addEventListener('input', updateCpProgressBar);

    function renderCpDeadlineWarningFromForm() {
        const el = document.getElementById('cpDeadlineWarning');
        const stage = document.getElementById('cpStage').value;
        const targetStr = document.getElementById('cpTargetDate').value;
        if (!targetStr || stage === 'completed' || stage === 'cancelled') { el.style.display = 'none'; return; }
        const target = new Date(targetStr + 'T23:59:59');
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        if (target.getTime() < startOfToday.getTime()) {
            el.textContent = '⚠️ This project is overdue.'; el.style.color = '#ff7070'; el.style.display = 'block';
        } else if (target.getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000) {
            el.textContent = '⏳ Target date is within the next 7 days.'; el.style.color = 'var(--gold)'; el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }
    document.getElementById('cpTargetDate').addEventListener('change', renderCpDeadlineWarningFromForm);

    let cpPreviousStageValue = 'awaiting_content'; // tracked so a cancelled "mark Completed" can revert the select

    document.getElementById('cpStage').addEventListener('change', (e) => {
        const newValue = e.target.value;

        /* Completion readiness check (Milestone 19, Part E) — a warning,
           never an absolute block. The admin always has the final say. */
        if (newValue === 'completed' && cpPreviousStageValue !== 'completed') {
            const issues = [];
            const unresolvedCompletion = cpItemsCompletion.filter(i => i.status === 'pending').length;
            if (unresolvedCompletion > 0) issues.push(`${unresolvedCompletion} completion checklist item(s) still pending`);
            const openTasks = cpItemsTasks.filter(t => !t.completed).length;
            if (openTasks > 0) issues.push(`${openTasks} open task(s)`);
            const outstandingContent = cpItemsChecklist.filter(i => !i.received).length;
            if (outstandingContent > 0) issues.push(`${outstandingContent} content item(s) still outstanding`);
            const { balance } = renderCpFinancials();
            if (balance > 0.001) issues.push(`an outstanding balance of ${formatRand(balance)}`);
            if (cpItemsCompletion.length && !cpItemsCompletion.some(i => /client approval/i.test(i.label) && i.status === 'completed')) {
                issues.push('client approval not yet confirmed on the completion checklist');
            }
            if (issues.length) {
                const proceed = confirm(`This project still has outstanding items:\n\n${issues.map(i => '• ' + i).join('\n')}\n\nAre you sure you want to mark it completed?`);
                if (!proceed) { e.target.value = cpPreviousStageValue; return; }
            }
        }
        cpPreviousStageValue = newValue;

        const suggested = STAGE_SUGGESTED_PROGRESS[newValue];
        if (suggested != null) {
            const current = clampProgress(document.getElementById('cpProgress').value);
            if (current !== suggested && confirm(`Update progress to ${suggested}% to match the "${STAGE_LABELS[newValue]}" stage? (Cancel to leave progress unchanged)`)) {
                document.getElementById('cpProgress').value = suggested;
                updateCpProgressBar();
            }
        }
        renderCpDeadlineWarningFromForm();
        renderCpReviewSection(allClientProjects.find(p => p.id === document.getElementById('cpProjectId').value) || { stage: newValue });
    });

    function renderCpPayments() {
        const list = document.getElementById('cpPaymentsList');
        if (!cpItemsPayments.length) { list.innerHTML = '<p class="empty-note">No payments recorded yet.</p>'; return; }
        list.innerHTML = '';
        cpItemsPayments.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = 'payment-row';
            row.innerHTML = `
                <span class="amt">${formatRand(p.amount)}</span>
                <span class="meta">${escapeHtml(formatDateOnly(p.date))} · ${escapeHtml(p.method || '')}${p.reference ? ' · Ref: ' + escapeHtml(p.reference) : ''}${p.notes ? ' · ' + escapeHtml(p.notes) : ''}</span>
                <button type="button" class="receipt-btn" data-act="receipt">Create Receipt</button>
                <button type="button" data-act="remove">Remove</button>
            `;
            row.querySelector('[data-act="remove"]').addEventListener('click', () => {
                if (!confirm('Remove this payment record?')) return;
                cpItemsPayments.splice(idx, 1);
                renderCpPayments();
                renderCpFinancials();
            });
            row.querySelector('[data-act="receipt"]').addEventListener('click', () => {
                const editingId = document.getElementById('cpProjectId').value;
                const project = editingId ? allClientProjects.find(pr => pr.id === editingId) : null;
                // A receipt snapshots a real, saved payment — never one still
                // sitting only in this modal's unsaved local buffer.
                if (!project || !(project.payments || []).some(sp => sp.id === p.id)) {
                    alert('Please save this project first (so the payment is stored), then create the receipt from here.');
                    return;
                }
                createReceiptForProjectPayment(project, p);
            });
            list.appendChild(row);
        });
    }

    function renderCpFinancials() {
        const contractValue = Math.max(0, Number(document.getElementById('cpContractValue').value) || 0);
        const depositRequired = Math.max(0, Number(document.getElementById('cpDepositRequired').value) || 0);
        const amountPaid = cpItemsPayments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
        const balance = contractValue - amountPaid;

        document.getElementById('cpAmountPaidOut').textContent = formatRand(amountPaid);
        const balanceStat = document.getElementById('cpBalanceStat');
        const balanceOut = document.getElementById('cpBalanceOut');
        if (balance < -0.001) {
            balanceOut.textContent = 'Overpaid by ' + formatRand(Math.abs(balance));
            balanceStat.className = 'financial-stat overpaid';
            balanceStat.querySelector('.lbl').textContent = 'Overpayment';
        } else {
            balanceOut.textContent = formatRand(balance);
            balanceStat.className = 'financial-stat' + (balance > 0.001 ? ' balance-due' : ' paid-full');
            balanceStat.querySelector('.lbl').textContent = 'Outstanding Balance';
        }

        let status;
        if (amountPaid <= 0.001) status = 'Not Paid';
        else if (balance > 0.001) status = 'Deposit / Part Payment';
        else if (Math.abs(balance) <= 0.001) status = 'Paid';
        else status = 'Overpaid';
        document.getElementById('cpPaymentStatusOut').textContent = status;

        const depositOut = document.getElementById('cpDepositStatusOut');
        depositOut.textContent = depositRequired > 0
            ? (amountPaid >= depositRequired ? 'Received' : `${formatRand(amountPaid)} of ${formatRand(depositRequired)}`)
            : '—';

        return { contractValue, depositRequired, amountPaid, balance, status };
    }
    document.getElementById('cpContractValue').addEventListener('input', renderCpFinancials);
    document.getElementById('cpDepositRequired').addEventListener('input', renderCpFinancials);

    document.getElementById('cpAddPaymentBtn').addEventListener('click', () => {
        const amount = Number(document.getElementById('cpPayAmount').value);
        const date = document.getElementById('cpPayDate').value;
        if (!(amount > 0)) { alert('Enter a payment amount greater than 0.'); return; }
        if (!date) { alert('Please choose a payment date.'); return; }
        cpItemsPayments.push({
            id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
            amount, date,
            method: document.getElementById('cpPayMethod').value,
            reference: document.getElementById('cpPayReference').value.trim(),
            notes: document.getElementById('cpPayNotes').value.trim()
        });
        document.getElementById('cpPayAmount').value = '';
        document.getElementById('cpPayReference').value = '';
        document.getElementById('cpPayNotes').value = '';
        renderCpPayments();
        renderCpFinancials();
    });

    function renderCpChecklist() {
        const list = document.getElementById('cpChecklistList');
        const received = cpItemsChecklist.filter(i => i.received).length;
        document.getElementById('cpChecklistProgress').textContent = `${received} of ${cpItemsChecklist.length} received`;
        if (!cpItemsChecklist.length) { list.innerHTML = '<p class="empty-note">No checklist items yet.</p>'; return; }
        list.innerHTML = '';
        cpItemsChecklist.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'checklist-item' + (item.received ? ' received' : '');
            row.innerHTML = `
                <span class="label">${escapeHtml(item.label)}</span>
                <button type="button" data-act="toggle">${item.received ? 'Mark Outstanding' : 'Mark Received'}</button>
                <button type="button" data-act="remove">Remove</button>
            `;
            row.querySelector('[data-act="toggle"]').addEventListener('click', () => { cpItemsChecklist[idx].received = !cpItemsChecklist[idx].received; renderCpChecklist(); });
            row.querySelector('[data-act="remove"]').addEventListener('click', () => { cpItemsChecklist.splice(idx, 1); renderCpChecklist(); });
            list.appendChild(row);
        });
    }
    document.getElementById('cpChecklistAddBtn').addEventListener('click', () => {
        const input = document.getElementById('cpChecklistNewItem');
        const label = input.value.trim();
        if (!label) return;
        cpItemsChecklist.push({ id: 'c' + Date.now() + Math.random().toString(36).slice(2, 7), label, received: false, custom: true });
        input.value = '';
        renderCpChecklist();
    });
    document.getElementById('cpChecklistStarterBtn').addEventListener('click', () => {
        const existingLabels = new Set(cpItemsChecklist.map(i => i.label.toLowerCase()));
        STARTER_CHECKLIST_ITEMS.forEach((label, i) => {
            if (!existingLabels.has(label.toLowerCase())) {
                cpItemsChecklist.push({ id: 'c' + Date.now() + i, label, received: false, custom: false });
            }
        });
        renderCpChecklist();
    });

    function renderCpTasks() {
        const list = document.getElementById('cpTasksList');
        if (!cpItemsTasks.length) { list.innerHTML = '<p class="empty-note">No tasks yet.</p>'; return; }
        list.innerHTML = '';
        cpItemsTasks.forEach((task, idx) => {
            const row = document.createElement('div');
            row.className = 'task-item' + (task.completed ? ' completed' : '');
            const dueSpan = document.createElement('span');
            dueSpan.className = 'label';
            dueSpan.textContent = task.title + (task.dueDate ? ` (due ${formatDateOnly(task.dueDate)})` : '');
            row.appendChild(dueSpan);
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.textContent = task.completed ? 'Reopen' : 'Complete';
            toggleBtn.addEventListener('click', () => { cpItemsTasks[idx].completed = !cpItemsTasks[idx].completed; renderCpTasks(); });
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => { cpItemsTasks.splice(idx, 1); renderCpTasks(); });
            row.appendChild(toggleBtn);
            row.appendChild(removeBtn);
            list.appendChild(row);
        });
    }
    document.getElementById('cpTaskAddBtn').addEventListener('click', () => {
        const titleInput = document.getElementById('cpTaskNewTitle');
        const dueInput = document.getElementById('cpTaskNewDue');
        const title = titleInput.value.trim();
        if (!title) return;
        cpItemsTasks.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 7), title, completed: false, dueDate: dueInput.value || null, priority: 'normal' });
        titleInput.value = ''; dueInput.value = '';
        renderCpTasks();
    });

    function renderCpContentFolderLink() {
        const url = document.getElementById('cpContentFolderUrl').value.trim();
        const row = document.getElementById('cpContentFolderLinkRow');
        if (url && isSafeHttpUrl(url)) { row.style.display = 'block'; } else { row.style.display = 'none'; }
    }
    document.getElementById('cpContentFolderUrl').addEventListener('input', renderCpContentFolderLink);
    document.getElementById('cpOpenContentFolder').addEventListener('click', () => {
        const url = document.getElementById('cpContentFolderUrl').value.trim();
        if (url && isSafeHttpUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
    });

    async function openProjectDetail({ project = null, client = null, lead = null, quote = null, prefill = null, duplicateNote = '' } = {}) {
        // Sync any linked review's live status first (Part X) — only writes
        // when the status genuinely changed, so this can never loop.
        if (project && project.linkedReviewId) {
            project = await syncLinkedReviewStatus(project);
        }
        document.getElementById('cpFormMsg').textContent = '';
        const dupNoteEl = document.getElementById('cpDuplicateConversionNote');
        if (duplicateNote) { dupNoteEl.textContent = duplicateNote; dupNoteEl.style.display = 'block'; }
        else { dupNoteEl.style.display = 'none'; }

        document.getElementById('cpProjectId').value = project ? project.id : '';
        document.getElementById('cpHeading').textContent = project ? `Edit: ${project.projectName}` : 'New Client Project';

        const resolvedClientId = project ? project.clientId : (client ? client.id : '');
        const resolvedClient = project ? (allClients.find(c => c.id === project.clientId) || null) : client;
        document.getElementById('cpClientId').value = resolvedClientId || '';

        const clientDisplay = document.getElementById('cpClientDisplay');
        clientDisplay.innerHTML = resolvedClient
            ? `<strong>${escapeHtml(resolvedClient.name)}</strong>${resolvedClient.businessName ? ' — ' + escapeHtml(resolvedClient.businessName) : ''}`
            : '<span style="color:var(--text-lo);">No client linked yet.</span>';
        renderCpContactActions(resolvedClient);

        const resolvedLeadId = project ? (project.leadId || '') : (lead ? lead.id : '');
        const resolvedQuoteId = project ? (project.quoteId || '') : (quote ? quote.id : '');
        const resolvedQuoteNumber = project ? (project.quoteNumber || '') : (quote ? quote.quoteNumber : '');
        document.getElementById('cpLeadId').value = resolvedLeadId;
        document.getElementById('cpQuoteId').value = resolvedQuoteId;
        document.getElementById('cpQuoteNumber').value = resolvedQuoteNumber;
        document.getElementById('cpQuoteLinkRow').style.display = resolvedQuoteId ? 'block' : 'none';
        document.getElementById('cpViewQuoteLink').textContent = resolvedQuoteNumber ? `View related quote (${resolvedQuoteNumber}) →` : 'View related quote →';
        document.getElementById('cpLeadLinkRow').style.display = resolvedLeadId ? 'block' : 'none';

        document.getElementById('cpProjectName').value = project ? (project.projectName || '') : (prefill ? (prefill.projectName || '') : '');
        const typeSelect = document.getElementById('cpProjectType');
        const prefillType = project ? (project.projectType || '') : (prefill ? (prefill.projectName || '') : '');
        const validTypes = [...typeSelect.options].map(o => o.value);
        typeSelect.value = validTypes.includes(prefillType) ? prefillType : 'Other';
        document.getElementById('cpDescription').value = project ? (project.description || '') : (prefill ? (prefill.description || '') : '');
        document.getElementById('cpPriority').value = project ? (project.priority || 'normal') : 'normal';

        document.getElementById('cpStartDate').value = project && project.startDate ? tsToDateInput(project.startDate) : '';
        document.getElementById('cpTargetDate').value = project && project.targetDate ? tsToDateInput(project.targetDate) : '';
        document.getElementById('cpStage').value = project ? (project.stage || 'awaiting_content') : 'awaiting_content';
        cpPreviousStageValue = document.getElementById('cpStage').value;
        document.getElementById('cpProgress').value = project ? clampProgress(project.progress) : 0;
        updateCpProgressBar();
        renderCpDeadlineWarningFromForm();

        document.getElementById('cpContractValue').value = project ? (project.contractValue || 0) : (prefill && prefill.contractValue ? prefill.contractValue : 0);
        document.getElementById('cpDepositRequired').value = project ? (project.depositRequired || 0) : 0;
        document.getElementById('cpPaymentArrangement').value = project ? (project.paymentArrangement || '') : (prefill ? (prefill.paymentArrangement || '') : '');

        cpItemsPayments = project ? (project.payments || []).map(p => ({ ...p })) : [];
        cpItemsChecklist = project ? (project.contentChecklist || []).map(i => ({ ...i })) : [];
        cpItemsTasks = project ? (project.tasks || []).map(t => ({ ...t })) : [];
        renderCpPayments();
        renderCpFinancials();
        renderCpChecklist();
        renderCpTasks();

        document.getElementById('cpContentFolderUrl').value = project ? (project.contentFolderUrl || '') : '';
        renderCpContentFolderLink();
        document.getElementById('cpLiveWebsiteUrl').value = project ? (project.liveWebsiteUrl || '') : '';
        document.getElementById('cpInternalNotes').value = project ? (project.internalNotes || '') : '';
        document.getElementById('cpPortalEnabled').checked = project ? !!project.portalEnabled : false;

        // Milestone 19 additions
        cpItemsCompletion = project ? (project.completionChecklist || []).map(i => ({ ...i })) : [];
        renderCpCompletion();
        const completedAtRow = document.getElementById('cpCompletedAtRow');
        if (project && project.completedAt) {
            document.getElementById('cpCompletedAtText').textContent = formatDateOnly(project.completedAt);
            completedAtRow.style.display = 'block';
        } else {
            completedAtRow.style.display = 'none';
        }
        renderCpPortfolioSection(project);
        renderCpReviewSection(project);
        renderCpInvoicesList(project);

        document.getElementById('cpModalOverlay').classList.add('active');
    }

    function renderCpInvoicesList(project) {
        const list = document.getElementById('cpInvoicesList');
        if (!project) { list.innerHTML = '<p class="empty-note">Save this project first to create invoices.</p>'; return; }
        const projectInvoices = allInvoices.filter(inv => inv.clientProjectId === project.id);
        if (!projectInvoices.length) { list.innerHTML = '<p class="empty-note">No invoices yet for this project.</p>'; return; }
        list.innerHTML = '';
        projectInvoices.forEach(inv => {
            const disp = displayInvoiceStatus(inv);
            const row = document.createElement('div');
            row.className = 'invoice-row';
            row.innerHTML = `
                <div class="info"><strong>${escapeHtml(inv.invoiceNumber)}</strong><span>${escapeHtml(inv.title || '')}</span></div>
                <div class="amount-col">${formatRand(inv.total)}</div>
                <span class="status-badge status-${escapeHtml(disp)}">${escapeHtml(INVOICE_DISPLAY_LABELS[disp] || disp)}</span>
            `;
            row.addEventListener('click', () => {
                document.getElementById('cpModalOverlay').classList.remove('active');
                openInvoicePreview(inv.id);
            });
            list.appendChild(row);
        });
    }

    function startInvoiceFromProject(invoiceType) {
        const editingId = document.getElementById('cpProjectId').value;
        const project = editingId ? allClientProjects.find(p => p.id === editingId) : null;
        if (!project) { alert('Please save this project first, then create an invoice from here.'); return; }
        const client = allClients.find(c => c.id === project.clientId) || null;
        document.getElementById('cpModalOverlay').classList.remove('active');
        const typeLabel = invoiceType.charAt(0).toUpperCase() + invoiceType.slice(1);
        const prefill = { title: `${typeLabel} — ${project.projectName}`, paymentArrangement: project.paymentArrangement };
        if (invoiceType === 'final') {
            // Suggest the remaining agreed amount (contract value minus every
            // still-active invoice already raised on this project) as a
            // starting line item — fully editable, never forced (Part 20G).
            const contractValue = Math.max(0, Number(project.contractValue) || 0);
            const invoicedTotal = allInvoices
                .filter(inv => inv.clientProjectId === project.id && inv.workflowStatus !== 'cancelled')
                .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
            const remaining = Math.max(0, contractValue - invoicedTotal);
            prefill.items = [{ description: `Final balance — ${project.projectName}`, quantity: 1, unitPrice: remaining }];
        }
        openInvoiceBuilder({
            client, clientProject: project,
            quote: project.quoteId ? { id: project.quoteId, quoteNumber: project.quoteNumber } : null,
            invoiceType, prefill
        });
    }
    document.getElementById('cpNewDepositInvoiceBtn').addEventListener('click', () => startInvoiceFromProject('deposit'));
    document.getElementById('cpNewProgressInvoiceBtn').addEventListener('click', () => startInvoiceFromProject('progress'));
    document.getElementById('cpNewFinalInvoiceBtn').addEventListener('click', () => startInvoiceFromProject('final'));

    document.getElementById('cpModalClose').addEventListener('click', () => document.getElementById('cpModalOverlay').classList.remove('active'));
    document.getElementById('cpModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'cpModalOverlay') document.getElementById('cpModalOverlay').classList.remove('active'); });
    document.getElementById('cpViewQuoteLink').addEventListener('click', () => {
        const quoteId = document.getElementById('cpQuoteId').value;
        if (!quoteId) return;
        document.getElementById('cpModalOverlay').classList.remove('active');
        openQuotePreview(quoteId);
    });
    document.getElementById('cpViewLeadLink').addEventListener('click', () => {
        const leadId = document.getElementById('cpLeadId').value;
        if (!leadId) return;
        document.getElementById('cpModalOverlay').classList.remove('active');
        openLeadDetail(leadId);
    });

    async function saveClientProject() {
        const msg = document.getElementById('cpFormMsg');
        const projectName = document.getElementById('cpProjectName').value.trim();
        const clientId = document.getElementById('cpClientId').value;
        if (!projectName) { msg.textContent = '⚠️ Project name is required.'; msg.className = 'form-msg error'; return null; }
        if (!clientId) { msg.textContent = '⚠️ This project needs a linked client.'; msg.className = 'form-msg error'; return null; }

        const folderUrl = document.getElementById('cpContentFolderUrl').value.trim();
        if (folderUrl && !isSafeHttpUrl(folderUrl)) { msg.textContent = '⚠️ Content Folder URL must start with http:// or https://'; msg.className = 'form-msg error'; return null; }
        const liveWebsiteUrl = document.getElementById('cpLiveWebsiteUrl').value.trim();
        if (liveWebsiteUrl && !isSafeHttpUrl(liveWebsiteUrl)) { msg.textContent = '⚠️ Live Website URL must start with http:// or https://'; msg.className = 'form-msg error'; return null; }

        const { contractValue, depositRequired, amountPaid, balance } = renderCpFinancials();
        let paymentStatus;
        if (amountPaid <= 0.001) paymentStatus = 'not_paid';
        else if (balance > 0.001) paymentStatus = 'partial';
        else if (Math.abs(balance) <= 0.001) paymentStatus = 'paid';
        else paymentStatus = 'overpaid';

        const stage = document.getElementById('cpStage').value;
        const progress = clampProgress(document.getElementById('cpProgress').value);
        const editingId = document.getElementById('cpProjectId').value;
        const existingProject = editingId ? allClientProjects.find(p => p.id === editingId) : null;

        const record = {
            clientId,
            leadId: document.getElementById('cpLeadId').value || null,
            quoteId: document.getElementById('cpQuoteId').value || null,
            quoteNumber: document.getElementById('cpQuoteNumber').value || null,
            projectName,
            projectType: document.getElementById('cpProjectType').value,
            description: document.getElementById('cpDescription').value.trim(),
            stage,
            priority: document.getElementById('cpPriority').value,
            progress,
            startDate: document.getElementById('cpStartDate').value ? fsMod.Timestamp.fromDate(new Date(document.getElementById('cpStartDate').value)) : null,
            targetDate: document.getElementById('cpTargetDate').value ? fsMod.Timestamp.fromDate(new Date(document.getElementById('cpTargetDate').value)) : null,
            contractValue, depositRequired, amountPaid, balance, paymentStatus,
            paymentArrangement: document.getElementById('cpPaymentArrangement').value.trim(),
            payments: cpItemsPayments,
            contentChecklist: cpItemsChecklist,
            tasks: cpItemsTasks,
            contentFolderUrl: folderUrl || null,
            liveWebsiteUrl: liveWebsiteUrl || null,
            internalNotes: document.getElementById('cpInternalNotes').value,
            completionChecklist: cpItemsCompletion,
            portfolioPermission: document.getElementById('cpPortfolioPermission').value,
            portfolioPermissionNote: document.getElementById('cpPortfolioPermissionNote').value.trim(),
            publicPortfolioSummary: document.getElementById('cpPublicPortfolioSummary').value.trim(),
            portalEnabled: document.getElementById('cpPortalEnabled').checked,
            updatedAt: fsMod.serverTimestamp()
        };

        // portfolioPermissionUpdatedAt only bumps when the permission value
        // actually changed — never on every unrelated save.
        if (!existingProject || existingProject.portfolioPermission !== record.portfolioPermission) {
            record.portfolioPermissionUpdatedAt = fsMod.serverTimestamp();
        }

        // completedAt recorded once, never silently lost if the stage later
        // moves away from Completed (Part E/AJ).
        if (stage === 'completed' && !(existingProject && existingProject.completedAt)) {
            record.completedAt = fsMod.serverTimestamp();
        } else if (existingProject && existingProject.completedAt) {
            record.completedAt = existingProject.completedAt;
        }

        try {
            let projectId = editingId;
            if (editingId) {
                // quoteNumber/createdAt/createdBy are never in `record` for an
                // edit, so updateDoc can never silently overwrite them.
                await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', editingId), record);
            } else {
                record.createdAt = fsMod.serverTimestamp();
                record.createdBy = auth.currentUser.uid;
                const docRef = fsMod.doc(fsMod.collection(db, 'clientProjects'));
                await fsMod.setDoc(docRef, record);
                projectId = docRef.id;

                // Back-links (Part M) — adds two fields only, never touches
                // any other existing lead/quote data.
                if (record.leadId) {
                    fsMod.updateDoc(fsMod.doc(db, 'leads', record.leadId), { clientId, clientProjectId: projectId, updatedAt: fsMod.serverTimestamp() }).catch(() => {});
                }
                if (record.quoteId) {
                    fsMod.updateDoc(fsMod.doc(db, 'quotes', record.quoteId), { clientId, clientProjectId: projectId, updatedAt: fsMod.serverTimestamp() }).catch(() => {});
                }
            }
            msg.textContent = '✅ Project saved.';
            msg.className = 'form-msg success';
            await loadClientProjects();
            if (record.leadId) await loadLeads();
            if (record.quoteId) await loadQuotes();
            const savedProject = allClientProjects.find(p => p.id === projectId);
            if (savedProject) await syncClientPortalProject(savedProject);
            return projectId;
        } catch (err) {
            console.error(err);
            msg.textContent = '❌ Could not save project: ' + err.message;
            msg.className = 'form-msg error';
            return null;
        }
    }
    document.getElementById('cpSaveBtn').addEventListener('click', async () => {
        const id = await saveClientProject();
        if (id) document.getElementById('cpModalOverlay').classList.remove('active');
    });
    document.getElementById('cpDeleteBtn').addEventListener('click', async () => {
        const editingId = document.getElementById('cpProjectId').value;
        if (!editingId) { document.getElementById('cpModalOverlay').classList.remove('active'); return; }
        if (!confirm('Delete this client project permanently? This cannot be undone.')) return;
        try {
            await fsMod.deleteDoc(fsMod.doc(db, 'clientProjects', editingId));
            document.getElementById('cpModalOverlay').classList.remove('active');
            loadClientProjects();
        } catch (err) {
            alert('Could not delete project: ' + err.message);
        }
    });

    /* ── Quote/Lead → Client Project conversion (Parts J, K, L, M) ── */

    async function startProjectFromQuote(quote) {
        const match = await findMatchingClient(quote.clientEmail, quote.clientPhone);
        let client, duplicateNote = '';
        if (match) {
            client = match;
            duplicateNote = `Existing client found: ${match.name}${match.businessName ? ' (' + match.businessName + ')' : ''} — linked automatically.`;
        } else {
            const clientRef = fsMod.doc(fsMod.collection(db, 'clients'));
            const clientRecord = {
                name: quote.clientName, businessName: quote.businessName || null,
                email: quote.clientEmail || null, phone: quote.clientPhone || null,
                alternativePhone: null, website: null, status: 'active',
                sourceLeadId: quote.leadId || null, createdFromQuoteId: quote.id, notes: '',
                createdAt: fsMod.serverTimestamp(), updatedAt: fsMod.serverTimestamp(), createdBy: auth.currentUser.uid
            };
            await fsMod.setDoc(clientRef, clientRecord);
            client = { id: clientRef.id, ...clientRecord };
            await loadClients();
        }
        openProjectDetail({
            client, quote, lead: quote.leadId ? { id: quote.leadId } : null,
            prefill: { projectName: quote.title, description: quote.description, contractValue: quote.total, paymentArrangement: quote.paymentArrangement },
            duplicateNote
        });
    }

    async function startProjectFromLead(lead) {
        const match = await findMatchingClient(lead.email, lead.phone);
        let client, duplicateNote = '';
        if (match) {
            client = match;
            duplicateNote = `Existing client found: ${match.name}${match.businessName ? ' (' + match.businessName + ')' : ''} — linked automatically.`;
        } else {
            const clientRef = fsMod.doc(fsMod.collection(db, 'clients'));
            const clientRecord = {
                name: lead.name, businessName: null, email: lead.email || null, phone: lead.phone || null,
                alternativePhone: null, website: null, status: 'active',
                sourceLeadId: lead.id, createdFromQuoteId: null, notes: '',
                createdAt: fsMod.serverTimestamp(), updatedAt: fsMod.serverTimestamp(), createdBy: auth.currentUser.uid
            };
            await fsMod.setDoc(clientRef, clientRecord);
            client = { id: clientRef.id, ...clientRecord };
            await loadClients();
        }
        openProjectDetail({
            client, quote: null, lead,
            prefill: { projectName: lead.packageInterest || lead.serviceInterest || '', description: lead.message || '' },
            duplicateNote
        });
    }

    document.getElementById('qpStartProjectBtn').addEventListener('click', async () => {
        const quote = allQuotes.find(q => q.id === activeQuoteId);
        if (!quote) return;
        const existing = allClientProjects.find(p => p.quoteId === quote.id);
        document.getElementById('quotePreviewOverlay').classList.remove('active');
        if (existing) { openProjectDetail({ project: existing }); return; }
        await startProjectFromQuote(quote);
    });

    document.getElementById('qpCreateInvoiceBtn').addEventListener('click', () => {
        const quote = allQuotes.find(q => q.id === activeQuoteId);
        if (!quote) return;
        document.getElementById('quotePreviewOverlay').classList.remove('active');
        const linkedProject = allClientProjects.find(p => p.quoteId === quote.id) || null;
        openInvoiceBuilder({
            quote,
            client: quote.clientId ? (allClients.find(c => c.id === quote.clientId) || null) : null,
            clientProject: linkedProject,
            prefill: {
                title: quote.title,
                description: quote.description,
                items: (quote.items || []).map(it => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })),
                discountType: quote.discountType,
                discountValue: quote.discountValue,
                paymentArrangement: quote.paymentArrangement
            }
        });
    });

    document.getElementById('lmStartProjectBtn').addEventListener('click', async () => {
        const lead = allLeads.find(l => l.id === activeLeadId);
        if (!lead) return;
        const existing = allClientProjects.find(p => p.leadId === lead.id);
        closeLeadModal();
        if (existing) { openProjectDetail({ project: existing }); return; }
        await startProjectFromLead(lead);
    });

    /* ============================================================
       COMPLETION CHECKLIST (Milestone 19, Part D)
       Separate from contentChecklist/tasks. 3-state: pending / completed
       / not_applicable — "Not Applicable" counts as resolved.
       ============================================================ */

    function renderCpCompletion() {
        const list = document.getElementById('cpCompletionList');
        const resolved = cpItemsCompletion.filter(i => i.status === 'completed' || i.status === 'na').length;
        document.getElementById('cpCompletionProgress').textContent = `${resolved} of ${cpItemsCompletion.length} resolved`;
        if (!cpItemsCompletion.length) { list.innerHTML = '<p class="empty-note">No completion checklist items yet.</p>'; return; }
        list.innerHTML = '';
        cpItemsCompletion.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'completion-item' + (item.status === 'completed' ? ' completed' : item.status === 'na' ? ' na' : '');

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.label;
            row.appendChild(label);

            const select = document.createElement('select');
            [['pending', 'Pending'], ['completed', 'Completed'], ['na', 'Not Applicable']].forEach(([value, text]) => {
                const opt = document.createElement('option');
                opt.value = value; opt.textContent = text;
                if (item.status === value) opt.selected = true;
                select.appendChild(opt);
            });
            select.addEventListener('change', (e) => { cpItemsCompletion[idx].status = e.target.value; renderCpCompletion(); });
            row.appendChild(select);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button'; removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => { cpItemsCompletion.splice(idx, 1); renderCpCompletion(); });
            row.appendChild(removeBtn);

            const noteInput = document.createElement('input');
            noteInput.type = 'text'; noteInput.className = 'note-input'; noteInput.maxLength = 200;
            noteInput.placeholder = 'Optional note…';
            noteInput.value = item.note || '';
            noteInput.addEventListener('input', (e) => { cpItemsCompletion[idx].note = e.target.value; });
            row.appendChild(noteInput);

            list.appendChild(row);
        });
    }
    document.getElementById('cpCompletionAddBtn').addEventListener('click', () => {
        const input = document.getElementById('cpCompletionNewItem');
        const label = input.value.trim();
        if (!label) return;
        cpItemsCompletion.push({ id: 'k' + Date.now() + Math.random().toString(36).slice(2, 7), label, status: 'pending', note: '', custom: true });
        input.value = '';
        renderCpCompletion();
    });
    document.getElementById('cpCompletionStarterBtn').addEventListener('click', () => {
        const existingLabels = new Set(cpItemsCompletion.map(i => i.label.toLowerCase()));
        COMPLETION_STARTER_ITEMS.forEach((label, i) => {
            if (!existingLabels.has(label.toLowerCase())) {
                cpItemsCompletion.push({ id: 'k' + Date.now() + i, label, status: 'pending', note: '', custom: false });
            }
        });
        renderCpCompletion();
    });

    /* ============================================================
       COMPLETION SUMMARY — preview + print (Milestone 19, Parts G/H)
       Deliberately excludes: internal notes, payment amounts/refs,
       Firebase document IDs, lead IDs, admin UID — see Part H.
       ============================================================ */

    function openCompletionSummary() {
        const editingId = document.getElementById('cpProjectId').value;
        const project = editingId ? allClientProjects.find(p => p.id === editingId) : null;
        if (!project) { alert('Please save this project first.'); return; }
        const client = allClients.find(c => c.id === project.clientId);

        const completedText = project.completedAt ? formatDateOnly(project.completedAt) : 'Not yet completed';
        document.getElementById('csCompletedDate').textContent = completedText;
        document.getElementById('csCompletedDate2').textContent = completedText;

        const clientBlock = document.getElementById('csClientBlock');
        clientBlock.innerHTML = '';
        [client ? client.name : null, client ? client.businessName : null].filter(Boolean).forEach(line => {
            const p = document.createElement('div'); p.textContent = line; clientBlock.appendChild(p);
        });
        if (!client) { const p = document.createElement('div'); p.textContent = '—'; clientBlock.appendChild(p); }

        document.getElementById('csProjectName').textContent = project.projectName || '';
        document.getElementById('csProjectMeta').textContent = project.projectType || '';
        // Prefer the explicitly-reviewed public summary over the private
        // working description — the private one may contain internal
        // shorthand not meant for a client-facing handover document.
        document.getElementById('csDescription').textContent = project.publicPortfolioSummary || project.description || '';

        document.getElementById('csStartDate').textContent = project.startDate ? formatDateOnly(project.startDate) : '—';
        document.getElementById('csTargetDate').textContent = project.targetDate ? formatDateOnly(project.targetDate) : '—';
        document.getElementById('csStage').textContent = STAGE_LABELS[project.stage] || project.stage;

        const checklistList = document.getElementById('csChecklistList');
        checklistList.innerHTML = '';
        const items = project.completionChecklist || [];
        if (!items.length) {
            const li = document.createElement('li'); li.textContent = 'No completion checklist recorded.'; checklistList.appendChild(li);
        } else {
            items.forEach(item => {
                const li = document.createElement('li');
                const mark = item.status === 'completed' ? '✅' : item.status === 'na' ? '➖ N/A' : '⬜';
                li.textContent = `${mark} ${item.label}`;
                checklistList.appendChild(li);
            });
        }

        document.getElementById('completionSummaryOverlay').classList.add('active');
    }
    document.getElementById('cpPreviewSummaryBtn').addEventListener('click', openCompletionSummary);
    document.getElementById('completionSummaryClose').addEventListener('click', () => document.getElementById('completionSummaryOverlay').classList.remove('active'));
    document.getElementById('completionSummaryOverlay').addEventListener('click', (e) => { if (e.target.id === 'completionSummaryOverlay') document.getElementById('completionSummaryOverlay').classList.remove('active'); });
    document.getElementById('csPrintBtn').addEventListener('click', () => window.print());

    /* ============================================================
       PORTFOLIO WORKFLOW (Milestone 19, Parts I–P)
       Never automatic. Reuses the EXISTING Portfolio Project editor
       (#projectForm) rather than building a second portfolio system.
       New drafts always start unpublished — enforced here regardless
       of permission state.
       ============================================================ */

    function renderCpPortfolioSection(project) {
        document.getElementById('cpPortfolioPermission').value = project ? (project.portfolioPermission || 'not_asked') : 'not_asked';
        document.getElementById('cpPortfolioPermissionNote').value = project ? (project.portfolioPermissionNote || '') : '';
        document.getElementById('cpPublicPortfolioSummary').value = project ? (project.publicPortfolioSummary || '') : '';

        const badge = document.getElementById('cpPortfolioStatusBadge');
        const draftLinkRow = document.getElementById('cpPortfolioDraftLinkRow');
        const prepareBtn = document.getElementById('cpPreparePortfolioBtn');
        const permission = project ? (project.portfolioPermission || 'not_asked') : 'not_asked';

        if (!project || !project.portfolioProjectId) {
            draftLinkRow.style.display = 'none';
            if (permission === 'declined') {
                badge.textContent = 'Permission Declined'; badge.className = 'workflow-status-badge declined';
                prepareBtn.style.display = 'none'; // not offered as a normal primary action (Part AH)
            } else if (permission === 'granted') {
                badge.textContent = 'Ready to Prepare'; badge.className = 'workflow-status-badge ok';
                prepareBtn.style.display = 'inline-flex';
            } else {
                badge.textContent = 'Permission Not Asked'; badge.className = 'workflow-status-badge neutral';
                prepareBtn.style.display = 'inline-flex';
            }
        } else {
            prepareBtn.style.display = 'none';
            draftLinkRow.style.display = 'block';
            const linked = allProjects.find(p => p.id === project.portfolioProjectId);
            if (!linked) {
                badge.textContent = 'Draft Prepared (link may be stale)'; badge.className = 'workflow-status-badge pending';
            } else if (linked.published) {
                badge.textContent = 'Published'; badge.className = 'workflow-status-badge ok';
            } else {
                badge.textContent = 'Draft Prepared'; badge.className = 'workflow-status-badge pending';
            }
        }
    }

    document.getElementById('cpPreparePortfolioBtn').addEventListener('click', () => {
        const editingId = document.getElementById('cpProjectId').value;
        const project = editingId ? allClientProjects.find(p => p.id === editingId) : null;
        if (!project) { alert('Please save this client project first.'); return; }
        if (project.portfolioProjectId) {
            alert('Portfolio Draft Already Prepared — use "Open Portfolio Project" to edit it.');
            return;
        }
        const permission = document.getElementById('cpPortfolioPermission').value;
        if (permission !== 'granted') {
            alert('Portfolio Permission must be set to "Granted" before preparing a draft.');
            return;
        }
        if (!confirm('THIS INFORMATION MAY BECOME PUBLIC once you review and deliberately publish it below. Continue to the Portfolio Project editor?')) return;

        const client = allClients.find(c => c.id === project.clientId);
        pendingPortfolioSourceProjectId = project.id;
        resetForm();
        document.getElementById('pBusiness').value = (client && (client.businessName || client.name)) || project.projectName;
        document.getElementById('pSlug').value = '';
        const catSelect = document.getElementById('pCategory');
        const validCats = [...catSelect.options].map(o => o.value);
        catSelect.value = validCats.includes(project.projectType) ? project.projectType : 'Business Website';
        document.getElementById('pDescription').value = document.getElementById('cpPublicPortfolioSummary').value.trim();
        document.getElementById('pServices').value = '';
        document.getElementById('pLiveUrl').value = document.getElementById('cpLiveWebsiteUrl').value.trim();
        document.getElementById('pCaseStudyUrl').value = '';
        document.getElementById('pPublished').checked = false; // ALWAYS false — Part L
        document.getElementById('pFeatured').checked = false;

        document.getElementById('cpModalOverlay').classList.remove('active');
        formTitle.textContent = 'Add a Project (Portfolio Draft — review before publishing)';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('cpOpenPortfolioDraft').addEventListener('click', () => {
        const editingId = document.getElementById('cpProjectId').value;
        const project = editingId ? allClientProjects.find(p => p.id === editingId) : null;
        if (!project || !project.portfolioProjectId) return;
        const linked = allProjects.find(p => p.id === project.portfolioProjectId);
        if (!linked) {
            if (confirm('The linked portfolio project could not be found — it may have been deleted. Clear the stale link so you can prepare a new draft?')) {
                fsMod.updateDoc(fsMod.doc(db, 'clientProjects', project.id), { portfolioProjectId: null, updatedAt: fsMod.serverTimestamp() }).then(() => {
                    loadClientProjects();
                    document.getElementById('cpModalOverlay').classList.remove('active');
                });
            }
            return;
        }
        document.getElementById('cpModalOverlay').classList.remove('active');
        document.getElementById('pId').value = linked.id;
        document.getElementById('pBusiness').value = linked.businessName || '';
        document.getElementById('pSlug').value = linked.slug || '';
        document.getElementById('pCategory').value = linked.category || 'Business Website';
        document.getElementById('pSortOrder').value = linked.sortOrder ?? 0;
        document.getElementById('pDescription').value = linked.description || '';
        document.getElementById('pServices').value = (linked.services || []).join(', ');
        document.getElementById('pLiveUrl').value = linked.liveUrl || '';
        document.getElementById('pCaseStudyUrl').value = linked.caseStudyUrl || '';
        document.getElementById('pPublished').checked = !!linked.published;
        document.getElementById('pFeatured').checked = !!linked.featured;
        formTitle.textContent = 'Edit Project';
        document.getElementById('projectSubmitBtn').textContent = 'Save Changes';
        document.getElementById('projectCancelEditBtn').style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ============================================================
       CLIENT REVIEW REQUEST (Milestone 19, Parts Q–X)
       Never creates or approves a review directly — only the existing
       public review form + existing admin Reviews approval process can
       do that (Part AL).
       ============================================================ */

    function cpCurrentClientForReview() {
        const clientId = document.getElementById('cpClientId').value;
        return allClients.find(c => c.id === clientId) || null;
    }

    function renderCpReviewSection(project) {
        const status = project ? (project.reviewRequestStatus || 'not_requested') : 'not_requested';
        const badge = document.getElementById('cpReviewStatusBadge');
        const cls = status === 'approved' ? 'ok' : status === 'declined' ? 'declined' : (status === 'requested' || status === 'submitted') ? 'pending' : 'neutral';
        badge.textContent = REVIEW_REQUEST_LABELS[status] || status;
        badge.className = 'workflow-status-badge ' + cls;

        document.getElementById('cpReviewTimingHint').style.display = (project && project.stage === 'completed') ? 'none' : 'block';
        document.getElementById('cpLinkedReviewRow').style.display = (project && project.linkedReviewId) ? 'block' : 'none';
        document.getElementById('cpReviewMarkRequestedBtn').style.display = (status === 'approved') ? 'none' : 'inline-flex';
    }

    /* Reads the linked review's live status and syncs reviewRequestStatus
       only when it genuinely changed — comparing before writing is what
       prevents any circular-update loop (Part X). */
    async function syncLinkedReviewStatus(project) {
        if (!project || !project.linkedReviewId) return project;
        try {
            const reviewSnap = await fsMod.getDoc(fsMod.doc(db, 'reviews', project.linkedReviewId));
            if (!reviewSnap.exists()) return project;
            const review = reviewSnap.data();
            const update = {};
            if (review.status === 'approved' && project.reviewRequestStatus !== 'approved') {
                update.reviewRequestStatus = 'approved';
                if (!project.reviewApprovedAt) update.reviewApprovedAt = fsMod.serverTimestamp();
            } else if (review.status === 'rejected' && project.reviewRequestStatus !== 'declined') {
                update.reviewRequestStatus = 'declined';
            } else if (review.status === 'pending' && project.reviewRequestStatus !== 'submitted' && project.reviewRequestStatus !== 'approved') {
                update.reviewRequestStatus = 'submitted';
                if (!project.reviewSubmittedAt) update.reviewSubmittedAt = fsMod.serverTimestamp();
            }
            if (Object.keys(update).length) {
                update.updatedAt = fsMod.serverTimestamp();
                await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', project.id), update);
                const merged = { ...project, ...update };
                const idx = allClientProjects.findIndex(p => p.id === project.id);
                if (idx !== -1) allClientProjects[idx] = merged;
                return merged;
            }
        } catch (err) {
            console.warn('Could not sync linked review status:', err.message);
        }
        return project;
    }

    document.getElementById('cpReviewWhatsappBtn').addEventListener('click', () => {
        const client = cpCurrentClientForReview();
        const digits = client ? normalizePhoneForWa(client.phone) : null;
        if (!digits) { alert('This client has no valid phone number on file.'); return; }
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(reviewRequestMessage(client.name))}`, '_blank', 'noopener,noreferrer');
    });
    document.getElementById('cpReviewEmailBtn').addEventListener('click', () => {
        const client = cpCurrentClientForReview();
        if (!client || !client.email || !isValidEmail(client.email)) { alert('This client has no valid email on file.'); return; }
        const subject = 'Your experience with RM Digitals';
        window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reviewRequestMessage(client.name))}`;
    });
    document.getElementById('cpReviewCopyLinkBtn').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(reviewRequestUrl());
            alert('Review link copied to clipboard.');
        } catch {
            prompt('Copy this review link:', reviewRequestUrl());
        }
    });
    document.getElementById('cpReviewMarkRequestedBtn').addEventListener('click', async () => {
        const editingId = document.getElementById('cpProjectId').value;
        if (!editingId) { alert('Please save this project first.'); return; }
        if (!confirm('Mark this project as having a review request sent? (This only records that you sent it — use WhatsApp/Email above to actually contact the client first.)')) return;
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', editingId), { reviewRequestStatus: 'requested', reviewRequestedAt: fsMod.serverTimestamp(), updatedAt: fsMod.serverTimestamp() });
            await loadClientProjects();
            renderCpReviewSection(allClientProjects.find(p => p.id === editingId));
        } catch (err) {
            alert('Could not update review status: ' + err.message);
        }
    });
    document.getElementById('cpReviewLinkSubmittedBtn').addEventListener('click', async () => {
        const editingId = document.getElementById('cpProjectId').value;
        if (!editingId) { alert('Please save this project first.'); return; }
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'reviews'), fsMod.orderBy('createdAt', 'desc'), fsMod.limit(20));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            alert('Could not load reviews: ' + err.message);
            return;
        }
        const candidates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!candidates.length) { alert('No review records found yet.'); return; }
        const listText = candidates.map((r, i) => {
            const preview = (r.message || '').slice(0, 40) + ((r.message || '').length > 40 ? '…' : '');
            return `${i + 1}. ${r.name || '(no name)'} — ${r.status} — "${preview}"`;
        }).join('\n');
        const choice = prompt(`Which review matches this client? Enter a number:\n\n${listText}`);
        const idx = Number(choice) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) return;
        const selected = candidates[idx];
        try {
            const update = { linkedReviewId: selected.id, updatedAt: fsMod.serverTimestamp() };
            if (selected.status === 'pending') update.reviewRequestStatus = 'submitted';
            if (selected.status === 'approved') { update.reviewRequestStatus = 'approved'; update.reviewApprovedAt = fsMod.serverTimestamp(); }
            if (selected.status === 'rejected') update.reviewRequestStatus = 'declined';
            await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', editingId), update);
            await loadClientProjects();
            renderCpReviewSection(allClientProjects.find(p => p.id === editingId));
        } catch (err) {
            alert('Could not link review: ' + err.message);
        }
    });
    document.getElementById('cpViewLinkedReview').addEventListener('click', () => {
        const editingId = document.getElementById('cpProjectId').value;
        const project = editingId ? allClientProjects.find(p => p.id === editingId) : null;
        document.getElementById('cpModalOverlay').classList.remove('active');
        let tabStatus = 'pending';
        if (project) {
            if (project.reviewRequestStatus === 'approved') tabStatus = 'approved';
            else if (project.reviewRequestStatus === 'declined') tabStatus = 'rejected';
        }
        const tabBtn = document.querySelector(`.tab-btn[data-status="${tabStatus}"]`);
        if (tabBtn) tabBtn.click();
        document.getElementById('reviewList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ============================================================
       INVOICES & RECEIPTS (Milestone 20)
       Workflow: Quote -> Client Project -> Invoice -> Payment -> Receipt.
       No payment gateway anywhere here — payments are always manually
       recorded, same as the Client Project financials above. An
       invoice's Paid/Outstanding figures are NEVER stored, only ever
       computed live from the linked project's payments (matched by
       payment.invoiceId) — see computeInvoiceTotals()/displayInvoiceStatus()
       below, which is the one place that logic lives.
       ============================================================ */

    let allInvoices = [];
    let allReceipts = [];
    let ibItems = [];
    let activeInvoiceId = null;
    let activeReceiptId = null;

    function getInvoicePayments(invoice) {
        if (!invoice || !invoice.clientProjectId) return [];
        const project = allClientProjects.find(p => p.id === invoice.clientProjectId);
        if (!project) return [];
        return (project.payments || []).filter(p => p.invoiceId === invoice.id);
    }
    function computeInvoiceTotals(invoice) {
        const payments = getInvoicePayments(invoice);
        const paid = payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
        const total = Math.max(0, Number(invoice.total) || 0);
        return { paid, total, outstanding: total - paid, payments };
    }
    function isInvoiceOverdue(invoice, outstanding) {
        if (invoice.workflowStatus !== 'sent' || !invoice.dueDate || outstanding <= 0.001) return false;
        const due = invoice.dueDate.toDate ? invoice.dueDate.toDate() : new Date(invoice.dueDate);
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        return due.getTime() < startOfToday.getTime();
    }
    /* Live display status — draft/sent/cancelled are the only states ever
       WRITTEN (invoice.workflowStatus); part_paid/paid/overdue/overpaid are
       always DERIVED here so they can never go stale relative to the
       project's actual payments (Part 20H). */
    function displayInvoiceStatus(invoice) {
        if (invoice.workflowStatus === 'cancelled') return 'cancelled';
        if (invoice.workflowStatus === 'draft') return 'draft';
        const { paid, total, outstanding } = computeInvoiceTotals(invoice);
        if (paid > total + 0.001) return 'overpaid';
        if (outstanding <= 0.001) return 'paid';
        if (isInvoiceOverdue(invoice, outstanding)) return 'overdue';
        if (paid > 0.001) return 'part_paid';
        return 'sent';
    }

    async function generateInvoiceNumber() {
        const now = new Date();
        const year = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        for (let attempt = 0; attempt < 5; attempt++) {
            const suffix = String(Math.floor(Math.random() * 900) + 100);
            const candidate = `RMI-${year}-${mm}${dd}-${suffix}`;
            const dupeSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'invoices'), fsMod.where('invoiceNumber', '==', candidate)));
            if (dupeSnap.empty) return candidate;
        }
        return `RMI-${year}-${mm}${dd}-${Date.now().toString().slice(-4)}`;
    }
    async function generateReceiptNumber() {
        const now = new Date();
        const year = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        for (let attempt = 0; attempt < 5; attempt++) {
            const suffix = String(Math.floor(Math.random() * 900) + 100);
            const candidate = `RMR-${year}-${mm}${dd}-${suffix}`;
            const dupeSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'receipts'), fsMod.where('receiptNumber', '==', candidate)));
            if (dupeSnap.empty) return candidate;
        }
        return `RMR-${year}-${mm}${dd}-${Date.now().toString().slice(-4)}`;
    }

    async function loadInvoices() {
        const list = document.getElementById('invoiceList');
        list.innerHTML = '<p class="empty-note">Loading invoices…</p>';
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'invoices'), fsMod.orderBy('createdAt', 'desc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load invoices: ${escapeHtml(err.message)}</p>`;
            return;
        }
        allInvoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderInvoiceSummary();
        renderInvoiceList();
        refreshDashboard();
    }

    function renderInvoiceSummary() {
        const counts = { draft: 0, sent: 0, part_paid: 0, paid: 0, overdue: 0, cancelled: 0, overpaid: 0 };
        let openValue = 0, overdueValue = 0;
        allInvoices.forEach(inv => {
            const disp = displayInvoiceStatus(inv);
            if (counts.hasOwnProperty(disp)) counts[disp]++;
            if (disp !== 'cancelled' && disp !== 'paid') {
                const { outstanding } = computeInvoiceTotals(inv);
                openValue += Math.max(0, outstanding);
                if (disp === 'overdue') overdueValue += Math.max(0, outstanding);
            }
        });
        document.getElementById('isDraft').textContent = counts.draft;
        document.getElementById('isSent').textContent = counts.sent;
        document.getElementById('isPartPaid').textContent = counts.part_paid;
        document.getElementById('isPaid').textContent = counts.paid;
        document.getElementById('isOverdue').textContent = counts.overdue;
        document.getElementById('isTotalValue').textContent = formatRand(openValue);
        document.getElementById('isOverdueValue').textContent = formatRand(overdueValue);
    }

    function renderInvoiceList() {
        const list = document.getElementById('invoiceList');
        const searchTerm = (document.getElementById('invoiceSearch').value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('invoiceFilterStatus').value;
        const sortMode = document.getElementById('invoiceSort').value;

        let filtered = allInvoices.filter(inv => {
            const disp = displayInvoiceStatus(inv);
            if (statusFilter !== 'all' && disp !== statusFilter) return false;
            if (!searchTerm) return true;
            const haystack = [inv.invoiceNumber, inv.clientName, inv.businessName, inv.title].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });

        if (sortMode === 'due') {
            filtered = filtered.slice().sort((a, b) => {
                const ad = a.dueDate ? (a.dueDate.toDate ? a.dueDate.toDate().getTime() : new Date(a.dueDate).getTime()) : Infinity;
                const bd = b.dueDate ? (b.dueDate.toDate ? b.dueDate.toDate().getTime() : new Date(b.dueDate).getTime()) : Infinity;
                return ad - bd;
            });
        } else if (sortMode === 'amount') {
            filtered = filtered.slice().sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
        } else if (sortMode === 'status') {
            const order = ['overdue', 'sent', 'part_paid', 'draft', 'paid', 'overpaid', 'cancelled'];
            filtered = filtered.slice().sort((a, b) => order.indexOf(displayInvoiceStatus(a)) - order.indexOf(displayInvoiceStatus(b)));
        }

        if (allInvoices.length === 0) { list.innerHTML = '<p class="empty-note">No invoices yet. Create one from an accepted quote, a Client Project, or "New Invoice" above.</p>'; return; }
        if (filtered.length === 0) { list.innerHTML = '<p class="empty-note">No invoices match your search/filter.</p>'; return; }

        list.innerHTML = '';
        filtered.forEach(inv => {
            const disp = displayInvoiceStatus(inv);
            const row = document.createElement('div');
            row.className = 'invoice-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(inv.invoiceNumber)}</strong>
                    <span>${escapeHtml(inv.clientName || '')}${inv.businessName ? ' · ' + escapeHtml(inv.businessName) : ''} — ${escapeHtml(inv.title || '')}</span>
                </div>
                <div class="meta-col">${formatDate(inv.createdAt)}</div>
                <div class="amount-col">${formatRand(inv.total)}</div>
                <span class="status-badge status-${escapeHtml(disp)}">${escapeHtml(INVOICE_DISPLAY_LABELS[disp] || disp)}</span>
            `;
            row.addEventListener('click', () => openInvoicePreview(inv.id));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openInvoicePreview(inv.id); });
            list.appendChild(row);
        });
    }
    document.getElementById('invoiceSearch').addEventListener('input', renderInvoiceList);
    document.getElementById('invoiceFilterStatus').addEventListener('change', renderInvoiceList);
    document.getElementById('invoiceSort').addEventListener('change', renderInvoiceList);
    document.getElementById('invoiceNewBtn').addEventListener('click', () => openClientPicker((client) => openInvoiceBuilder({ client })));

    /* ── Invoice Builder ── */
    const ibQaSelect = document.getElementById('ibQuickAdd');
    QUICK_ADD_SERVICES.forEach((svc, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${svc.label} — ${formatRand(svc.price)}`;
        ibQaSelect.appendChild(opt);
    });

    function renderIbItems() {
        const list = document.getElementById('ibItemsList');
        const empty = document.getElementById('ibItemsEmpty');
        list.innerHTML = '';
        empty.style.display = ibItems.length ? 'none' : 'block';
        ibItems.forEach((item, idx) => {
            const qty = Math.max(0, Number(item.quantity) || 0);
            const price = Math.max(0, Number(item.unitPrice) || 0);
            const row = document.createElement('div');
            row.className = 'quote-item-row';
            row.innerHTML = `
                <input type="text" class="item-desc" value="${escapeHtml(item.description)}" maxlength="200" placeholder="Item description" />
                <input type="number" class="item-qty" min="0" step="1" value="${qty}" />
                <input type="number" class="item-price" min="0" step="0.01" value="${price}" />
                <span class="line-total">${formatRand(qty * price)}</span>
                <button type="button" class="remove-item" aria-label="Remove line item"><i class="fas fa-times"></i></button>
            `;
            row.querySelector('.item-desc').addEventListener('input', (e) => { ibItems[idx].description = e.target.value; });
            const recalcRow = () => {
                const q2 = Math.max(0, Number(ibItems[idx].quantity) || 0);
                const p2 = Math.max(0, Number(ibItems[idx].unitPrice) || 0);
                row.querySelector('.line-total').textContent = formatRand(q2 * p2);
                updateIbTotals();
            };
            row.querySelector('.item-qty').addEventListener('input', (e) => { ibItems[idx].quantity = e.target.value; recalcRow(); });
            row.querySelector('.item-price').addEventListener('input', (e) => { ibItems[idx].unitPrice = e.target.value; recalcRow(); });
            row.querySelector('.remove-item').addEventListener('click', () => { ibItems.splice(idx, 1); renderIbItems(); updateIbTotals(); });
            list.appendChild(row);
        });
    }
    function updateIbTotals() {
        const subtotal = ibItems.reduce((sum, it) => {
            const qty = Math.max(0, Number(it.quantity) || 0);
            const price = Math.max(0, Number(it.unitPrice) || 0);
            return sum + qty * price;
        }, 0);
        const discountType = document.getElementById('ibDiscountType').value;
        const discountValueRaw = Math.max(0, Number(document.getElementById('ibDiscountValue').value) || 0);
        let discountAmount = 0;
        if (discountType === 'percent') discountAmount = subtotal * Math.min(100, discountValueRaw) / 100;
        else if (discountType === 'fixed') discountAmount = discountValueRaw;
        discountAmount = Math.min(discountAmount, subtotal);
        const total = Math.max(0, subtotal - discountAmount);
        document.getElementById('ibSubtotalOut').textContent = formatRand(subtotal);
        document.getElementById('ibDiscountOut').textContent = formatRand(discountAmount);
        document.getElementById('ibTotalOut').textContent = formatRand(total);
        return { subtotal, discountAmount, total };
    }
    ibQaSelect.addEventListener('change', (e) => {
        const idx = Number(e.target.value);
        if (!Number.isNaN(idx) && QUICK_ADD_SERVICES[idx]) {
            const svc = QUICK_ADD_SERVICES[idx];
            ibItems.push({ description: svc.label, quantity: 1, unitPrice: svc.price });
            renderIbItems();
            updateIbTotals();
        }
        e.target.value = '';
    });
    document.getElementById('ibAddCustomItemBtn').addEventListener('click', () => {
        ibItems.push({ description: '', quantity: 1, unitPrice: 0 });
        renderIbItems();
        updateIbTotals();
    });
    document.getElementById('ibDiscountType').addEventListener('change', (e) => {
        const valueInput = document.getElementById('ibDiscountValue');
        valueInput.disabled = e.target.value === 'none';
        if (e.target.value === 'none') valueInput.value = 0;
        updateIbTotals();
    });
    document.getElementById('ibDiscountValue').addEventListener('input', updateIbTotals);

    function updateIbDepositHelperVisibility() {
        const projectId = document.getElementById('ibClientProjectId').value;
        const show = document.getElementById('ibInvoiceType').value === 'deposit' && !!projectId;
        document.getElementById('ibDepositHelper').style.display = show ? 'inline-block' : 'none';
        document.getElementById('ibDepositValue').style.display = show ? 'inline-block' : 'none';
        document.getElementById('ibDepositApplyBtn').style.display = show ? 'inline-block' : 'none';
    }
    document.getElementById('ibInvoiceType').addEventListener('change', updateIbDepositHelperVisibility);
    document.getElementById('ibDepositApplyBtn').addEventListener('click', () => {
        const projectId = document.getElementById('ibClientProjectId').value;
        const project = projectId ? allClientProjects.find(p => p.id === projectId) : null;
        if (!project) { alert('No linked Client Project to calculate a deposit from.'); return; }
        const mode = document.getElementById('ibDepositHelper').value;
        if (mode !== 'percent' && mode !== 'fixed') { alert('Choose percentage or fixed amount first.'); return; }
        const val = Math.max(0, Number(document.getElementById('ibDepositValue').value) || 0);
        const contractValue = Math.max(0, Number(project.contractValue) || 0);
        const amount = mode === 'percent' ? contractValue * Math.min(100, val) / 100 : val;
        ibItems.push({
            description: `Deposit (${mode === 'percent' ? val + '% of contract value' : 'fixed amount'}) — ${project.projectName}`,
            quantity: 1, unitPrice: Math.round(amount * 100) / 100
        });
        renderIbItems();
        updateIbTotals();
    });

    function openInvoiceBuilder({ invoice = null, client = null, clientProject = null, quote = null, invoiceType = null, prefill = null } = {}) {
        document.getElementById('ibFormMsg').textContent = '';
        document.getElementById('ibInvoiceId').value = invoice ? invoice.id : '';
        document.getElementById('ibInvoiceNumber').value = invoice ? invoice.invoiceNumber : '';
        document.getElementById('ibHeading').textContent = invoice ? `Edit Invoice ${invoice.invoiceNumber}` : 'New Invoice';

        const resolvedClientId = invoice ? (invoice.clientId || '') : (client ? client.id : '');
        const resolvedProjectId = invoice ? (invoice.clientProjectId || '') : (clientProject ? clientProject.id : '');
        const resolvedQuoteId = invoice ? (invoice.quoteId || '') : (quote ? quote.id : '');
        const resolvedQuoteNumber = invoice ? (invoice.quoteNumber || '') : (quote ? (quote.quoteNumber || '') : '');
        document.getElementById('ibClientId').value = resolvedClientId;
        document.getElementById('ibClientProjectId').value = resolvedProjectId;
        document.getElementById('ibQuoteId').value = resolvedQuoteId;
        document.getElementById('ibQuoteNumber').value = resolvedQuoteNumber;

        document.getElementById('ibClientName').value = invoice ? (invoice.clientName || '') : (client ? (client.name || '') : (quote ? (quote.clientName || '') : ''));
        document.getElementById('ibBusinessName').value = invoice ? (invoice.businessName || '') : (client ? (client.businessName || '') : (quote ? (quote.businessName || '') : ''));
        document.getElementById('ibClientEmail').value = invoice ? (invoice.clientEmail || '') : (client ? (client.email || '') : (quote ? (quote.clientEmail || '') : ''));
        document.getElementById('ibClientPhone').value = invoice ? (invoice.clientPhone || '') : (client ? (client.phone || '') : (quote ? (quote.clientPhone || '') : ''));

        document.getElementById('ibInvoiceType').value = invoice ? (invoice.invoiceType || 'standard') : (invoiceType || 'standard');
        document.getElementById('ibDueDate').value = invoice && invoice.dueDate ? tsToDateInput(invoice.dueDate) : defaultValidUntil();
        document.getElementById('ibTitle').value = invoice ? (invoice.title || '') : (prefill ? (prefill.title || '') : '');
        document.getElementById('ibDescription').value = invoice ? (invoice.description || '') : (prefill ? (prefill.description || '') : '');

        ibItems = invoice ? (invoice.items || []).map(it => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice }))
            : (prefill && prefill.items ? prefill.items.map(it => ({ ...it })) : []);
        document.getElementById('ibDiscountType').value = invoice ? (invoice.discountType || 'none') : (prefill && prefill.discountType ? prefill.discountType : 'none');
        document.getElementById('ibDiscountValue').value = invoice ? (invoice.discountValue || 0) : (prefill && prefill.discountValue ? prefill.discountValue : 0);
        document.getElementById('ibDiscountValue').disabled = document.getElementById('ibDiscountType').value === 'none';

        document.getElementById('ibPaymentArrangement').value = invoice ? (invoice.paymentArrangement || '') : (prefill ? (prefill.paymentArrangement || '') : (clientProject ? (clientProject.paymentArrangement || '') : ''));
        document.getElementById('ibPaymentInstructions').value = invoice ? (invoice.paymentInstructions || '') : '';
        document.getElementById('ibNotes').value = invoice ? (invoice.notes || '') : '';

        updateIbDepositHelperVisibility();

        // Previous-invoices / contract-value context note (Part 20E) — informs,
        // never blocks: the admin can still raise an invoice past contract value.
        const noteEl = document.getElementById('ibPreviousInvoicesNote');
        const project = clientProject || (resolvedProjectId ? allClientProjects.find(p => p.id === resolvedProjectId) : null);
        if (project) {
            const projectInvoices = allInvoices.filter(inv => inv.clientProjectId === project.id && inv.workflowStatus !== 'cancelled' && (!invoice || inv.id !== invoice.id));
            if (projectInvoices.length) {
                const invoicedTotal = projectInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
                noteEl.textContent = `This project already has ${projectInvoices.length} active invoice(s) totalling ${formatRand(invoicedTotal)} (contract value: ${formatRand(project.contractValue || 0)}).`;
                noteEl.style.display = 'block';
            } else {
                noteEl.style.display = 'none';
            }
        } else {
            noteEl.style.display = 'none';
        }

        renderIbItems();
        updateIbTotals();
        document.getElementById('invoiceBuilderOverlay').classList.add('active');
    }

    async function saveInvoiceFromBuilder({ andPreview = false } = {}) {
        const msg = document.getElementById('ibFormMsg');
        const clientName = document.getElementById('ibClientName').value.trim();
        const title = document.getElementById('ibTitle').value.trim();
        const dueDateStr = document.getElementById('ibDueDate').value;
        const email = document.getElementById('ibClientEmail').value.trim();

        if (!clientName) { msg.textContent = '⚠️ Client name is required.'; msg.className = 'form-msg error'; return null; }
        if (!title) { msg.textContent = '⚠️ Invoice title is required.'; msg.className = 'form-msg error'; return null; }
        if (!dueDateStr) { msg.textContent = '⚠️ Please set a due date.'; msg.className = 'form-msg error'; return null; }
        if (email && !isValidEmail(email)) { msg.textContent = '⚠️ That client email doesn\'t look valid.'; msg.className = 'form-msg error'; return null; }

        const items = ibItems
            .map(it => ({
                description: (it.description || '').toString().trim(),
                quantity: Math.max(0, Number(it.quantity) || 0),
                unitPrice: Math.max(0, Number(it.unitPrice) || 0)
            }))
            .filter(it => it.description || it.quantity || it.unitPrice)
            .map(it => ({ ...it, lineTotal: it.quantity * it.unitPrice }));

        const { subtotal, discountAmount, total } = updateIbTotals();
        const discountType = document.getElementById('ibDiscountType').value;
        const discountValue = Math.max(0, Number(document.getElementById('ibDiscountValue').value) || 0);
        const editingId = document.getElementById('ibInvoiceId').value;

        const record = {
            clientId: document.getElementById('ibClientId').value || null,
            clientName,
            businessName: document.getElementById('ibBusinessName').value.trim() || null,
            clientEmail: email || null,
            clientPhone: document.getElementById('ibClientPhone').value.trim() || null,
            clientProjectId: document.getElementById('ibClientProjectId').value || null,
            quoteId: document.getElementById('ibQuoteId').value || null,
            quoteNumber: document.getElementById('ibQuoteNumber').value || null,
            invoiceType: document.getElementById('ibInvoiceType').value,
            title,
            description: document.getElementById('ibDescription').value.trim(),
            items, subtotal, discountType, discountValue, discountAmount, total,
            dueDate: fsMod.Timestamp.fromDate(new Date(dueDateStr + 'T23:59:59')),
            paymentArrangement: document.getElementById('ibPaymentArrangement').value.trim(),
            paymentInstructions: document.getElementById('ibPaymentInstructions').value.trim(),
            notes: document.getElementById('ibNotes').value,
            updatedAt: fsMod.serverTimestamp()
        };

        try {
            let invoiceId = editingId;
            if (editingId) {
                // invoiceNumber, workflowStatus, issueDate, createdAt and the
                // sentAt/cancelledAt history are deliberately NOT in `record` —
                // editing an invoice can never silently overwrite its number,
                // status or history (same guarantee as editing a quote, Part W).
                await fsMod.updateDoc(fsMod.doc(db, 'invoices', editingId), record);
            } else {
                record.invoiceNumber = await generateInvoiceNumber();
                record.workflowStatus = 'draft';
                record.issueDate = fsMod.serverTimestamp();
                record.sentAt = null;
                record.cancelledAt = null;
                record.createdAt = fsMod.serverTimestamp();
                record.createdBy = auth.currentUser.uid;
                const docRef = fsMod.doc(fsMod.collection(db, 'invoices'));
                await fsMod.setDoc(docRef, record);
                invoiceId = docRef.id;
            }
            msg.textContent = '✅ Invoice saved.';
            msg.className = 'form-msg success';
            await loadInvoices();
            const savedInvoice = allInvoices.find(i => i.id === invoiceId);
            if (savedInvoice) await syncClientPortalInvoice(savedInvoice);
            if (andPreview) {
                document.getElementById('invoiceBuilderOverlay').classList.remove('active');
                openInvoicePreview(invoiceId);
            }
            return invoiceId;
        } catch (err) {
            console.error(err);
            msg.textContent = '❌ Could not save invoice: ' + err.message;
            msg.className = 'form-msg error';
            return null;
        }
    }

    document.getElementById('invoiceBuilderClose').addEventListener('click', () => document.getElementById('invoiceBuilderOverlay').classList.remove('active'));
    document.getElementById('invoiceBuilderOverlay').addEventListener('click', (e) => { if (e.target.id === 'invoiceBuilderOverlay') document.getElementById('invoiceBuilderOverlay').classList.remove('active'); });
    document.getElementById('ibSaveBtn').addEventListener('click', async () => {
        const id = await saveInvoiceFromBuilder({ andPreview: false });
        if (id) document.getElementById('invoiceBuilderOverlay').classList.remove('active');
    });
    document.getElementById('ibSaveAndPreviewBtn').addEventListener('click', () => saveInvoiceFromBuilder({ andPreview: true }));

    /* ── Invoice Preview / print / share / status / payments ── */
    function openInvoicePreview(id) {
        const invoice = allInvoices.find(i => i.id === id);
        if (!invoice) return;
        activeInvoiceId = id;
        const { paid, total, outstanding, payments } = computeInvoiceTotals(invoice);
        const disp = displayInvoiceStatus(invoice);

        const badge = document.getElementById('ipStatusBadge');
        badge.textContent = INVOICE_DISPLAY_LABELS[disp] || disp;
        badge.className = 'status-badge status-' + disp;
        document.getElementById('ipWorkflowSelect').value = invoice.workflowStatus;

        document.getElementById('ipTypeLabel').textContent = (invoice.invoiceType ? invoice.invoiceType.charAt(0).toUpperCase() + invoice.invoiceType.slice(1) : 'Standard') + ' Invoice';
        document.getElementById('ipInvoiceNumber').textContent = invoice.invoiceNumber;
        document.getElementById('ipIssueDate').textContent = invoice.issueDate ? formatDateOnly(invoice.issueDate) : '—';
        document.getElementById('ipDueDate').textContent = invoice.dueDate ? formatDateOnly(invoice.dueDate) : '—';

        const clientBlock = document.getElementById('ipClientBlock');
        clientBlock.innerHTML = '';
        [invoice.clientName, invoice.businessName, invoice.clientEmail, invoice.clientPhone].filter(Boolean).forEach(line => {
            const p = document.createElement('div'); p.textContent = line; clientBlock.appendChild(p);
        });

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

        const paSection = document.getElementById('ipPaymentArrangementSection');
        if (invoice.paymentArrangement) { paSection.style.display = 'block'; document.getElementById('ipPaymentArrangement').textContent = invoice.paymentArrangement; }
        else paSection.style.display = 'none';

        const piSection = document.getElementById('ipPaymentInstructionsSection');
        if (invoice.paymentInstructions) { piSection.style.display = 'block'; document.getElementById('ipPaymentInstructions').textContent = invoice.paymentInstructions; }
        else piSection.style.display = 'none'; // never fabricate banking info — blank shows nothing (Part P)

        const notesSection = document.getElementById('ipNotesSection');
        if (invoice.notes) { notesSection.style.display = 'block'; document.getElementById('ipNotes').textContent = invoice.notes; }
        else notesSection.style.display = 'none';

        const paymentsListEl = document.getElementById('ipPaymentsList');
        paymentsListEl.innerHTML = '';
        if (payments.length) {
            const heading = document.createElement('h4');
            heading.style.cssText = 'font-size:.8rem;color:var(--text-mid);margin-bottom:8px;';
            heading.textContent = 'Payments Allocated';
            paymentsListEl.appendChild(heading);
            payments.forEach(p => {
                const row = document.createElement('div');
                row.className = 'payment-row';
                const amt = document.createElement('span'); amt.className = 'amt'; amt.textContent = formatRand(p.amount);
                const meta = document.createElement('span'); meta.className = 'meta';
                meta.textContent = `${formatDateOnly(p.date)} · ${p.method || ''}${p.reference ? ' · Ref: ' + p.reference : ''}`;
                const receiptBtn = document.createElement('button');
                receiptBtn.type = 'button';
                receiptBtn.className = 'receipt-btn';
                receiptBtn.textContent = 'Create Receipt';
                receiptBtn.addEventListener('click', () => createReceiptForPayment(invoice, p));
                row.append(amt, meta, receiptBtn);
                paymentsListEl.appendChild(row);
            });
        }

        document.getElementById('invoicePreviewOverlay').classList.add('active');
    }

    document.getElementById('invoicePreviewClose').addEventListener('click', () => document.getElementById('invoicePreviewOverlay').classList.remove('active'));
    document.getElementById('invoicePreviewOverlay').addEventListener('click', (e) => { if (e.target.id === 'invoicePreviewOverlay') document.getElementById('invoicePreviewOverlay').classList.remove('active'); });
    document.getElementById('ipPrintBtn').addEventListener('click', () => window.print());

    document.getElementById('ipEditBtn').addEventListener('click', () => {
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice) return;
        document.getElementById('invoicePreviewOverlay').classList.remove('active');
        openInvoiceBuilder({ invoice });
    });

    document.getElementById('ipEmailBtn').addEventListener('click', () => {
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice) return;
        if (!invoice.clientEmail || !isValidEmail(invoice.clientEmail)) { alert('This invoice has no valid client email on file.'); return; }
        const { outstanding } = computeInvoiceTotals(invoice);
        const subject = `RM Digitals Invoice ${invoice.invoiceNumber}`;
        const body = `Hi ${invoice.clientName || ''},\n\nYour RM Digitals invoice ${invoice.invoiceNumber} (${formatRand(invoice.total)}, ${formatRand(Math.max(0, outstanding))} outstanding) is ready. Please let me know if you have any questions.\n\nKind regards,\nAnani — RM Digitals`;
        window.location.href = `mailto:${encodeURIComponent(invoice.clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
    document.getElementById('ipWhatsappBtn').addEventListener('click', () => {
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice) return;
        const digits = normalizePhoneForWa(invoice.clientPhone);
        if (!digits) { alert('This invoice has no valid client phone number on file.'); return; }
        const greeting = `Hi ${invoice.clientName || ''}, your RM Digitals invoice ${invoice.invoiceNumber} is ready. Please review it and let me know if you have any questions.`;
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`, '_blank', 'noopener,noreferrer');
    });

    async function updateInvoiceWorkflow(newStatus) {
        if (!activeInvoiceId) return;
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice) return;
        const update = { workflowStatus: newStatus, updatedAt: fsMod.serverTimestamp() };
        if (newStatus === 'sent' && !invoice.sentAt) update.sentAt = fsMod.serverTimestamp();
        if (newStatus === 'cancelled' && !invoice.cancelledAt) update.cancelledAt = fsMod.serverTimestamp();
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'invoices', activeInvoiceId), update);
            await loadInvoices();
            const updatedInvoice = allInvoices.find(i => i.id === activeInvoiceId);
            if (updatedInvoice) await syncClientPortalInvoice(updatedInvoice);
            openInvoicePreview(activeInvoiceId);
        } catch (err) {
            alert('Could not update invoice status: ' + err.message);
        }
    }
    document.getElementById('ipWorkflowSelect').addEventListener('change', (e) => updateInvoiceWorkflow(e.target.value));

    document.getElementById('ipDeleteBtn').addEventListener('click', async () => {
        if (!activeInvoiceId) return;
        if (!confirm('Delete this invoice permanently? This cannot be undone. Payments already recorded against it stay on the Client Project but become unallocated.')) return;
        try {
            const invoice = allInvoices.find(i => i.id === activeInvoiceId);
            if (invoice && invoice.clientProjectId) {
                const project = allClientProjects.find(p => p.id === invoice.clientProjectId);
                if (project && (project.payments || []).some(p => p.invoiceId === activeInvoiceId)) {
                    const updatedPayments = (project.payments || []).map(p => p.invoiceId === activeInvoiceId ? { ...p, invoiceId: null } : p);
                    await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', project.id), { payments: updatedPayments, updatedAt: fsMod.serverTimestamp() });
                    await loadClientProjects();
                }
            }
            await fsMod.deleteDoc(fsMod.doc(db, 'invoices', activeInvoiceId));
            // The mirror's source of truth is gone — delete it too, rather
            // than leaving a stale clientPortalInvoices document behind.
            try { await fsMod.deleteDoc(fsMod.doc(db, 'clientPortalInvoices', activeInvoiceId)); }
            catch (err) { console.warn('Could not remove client portal invoice mirror:', err.message); }
            document.getElementById('invoicePreviewOverlay').classList.remove('active');
            activeInvoiceId = null;
            loadInvoices();
        } catch (err) {
            alert('Could not delete invoice: ' + err.message);
        }
    });

    /* Keeps an already-open Client Project Detail modal's local payments
       buffer in sync after a direct Firestore payment write below — without
       this, an admin who then clicks "Save Project" on a stale buffer could
       silently wipe out the payment just recorded via the invoice (Part 20). */
    function syncOpenProjectPaymentsBuffer(projectId, updatedPayments) {
        if (document.getElementById('cpModalOverlay').classList.contains('active') && document.getElementById('cpProjectId').value === projectId) {
            cpItemsPayments = updatedPayments.map(p => ({ ...p }));
            renderCpPayments();
            renderCpFinancials();
        }
    }

    document.getElementById('ipRecordPaymentBtn').addEventListener('click', () => {
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice) return;
        if (!invoice.clientProjectId) { alert('This invoice isn\'t linked to a Client Project, so a payment can\'t be recorded against it here.'); return; }
        document.getElementById('ipoAmount').value = '';
        document.getElementById('ipoDate').value = new Date().toISOString().slice(0, 10);
        document.getElementById('ipoMethod').value = 'EFT';
        document.getElementById('ipoReference').value = '';
        document.getElementById('ipoNotes').value = '';
        document.getElementById('ipoMsg').textContent = '';
        document.getElementById('invoicePaymentOverlay').classList.add('active');
    });
    document.getElementById('invoicePaymentClose').addEventListener('click', () => document.getElementById('invoicePaymentOverlay').classList.remove('active'));
    document.getElementById('invoicePaymentOverlay').addEventListener('click', (e) => { if (e.target.id === 'invoicePaymentOverlay') document.getElementById('invoicePaymentOverlay').classList.remove('active'); });

    document.getElementById('ipoSaveBtn').addEventListener('click', async () => {
        const msg = document.getElementById('ipoMsg');
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice || !invoice.clientProjectId) return;
        const amount = Number(document.getElementById('ipoAmount').value);
        const date = document.getElementById('ipoDate').value;
        if (!(amount > 0)) { msg.textContent = '⚠️ Enter an amount greater than 0.'; msg.className = 'form-msg error'; return; }
        if (!date) { msg.textContent = '⚠️ Please choose a date.'; msg.className = 'form-msg error'; return; }
        const project = allClientProjects.find(p => p.id === invoice.clientProjectId);
        if (!project) { msg.textContent = '❌ Linked project not found.'; msg.className = 'form-msg error'; return; }

        const newPayment = {
            id: 'p' + Date.now() + Math.random().toString(36).slice(2, 7),
            amount, date,
            method: document.getElementById('ipoMethod').value,
            reference: document.getElementById('ipoReference').value.trim(),
            notes: document.getElementById('ipoNotes').value.trim(),
            invoiceId: invoice.id
        };
        // Spreads the CURRENT persisted array, never a locally-cached one — an
        // invoice-driven payment must never destroy payments recorded any
        // other way (Part 20 payment-integration requirement).
        const updatedPayments = [...(project.payments || []), newPayment];
        const amountPaid = updatedPayments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
        const contractValue = Math.max(0, Number(project.contractValue) || 0);
        const balance = contractValue - amountPaid;
        let paymentStatus;
        if (amountPaid <= 0.001) paymentStatus = 'not_paid';
        else if (balance > 0.001) paymentStatus = 'partial';
        else if (Math.abs(balance) <= 0.001) paymentStatus = 'paid';
        else paymentStatus = 'overpaid';

        try {
            await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', project.id), { payments: updatedPayments, amountPaid, balance, paymentStatus, updatedAt: fsMod.serverTimestamp() });
            await loadClientProjects();
            syncOpenProjectPaymentsBuffer(project.id, updatedPayments);
            await syncClientPortalInvoice(invoice); // paid/outstanding changed
            document.getElementById('invoicePaymentOverlay').classList.remove('active');
            openInvoicePreview(invoice.id);
        } catch (err) {
            msg.textContent = '❌ Could not record payment: ' + err.message;
            msg.className = 'form-msg error';
        }
    });

    document.getElementById('ipAllocateBtn').addEventListener('click', async () => {
        const invoice = allInvoices.find(i => i.id === activeInvoiceId);
        if (!invoice || !invoice.clientProjectId) { alert('This invoice has no linked Client Project.'); return; }
        const project = allClientProjects.find(p => p.id === invoice.clientProjectId);
        if (!project) { alert('Linked project not found.'); return; }
        const unallocated = (project.payments || []).filter(p => !p.invoiceId);
        if (!unallocated.length) { alert('No unallocated payments on this project.'); return; }
        const listText = unallocated.map((p, i) => `${i + 1}. ${formatRand(p.amount)} on ${formatDateOnly(p.date)} (${p.method || ''})`).join('\n');
        const choice = prompt(`Which payment should be allocated to this invoice?\n\n${listText}`);
        const idx = Number(choice) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= unallocated.length) return;
        const target = unallocated[idx];
        const updatedPayments = (project.payments || []).map(p => p.id === target.id ? { ...p, invoiceId: invoice.id } : p);
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'clientProjects', project.id), { payments: updatedPayments, updatedAt: fsMod.serverTimestamp() });
            await loadClientProjects();
            syncOpenProjectPaymentsBuffer(project.id, updatedPayments);
            await syncClientPortalInvoice(invoice); // paid/outstanding changed
            openInvoicePreview(invoice.id);
        } catch (err) {
            alert('Could not allocate payment: ' + err.message);
        }
    });

    /* ── Receipts ── */
    async function loadReceipts() {
        const list = document.getElementById('receiptList');
        list.innerHTML = '<p class="empty-note">Loading receipts…</p>';
        let snap;
        try {
            const q = fsMod.query(fsMod.collection(db, 'receipts'), fsMod.orderBy('createdAt', 'desc'));
            snap = await fsMod.getDocs(q);
        } catch (err) {
            list.innerHTML = `<p class="empty-note">Could not load receipts: ${escapeHtml(err.message)}</p>`;
            return;
        }
        allReceipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderReceiptList();
        refreshDashboard();
    }
    function renderReceiptList() {
        const list = document.getElementById('receiptList');
        const searchTerm = (document.getElementById('receiptSearch').value || '').trim().toLowerCase();
        let filtered = allReceipts.filter(r => {
            if (!searchTerm) return true;
            const haystack = [r.receiptNumber, r.clientName, r.businessName].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });
        if (allReceipts.length === 0) { list.innerHTML = '<p class="empty-note">No receipts yet — create one from an invoice or a project payment.</p>'; return; }
        if (filtered.length === 0) { list.innerHTML = '<p class="empty-note">No receipts match your search.</p>'; return; }
        list.innerHTML = '';
        filtered.forEach(r => {
            const row = document.createElement('div');
            row.className = 'receipt-row';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.innerHTML = `
                <div class="info">
                    <strong>${escapeHtml(r.receiptNumber)}</strong>
                    <span>${escapeHtml(r.clientName || '')}${r.businessName ? ' · ' + escapeHtml(r.businessName) : ''}</span>
                </div>
                <div class="meta-col">${formatDateOnly(r.paymentDate)}</div>
                <div class="amount-col">${formatRand(r.amount)}</div>
                <span class="status-badge ${r.voided ? 'status-voided' : 'status-paid'}">${r.voided ? 'Voided' : 'Issued'}</span>
            `;
            row.addEventListener('click', () => openReceiptPreview(r.id));
            row.addEventListener('keypress', (e) => { if (e.key === 'Enter') openReceiptPreview(r.id); });
            list.appendChild(row);
        });
    }
    document.getElementById('receiptSearch').addEventListener('input', renderReceiptList);

    async function createReceiptForPayment(invoice, payment) {
        if (!confirm(`Create a receipt for ${formatRand(payment.amount)} received on ${formatDateOnly(payment.date)}?`)) return;
        try {
            const receiptNumber = await generateReceiptNumber();
            const record = {
                receiptNumber,
                clientId: invoice.clientId || null,
                clientName: invoice.clientName || null,
                businessName: invoice.businessName || null,
                clientProjectId: invoice.clientProjectId || null,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                paymentId: payment.id,
                amount: Math.max(0, Number(payment.amount) || 0),
                paymentDate: payment.date,
                paymentMethod: payment.method || '',
                paymentReference: payment.reference || '',
                description: `Payment for invoice ${invoice.invoiceNumber} — ${invoice.title}`,
                createdAt: fsMod.serverTimestamp(),
                createdBy: auth.currentUser.uid,
                voided: false, voidedAt: null, voidReason: null
            };
            const docRef = fsMod.doc(fsMod.collection(db, 'receipts'));
            await fsMod.setDoc(docRef, record);
            await loadReceipts();
            const savedReceipt = allReceipts.find(r => r.id === docRef.id);
            if (savedReceipt) await syncClientPortalReceipt(savedReceipt);
            openReceiptPreview(docRef.id);
        } catch (err) {
            alert('Could not create receipt: ' + err.message);
        }
    }

    /* Same as createReceiptForPayment above, but for a payment that isn't
       (yet) linked to any invoice — reachable directly from a Client
       Project's payment list. */
    async function createReceiptForProjectPayment(project, payment) {
        if (!confirm(`Create a receipt for ${formatRand(payment.amount)} received on ${formatDateOnly(payment.date)}?`)) return;
        const client = allClients.find(c => c.id === project.clientId) || null;
        const linkedInvoice = payment.invoiceId ? allInvoices.find(i => i.id === payment.invoiceId) : null;
        try {
            const receiptNumber = await generateReceiptNumber();
            const record = {
                receiptNumber,
                clientId: project.clientId || null,
                clientName: client ? client.name : null,
                businessName: client ? client.businessName : null,
                clientProjectId: project.id,
                invoiceId: linkedInvoice ? linkedInvoice.id : null,
                invoiceNumber: linkedInvoice ? linkedInvoice.invoiceNumber : null,
                paymentId: payment.id,
                amount: Math.max(0, Number(payment.amount) || 0),
                paymentDate: payment.date,
                paymentMethod: payment.method || '',
                paymentReference: payment.reference || '',
                description: `Payment for ${project.projectName}`,
                createdAt: fsMod.serverTimestamp(),
                createdBy: auth.currentUser.uid,
                voided: false, voidedAt: null, voidReason: null
            };
            const docRef = fsMod.doc(fsMod.collection(db, 'receipts'));
            await fsMod.setDoc(docRef, record);
            await loadReceipts();
            const savedReceipt = allReceipts.find(r => r.id === docRef.id);
            if (savedReceipt) await syncClientPortalReceipt(savedReceipt);
            openReceiptPreview(docRef.id);
        } catch (err) {
            alert('Could not create receipt: ' + err.message);
        }
    }

    function openReceiptPreview(id) {
        const receipt = allReceipts.find(r => r.id === id);
        if (!receipt) return;
        activeReceiptId = id;
        document.getElementById('rpReceiptNumber').textContent = receipt.receiptNumber;
        document.getElementById('rpDate').textContent = formatDateOnly(receipt.paymentDate);
        const clientBlock = document.getElementById('rpClientBlock');
        clientBlock.innerHTML = '';
        [receipt.clientName, receipt.businessName].filter(Boolean).forEach(line => {
            const p = document.createElement('div'); p.textContent = line; clientBlock.appendChild(p);
        });
        document.getElementById('rpInvoiceRef').textContent = receipt.invoiceNumber || 'No related invoice';
        document.getElementById('rpAmount').textContent = formatRand(receipt.amount);
        document.getElementById('rpMethod').textContent = receipt.paymentMethod || '—';
        const refRow = document.getElementById('rpReferenceRow');
        if (receipt.paymentReference) { refRow.style.display = 'flex'; document.getElementById('rpReference').textContent = receipt.paymentReference; }
        else refRow.style.display = 'none';
        document.getElementById('rpDescription').textContent = receipt.description || '';
        document.getElementById('rpVoidBadgeRow').style.display = receipt.voided ? 'block' : 'none';
        document.getElementById('rpVoidBtn').style.display = receipt.voided ? 'none' : 'inline-flex';
        document.getElementById('receiptPreviewOverlay').classList.add('active');
    }
    document.getElementById('receiptPreviewClose').addEventListener('click', () => document.getElementById('receiptPreviewOverlay').classList.remove('active'));
    document.getElementById('receiptPreviewOverlay').addEventListener('click', (e) => { if (e.target.id === 'receiptPreviewOverlay') document.getElementById('receiptPreviewOverlay').classList.remove('active'); });
    document.getElementById('rpPrintBtn').addEventListener('click', () => window.print());
    document.getElementById('rpVoidBtn').addEventListener('click', async () => {
        if (!activeReceiptId) return;
        const reason = prompt('Reason for voiding this receipt (optional):') || '';
        if (!confirm('Void this receipt? This does not delete it and does not change the underlying payment record — prefer this over deletion so the paper trail stays intact.')) return;
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'receipts', activeReceiptId), { voided: true, voidedAt: fsMod.serverTimestamp(), voidReason: reason });
            await loadReceipts();
            const voidedReceipt = allReceipts.find(r => r.id === activeReceiptId);
            if (voidedReceipt) await syncClientPortalReceipt(voidedReceipt);
            openReceiptPreview(activeReceiptId);
        } catch (err) {
            alert('Could not void receipt: ' + err.message);
        }
    });

    /* ============================================================
       BUSINESS DASHBOARD (Milestone 21)
       Reads only from the arrays each section already keeps in memory
       (allLeads/allQuotes/allClients/allClientProjects/allInvoices/
       allReceipts/allProjects) — no extra Firestore reads. Recomputed
       every time any of those six collections reloads (see the
       refreshDashboard() calls added at the end of each loadX()
       above), so it can never show stale figures after an edit
       anywhere else in the app.
       ============================================================ */

    /* "Current State" figures (totals, active counts, balances) are
       always all-time — filtering a point-in-time balance by a date
       range doesn't make sense. Only "Period Activity" below respects
       this filter, and only using fields that mark exactly when that
       specific event happened (sentAt/acceptedAt/completedAt/payment
       date/createdAt) — never an ambiguous updatedAt (Part 21, never
       invent or misattribute events). */
    function isWithinDashboardPeriod(ts) {
        const mode = document.getElementById('dashTimeFilter').value;
        if (mode === 'all') return true;
        if (!ts) return false;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        if (mode === 'month') {
            const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
            return d.getTime() >= startOfMonth.getTime();
        }
        if (mode === '30days') return d.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
        return true;
    }
    /* N/A rather than 0% or a misleading rate when nothing has been
       decided yet either way (Part 21 — explain/guard denominators). */
    function formatRatePercent(numerator, denominator) {
        if (!denominator) return 'N/A';
        return Math.round((numerator / denominator) * 100) + '%';
    }

    function refreshDashboard() {
        if (!document.getElementById('dashTimeFilter')) return;

        /* Sales Pipeline — Current State */
        const leadCounts = { new: 0, contacted: 0, won: 0, lost: 0 };
        allLeads.forEach(l => { if (leadCounts.hasOwnProperty(l.status)) leadCounts[l.status]++; });
        document.getElementById('dashLeadsTotal').textContent = allLeads.length;
        document.getElementById('dashLeadsNewState').textContent = leadCounts.new;
        document.getElementById('dashLeadsContactedState').textContent = leadCounts.contacted;

        const quoteCounts = { draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0 };
        allQuotes.forEach(q => { const disp = displayQuoteStatus(q); if (quoteCounts.hasOwnProperty(disp)) quoteCounts[disp]++; });
        document.getElementById('dashQuoteDraft').textContent = quoteCounts.draft;
        document.getElementById('dashQuoteSentState').textContent = quoteCounts.sent;
        document.getElementById('dashQuoteAccepted').textContent = quoteCounts.accepted;
        document.getElementById('dashQuoteDeclined').textContent = quoteCounts.declined;

        /* Cumulative (all time), never period-filtered — a single slow
           week can't swing these, and "undecided" is never a loss. */
        document.getElementById('dashLeadWinRate').textContent = formatRatePercent(leadCounts.won, leadCounts.won + leadCounts.lost);
        document.getElementById('dashQuoteAcceptRate').textContent = formatRatePercent(quoteCounts.accepted, quoteCounts.accepted + quoteCounts.declined + quoteCounts.expired);

        /* Period Activity */
        const periodNewLeads = allLeads.filter(l => isWithinDashboardPeriod(l.createdAt)).length;
        const periodQuotesSent = allQuotes.filter(q => isWithinDashboardPeriod(q.sentAt)).length;
        const periodQuotesAccepted = allQuotes.filter(q => isWithinDashboardPeriod(q.acceptedAt)).length;
        const periodProjectsCompleted = allClientProjects.filter(p => p.stage === 'completed' && isWithinDashboardPeriod(p.completedAt)).length;
        const periodReceipts = allReceipts.filter(r => isWithinDashboardPeriod(r.createdAt)).length;
        let periodPayments = 0;
        allClientProjects.forEach(p => {
            (p.payments || []).forEach(pay => {
                if (isWithinDashboardPeriod(pay.date)) periodPayments += Math.max(0, Number(pay.amount) || 0);
            });
        });
        document.getElementById('dashPeriodNewLeads').textContent = periodNewLeads;
        document.getElementById('dashPeriodQuotesSent').textContent = periodQuotesSent;
        document.getElementById('dashPeriodQuotesAccepted').textContent = periodQuotesAccepted;
        document.getElementById('dashPeriodProjectsCompleted').textContent = periodProjectsCompleted;
        document.getElementById('dashPeriodPayments').textContent = formatRand(periodPayments);
        document.getElementById('dashPeriodReceipts').textContent = periodReceipts;

        /* Projects — never counts Cancelled as active (ACTIVE_STAGES
           already excludes it, same list used by the Client Projects
           dashboard above, so the two never disagree). */
        let projActive = 0, projOverdue = 0, projDueSoon = 0, projOnHold = 0, projCompleted = 0;
        allClientProjects.forEach(p => {
            if (ACTIVE_STAGES.includes(p.stage)) projActive++;
            if (isOverdue(p)) projOverdue++;
            if (isDueSoon(p)) projDueSoon++;
            if (p.stage === 'on_hold') projOnHold++;
            if (p.stage === 'completed') projCompleted++;
        });
        document.getElementById('dashProjActive').textContent = projActive;
        document.getElementById('dashProjOverdue').textContent = projOverdue;
        document.getElementById('dashProjDueSoon').textContent = projDueSoon;
        document.getElementById('dashProjOnHold').textContent = projOnHold;
        document.getElementById('dashProjCompleted').textContent = projCompleted;

        /* Payments & Invoices — Current State. Deliberately never
           labelled "Bank Balance"/"Cash Available"/"Verified Revenue"
           anywhere here — these are business records of what's been
           invoiced/recorded, not verified funds (Part 21). */
        let totalContract = 0, totalPaid = 0;
        allClientProjects.forEach(p => {
            totalContract += Math.max(0, Number(p.contractValue) || 0);
            totalPaid += Math.max(0, Number(p.amountPaid) || 0);
        });
        let acceptedQuoteValue = 0;
        allQuotes.forEach(q => { if (q.status === 'accepted') acceptedQuoteValue += Math.max(0, Number(q.total) || 0); });
        let openInvoiceValue = 0, overdueInvoiceValue = 0, paidInvoiceValue = 0;
        allInvoices.forEach(inv => {
            const disp = displayInvoiceStatus(inv);
            const { outstanding, total } = computeInvoiceTotals(inv);
            if (disp !== 'cancelled' && disp !== 'paid') openInvoiceValue += Math.max(0, outstanding);
            if (disp === 'overdue') overdueInvoiceValue += Math.max(0, outstanding);
            if (disp === 'paid') paidInvoiceValue += total;
        });
        document.getElementById('dashContractValue').textContent = formatRand(totalContract);
        document.getElementById('dashPaymentsRecorded').textContent = formatRand(totalPaid);
        document.getElementById('dashOutstandingBalance').textContent = formatRand(Math.max(0, totalContract - totalPaid));
        document.getElementById('dashAcceptedQuoteValue').textContent = formatRand(acceptedQuoteValue);
        document.getElementById('dashOpenInvoiceValue').textContent = formatRand(openInvoiceValue);
        document.getElementById('dashOverdueInvoiceValue').textContent = formatRand(overdueInvoiceValue);
        document.getElementById('dashPaidInvoiceValue').textContent = formatRand(paidInvoiceValue);

        /* Clients — never inflated using Leads; only real clients count. */
        const clientCounts = { active: 0, past: 0, archived: 0 };
        allClients.forEach(c => { if (clientCounts.hasOwnProperty(c.status)) clientCounts[c.status]++; });
        document.getElementById('dashClientsActive').textContent = clientCounts.active;
        document.getElementById('dashClientsPast').textContent = clientCounts.past;
        document.getElementById('dashClientsArchived').textContent = clientCounts.archived;

        /* Post-Project Follow-Up */
        let portfolioPermPending = 0, reviewsAwaitingRequest = 0, outstandingFinalPayments = 0;
        allClientProjects.forEach(p => {
            if (p.stage === 'completed') {
                if ((p.portfolioPermission || 'not_asked') === 'not_asked') portfolioPermPending++;
                if ((p.reviewRequestStatus || 'not_requested') === 'not_requested') reviewsAwaitingRequest++;
                if (Number(p.balance) > 0.001) outstandingFinalPayments++;
            }
        });
        document.getElementById('dashPortfolioPermPending').textContent = portfolioPermPending;
        document.getElementById('dashReviewsAwaitingRequest').textContent = reviewsAwaitingRequest;
        document.getElementById('dashOutstandingFinalPayments').textContent = outstandingFinalPayments;

        renderDashboardAttention();
        renderDashboardActivity();
    }

    /* Deliberately non-overlapping with the Client Projects card's own
       "Needs Attention" list above (overdue/due-soon/awaiting-content/
       high-priority projects) — this one surfaces categories that
       aren't shown anywhere else yet, so nothing is duplicated. */
    function renderDashboardAttention() {
        const list = document.getElementById('dashAttentionList');
        const items = [];
        allInvoices.forEach(inv => {
            if (displayInvoiceStatus(inv) === 'overdue') {
                const { outstanding } = computeInvoiceTotals(inv);
                items.push({ text: `Overdue invoice: ${inv.invoiceNumber} — ${formatRand(outstanding)} outstanding (${inv.clientName || ''})`, weight: 0, action: () => openInvoicePreview(inv.id) });
            }
        });
        allQuotes.forEach(q => {
            if (q.status === 'sent' && q.validUntil) {
                const validDate = q.validUntil.toDate ? q.validUntil.toDate() : new Date(q.validUntil);
                const daysLeft = Math.ceil((validDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                if (daysLeft >= 0 && daysLeft <= 7) {
                    items.push({ text: `Quote expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}: ${q.quoteNumber} (${q.clientName || ''})`, weight: 1, action: () => openQuotePreview(q.id) });
                }
            }
        });
        allLeads.forEach(l => {
            if (l.status === 'new') {
                items.push({ text: `New lead awaiting first contact: ${l.name || '(no name)'}`, weight: 2, action: () => openLeadDetail(l.id) });
            }
        });
        items.sort((a, b) => a.weight - b.weight);
        if (!items.length) { list.innerHTML = '<li class="empty-note">Nothing needs attention right now.</li>'; return; }
        list.innerHTML = '';
        items.slice(0, 10).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.text; // textContent — client/lead-entered names are untrusted input
            li.addEventListener('click', item.action);
            list.appendChild(li);
        });
    }

    /* Merged, reverse-chronological feed built only from fields that
       already record exactly when something happened — never a
       fabricated or guessed event (Part 21). */
    function renderDashboardActivity() {
        const list = document.getElementById('dashActivityList');
        const events = [];
        allLeads.forEach(l => { if (l.createdAt) events.push({ ts: l.createdAt, text: `New lead: ${l.name || '(no name)'}`, action: () => openLeadDetail(l.id) }); });
        allQuotes.forEach(q => {
            if (q.sentAt) events.push({ ts: q.sentAt, text: `Quote sent: ${q.quoteNumber} (${q.clientName || ''})`, action: () => openQuotePreview(q.id) });
            if (q.acceptedAt) events.push({ ts: q.acceptedAt, text: `Quote accepted: ${q.quoteNumber} (${q.clientName || ''})`, action: () => openQuotePreview(q.id) });
            if (q.declinedAt) events.push({ ts: q.declinedAt, text: `Quote declined: ${q.quoteNumber} (${q.clientName || ''})`, action: () => openQuotePreview(q.id) });
        });
        allClientProjects.forEach(p => {
            if (p.completedAt) events.push({ ts: p.completedAt, text: `Project completed: ${p.projectName}`, action: () => openProjectDetail({ project: p }) });
            (p.payments || []).forEach(pay => {
                if (pay.date) events.push({ ts: pay.date, text: `Payment recorded: ${formatRand(pay.amount)} — ${p.projectName} (dated ${formatDateOnly(pay.date)})`, action: () => openProjectDetail({ project: p }) });
            });
        });
        allInvoices.forEach(inv => { if (inv.sentAt) events.push({ ts: inv.sentAt, text: `Invoice sent: ${inv.invoiceNumber} (${inv.clientName || ''})`, action: () => openInvoicePreview(inv.id) }); });
        allReceipts.forEach(r => { if (r.createdAt) events.push({ ts: r.createdAt, text: `Receipt issued: ${r.receiptNumber} (${formatRand(r.amount)})`, action: () => openReceiptPreview(r.id) }); });

        events.forEach(e => { e._t = e.ts.toDate ? e.ts.toDate().getTime() : new Date(e.ts).getTime(); });
        events.sort((a, b) => b._t - a._t);

        if (!events.length) { list.innerHTML = '<li class="empty-note">No activity recorded yet.</li>'; return; }
        list.innerHTML = '';
        events.slice(0, 10).forEach(e => {
            const li = document.createElement('li');
            li.textContent = e.text;
            li.addEventListener('click', e.action);
            list.appendChild(li);
        });
    }

    document.getElementById('dashTimeFilter').addEventListener('change', refreshDashboard);

    /* ============================================================
       CLIENT PORTAL (Milestone 22)
       Admin-side half only — the client-facing half lives entirely in
       client-portal.html/.js, which this file never imports or
       depends on. Everything here either (a) syncs the sanitised
       clientPortalProjects mirror, or (b) manages the
       clientAccounts/portalInvites lifecycle. No rule here is ever
       weakened to make this easier — see 22AA in the source brief:
       if something can't be done safely, it's reported, not shortcut.
       ============================================================ */

    /* crypto.getRandomValues(), never Date.now()/Math.random() — an
       invite token must be unguessable, since knowing it is the only
       thing that lets someone read that one portalInvites document
       (see firestore.rules) or register against a specific client. */
    function generateInviteToken() {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    function inviteUrl(token) {
        return PUBLIC_SITE_URL + 'client-portal.html?invite=' + encodeURIComponent(token);
    }

    /* The ONE place that writes clientPortalProjects. Only ever called
       right after a Client Project save, with the just-saved record —
       never destroys the private clientProject if the sync itself
       fails; it just reports the problem, since the private save
       already succeeded and that's what matters most (Part 22). */
    async function syncClientPortalProject(project) {
        if (!project) return;
        const portalRef = fsMod.doc(db, 'clientPortalProjects', project.id);
        if (!project.portalEnabled) {
            try {
                const existing = await fsMod.getDoc(portalRef);
                if (existing.exists() && existing.data().portalVisible !== false) {
                    await fsMod.updateDoc(portalRef, { portalVisible: false, syncedAt: fsMod.serverTimestamp() });
                }
            } catch (err) {
                console.warn('Could not hide client portal project on disable:', err.message);
            }
            return;
        }
        try {
            // Full replace (setDoc without merge) every time — a field
            // removed on the private project (e.g. a deleted checklist
            // item) can never linger as a stale leftover here.
            await fsMod.setDoc(portalRef, {
                clientId: project.clientId,
                projectName: project.projectName,
                projectType: project.projectType || '',
                description: project.description || '',
                stage: project.stage,
                startDate: project.startDate || null,
                targetDate: project.targetDate || null,
                progress: clampProgress(project.progress),
                contentChecklist: (project.contentChecklist || []).map(i => ({ id: i.id, label: i.label, received: !!i.received })),
                completionChecklist: (project.completionChecklist || []).map(i => ({ id: i.id, label: i.label, status: i.status })),
                liveWebsiteUrl: project.liveWebsiteUrl || null,
                completedAt: project.completedAt || null,
                portalVisible: true,
                syncedAt: fsMod.serverTimestamp()
            });
        } catch (err) {
            console.warn('Could not sync client portal project:', err.message);
            alert('Note: this project could not be updated in the Client Portal (' + err.message + '). The private project itself was saved successfully — please try saving again, or check the Client Portal manually.');
        }
    }

    /* ── Client Portal financial mirrors (post-22 privacy hardening) ──
       The ONLY two places that write clientPortalInvoices/
       clientPortalReceipts. Every field is named explicitly — NEVER
       `{ ...invoice }` / `{ ...receipt }` — so a future private field
       added to the authoritative collections can never leak into a
       client's view just by existing; it has to be deliberately added
       here too. Paid/outstanding/displayStatus are computed here using
       the SAME functions the admin invoice list uses
       (computeInvoiceTotals/displayInvoiceStatus), which read the
       linked project's payments — something the portal itself has no
       access to, so this is also strictly more accurate than the old
       receipts-only approximation client-portal.js used to compute
       client-side. A sync failure never touches the private document —
       it only reports the problem, same contract as
       syncClientPortalProject() above. */
    async function syncClientPortalInvoice(invoice) {
        if (!invoice) return;
        const mirrorRef = fsMod.doc(db, 'clientPortalInvoices', invoice.id);
        try {
            const { paid, outstanding } = computeInvoiceTotals(invoice);
            const disp = displayInvoiceStatus(invoice);
            await fsMod.setDoc(mirrorRef, {
                clientId: invoice.clientId,
                invoiceNumber: invoice.invoiceNumber,
                invoiceType: invoice.invoiceType || 'standard',
                title: invoice.title || '',
                description: invoice.description || '',
                issueDate: invoice.issueDate || null,
                dueDate: invoice.dueDate || null,
                items: (invoice.items || []).map(it => ({
                    description: (it.description || '').toString(),
                    quantity: Math.max(0, Number(it.quantity) || 0),
                    unitPrice: Math.max(0, Number(it.unitPrice) || 0),
                    lineTotal: Math.max(0, Number(it.lineTotal) || 0)
                })),
                subtotal: Math.max(0, Number(invoice.subtotal) || 0),
                discountType: invoice.discountType || 'none',
                discountValue: Math.max(0, Number(invoice.discountValue) || 0),
                discountAmount: Math.max(0, Number(invoice.discountAmount) || 0),
                total: Math.max(0, Number(invoice.total) || 0),
                paid: Math.max(0, paid),
                outstanding,
                displayStatus: disp,
                cancelled: invoice.workflowStatus === 'cancelled',
                paymentArrangement: invoice.paymentArrangement || '',
                paymentInstructions: invoice.paymentInstructions || '',
                portalVisible: invoice.workflowStatus !== 'draft',
                createdAt: invoice.createdAt || null,
                updatedAt: fsMod.serverTimestamp()
            });
        } catch (err) {
            console.warn('Could not sync client portal invoice:', err.message);
            alert('Note: this invoice could not be updated in the Client Portal (' + err.message + '). The private invoice itself was saved successfully — please try again, or use "Rebuild Client Portal Financial Data" in Data & Backup.');
        }
    }

    /* Deliberately excludes paymentReference/notes/paymentId/createdBy —
       none of those are shown anywhere in the client-facing receipt
       view today, so none of them are mirrored (Part "field leakage
       test" — only genuinely-used fields ever cross into this
       collection). */
    async function syncClientPortalReceipt(receipt) {
        if (!receipt) return;
        const mirrorRef = fsMod.doc(db, 'clientPortalReceipts', receipt.id);
        try {
            await fsMod.setDoc(mirrorRef, {
                clientId: receipt.clientId,
                receiptNumber: receipt.receiptNumber,
                invoiceNumber: receipt.invoiceNumber || null,
                amount: Math.max(0, Number(receipt.amount) || 0),
                paymentDate: receipt.paymentDate || null,
                paymentMethod: receipt.paymentMethod || '',
                description: receipt.description || '',
                voided: !!receipt.voided,
                portalVisible: true,
                createdAt: receipt.createdAt || null,
                updatedAt: fsMod.serverTimestamp()
            });
        } catch (err) {
            console.warn('Could not sync client portal receipt:', err.message);
            alert('Note: this receipt could not be updated in the Client Portal (' + err.message + '). The private receipt itself was saved successfully — please try again, or use "Rebuild Client Portal Financial Data" in Data & Backup.');
        }
    }

    /* Reads the private invoices/receipts as admin and re-runs the exact
       same sync helpers above for every one of them — never alters the
       original financial documents. Exists for: records created before
       this mirror architecture existed, and recovering from any
       individual sync failure reported earlier. */
    document.getElementById('rebuildPortalFinancialBtn').addEventListener('click', async () => {
        if (!confirm(`Rebuild Client Portal financial data for all ${allInvoices.length} invoice(s) and ${allReceipts.length} receipt(s)? This only updates the client-facing mirrors — your private invoice/receipt records are never changed.`)) return;
        const msg = document.getElementById('rebuildPortalFinancialMsg');
        msg.textContent = 'Rebuilding…';
        msg.className = 'form-msg';
        let invoiceCount = 0, receiptCount = 0;
        for (const inv of allInvoices) {
            await syncClientPortalInvoice(inv);
            invoiceCount++;
        }
        for (const r of allReceipts) {
            await syncClientPortalReceipt(r);
            receiptCount++;
        }
        msg.textContent = `✅ Rebuilt ${invoiceCount} invoice mirror(s) and ${receiptCount} receipt mirror(s).`;
        msg.className = 'form-msg success';
    });

    /* ── Portal Access (Client Profile section) ── */
    async function renderPortalAccessSection(client) {
        const badge = document.getElementById('cmPortalStatusBadge');
        const actions = document.getElementById('cmPortalActions');
        const msg = document.getElementById('cmPortalMsg');
        msg.textContent = '';
        if (!client) {
            badge.textContent = 'Not Invited';
            badge.className = 'status-badge status-draft';
            actions.innerHTML = '';
            return;
        }
        actions.innerHTML = '<p class="empty-note">Checking…</p>';

        // Precise, UID-mapping-based lookups only — never name matching
        // (Part 22, "one account maps to exactly one clientId, never
        // inferred by name").
        let accountSnap, inviteSnap;
        try {
            accountSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'clientAccounts'), fsMod.where('clientId', '==', client.id)));
            inviteSnap = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'portalInvites'), fsMod.where('clientId', '==', client.id)));
        } catch (err) {
            actions.innerHTML = '';
            badge.textContent = 'Unknown';
            badge.className = 'status-badge status-draft';
            msg.textContent = '❌ Could not check portal access: ' + err.message;
            msg.className = 'form-msg error';
            return;
        }
        const account = accountSnap.docs.length ? { id: accountSnap.docs[0].id, ...accountSnap.docs[0].data() } : null;
        const invites = inviteSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeInvite = invites.find(i => {
            if (!i.active) return false;
            if (!i.expiresAt) return true;
            const exp = i.expiresAt.toDate ? i.expiresAt.toDate() : new Date(i.expiresAt);
            return exp.getTime() > Date.now();
        });

        function mkBtn(label, handler) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn-logout';
            b.textContent = label;
            b.addEventListener('click', handler);
            return b;
        }

        actions.innerHTML = '';
        if (account && account.active) {
            badge.textContent = 'Account Active';
            badge.className = 'status-badge status-paid';
            actions.appendChild(mkBtn('Revoke Access', () => revokePortalAccess(account.id, client)));
        } else if (account && !account.active) {
            badge.textContent = 'Access Revoked';
            badge.className = 'status-badge status-cancelled';
            actions.appendChild(mkBtn('Re-enable Access', () => reenablePortalAccess(account.id, client)));
        } else if (activeInvite) {
            badge.textContent = 'Invite Active';
            badge.className = 'status-badge status-sent';
            actions.appendChild(mkBtn('Copy Invite Link', () => copyInviteLink(activeInvite.id)));
            actions.appendChild(mkBtn('Email Invite', () => emailInviteLink(activeInvite.id, client)));
            actions.appendChild(mkBtn('WhatsApp Invite', () => whatsappInviteLink(activeInvite.id, client)));
            actions.appendChild(mkBtn('Revoke Invite', () => revokePendingInvite(activeInvite.id, client)));
        } else {
            badge.textContent = 'Not Invited';
            badge.className = 'status-badge status-draft';
            actions.appendChild(mkBtn('Generate Invite', () => generatePortalInvite(client)));
        }
    }

    async function generatePortalInvite(client) {
        const msg = document.getElementById('cmPortalMsg');
        if (!client.email || !isValidEmail(client.email)) {
            msg.textContent = '⚠️ This client needs a valid email on file before you can generate a portal invite — registration is tied to that exact email address.';
            msg.className = 'form-msg error';
            return;
        }
        const token = generateInviteToken();
        try {
            await fsMod.setDoc(fsMod.doc(db, 'portalInvites', token), {
                clientId: client.id,
                email: client.email,
                active: true,
                createdAt: fsMod.serverTimestamp(),
                expiresAt: fsMod.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
                redeemedAt: null,
                redeemedBy: null,
                createdBy: auth.currentUser.uid
            });
            msg.textContent = '✅ Invite created (valid 7 days). Use the buttons below to send it to the client.';
            msg.className = 'form-msg success';
            await renderPortalAccessSection(client);
        } catch (err) {
            msg.textContent = '❌ Could not create invite: ' + err.message;
            msg.className = 'form-msg error';
        }
    }

    async function copyInviteLink(token) {
        const msg = document.getElementById('cmPortalMsg');
        try {
            await navigator.clipboard.writeText(inviteUrl(token));
            msg.textContent = '✅ Invite link copied.';
            msg.className = 'form-msg success';
        } catch {
            prompt('Copy this invite link:', inviteUrl(token));
        }
    }
    function emailInviteLink(token, client) {
        if (!client.email || !isValidEmail(client.email)) { alert('This client has no valid email on file.'); return; }
        const subject = 'Your RM Digitals Client Portal Invite';
        const body = `Hi ${client.name || ''},\n\nYou can now access your RM Digitals Client Portal to view your project progress, invoices and receipts.\n\nPlease register using this exact email address (${client.email}):\n${inviteUrl(token)}\n\nThis link is valid for 7 days.\n\nKind regards,\nAnani — RM Digitals`;
        window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    function whatsappInviteLink(token, client) {
        const digits = normalizePhoneForWa(client.phone);
        if (!digits) { alert('This client has no valid phone number on file.'); return; }
        const text = `Hi ${client.name || ''}, you can now access your RM Digitals Client Portal to view your project progress, invoices and receipts. Please register using this exact email address (${client.email || 'the one on file with us'}): ${inviteUrl(token)} (valid 7 days)`;
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }

    async function revokePendingInvite(inviteId, client) {
        if (!confirm('Revoke this invite? The client will no longer be able to use this link to register.')) return;
        const msg = document.getElementById('cmPortalMsg');
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'portalInvites', inviteId), { active: false, updatedAt: fsMod.serverTimestamp() });
            msg.textContent = '✅ Invite revoked.';
            msg.className = 'form-msg success';
            await renderPortalAccessSection(client);
        } catch (err) {
            msg.textContent = '❌ Could not revoke invite: ' + err.message;
            msg.className = 'form-msg error';
        }
    }
    async function revokePortalAccess(accountId, client) {
        if (!confirm(`Revoke ${client.name}'s Client Portal access? They'll be signed out and won't be able to see any of their project data until you re-enable it.`)) return;
        const msg = document.getElementById('cmPortalMsg');
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'clientAccounts', accountId), { active: false, updatedAt: fsMod.serverTimestamp() });
            msg.textContent = '✅ Portal access revoked.';
            msg.className = 'form-msg success';
            await renderPortalAccessSection(client);
        } catch (err) {
            msg.textContent = '❌ Could not revoke access: ' + err.message;
            msg.className = 'form-msg error';
        }
    }
    async function reenablePortalAccess(accountId, client) {
        const msg = document.getElementById('cmPortalMsg');
        try {
            await fsMod.updateDoc(fsMod.doc(db, 'clientAccounts', accountId), { active: true, updatedAt: fsMod.serverTimestamp() });
            msg.textContent = '✅ Portal access re-enabled.';
            msg.className = 'form-msg success';
            await renderPortalAccessSection(client);
        } catch (err) {
            msg.textContent = '❌ Could not re-enable access: ' + err.message;
            msg.className = 'form-msg error';
        }
    }

    /* ============================================================
       DATA & BACKUP (Milestone 23)
       CSV export, a full JSON backup, a controlled "missing records
       only" restore, and a report-only integrity check. Deliberately
       NO bulk-delete / "wipe database" action anywhere here — every
       destructive-adjacent action elsewhere already has its own
       confirmation and stays exactly as it was.
       ============================================================ */

    function todayDateStamp() {
        return new Date().toISOString().slice(0, 10);
    }

    /* OWASP CSV-injection mitigation: a cell that would otherwise open
       with =, +, - or @ gets a leading apostrophe so Excel/Sheets never
       interprets it as a formula, then normal CSV quoting is applied
       on top of that. */
    function csvCell(value) {
        let s = value === null || value === undefined ? '' : String(value);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    }
    function toCsv(rows, columns) {
        const header = columns.map(c => csvCell(c.label)).join(',');
        const lines = rows.map(row => columns.map(c => csvCell(c.value(row))).join(','));
        return [header, ...lines].join('\r\n');
    }
    function downloadTextFile(filename, content, mime) {
        const blob = new Blob([content], { type: mime || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    function csvDate(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }

    async function getReviewsForExport() {
        const snap = await fsMod.getDocs(fsMod.collection(db, 'reviews'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const EXPORT_COLUMNS = {
        leads: [
            { label: 'ID', value: r => r.id }, { label: 'Name', value: r => r.name },
            { label: 'Email', value: r => r.email }, { label: 'Phone', value: r => r.phone },
            { label: 'Status', value: r => r.status }, { label: 'Source', value: r => r.source },
            { label: 'Budget', value: r => r.budget },
            { label: 'Package/Service Interest', value: r => r.packageInterest || r.serviceInterest || '' },
            { label: 'Message', value: r => r.message }, { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        quotes: [
            { label: 'ID', value: r => r.id }, { label: 'Quote Number', value: r => r.quoteNumber },
            { label: 'Client Name', value: r => r.clientName }, { label: 'Business', value: r => r.businessName },
            { label: 'Email', value: r => r.clientEmail }, { label: 'Phone', value: r => r.clientPhone },
            { label: 'Title', value: r => r.title }, { label: 'Status', value: r => r.status },
            { label: 'Total', value: r => r.total }, { label: 'Valid Until', value: r => csvDate(r.validUntil) },
            { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        clients: [
            { label: 'ID', value: r => r.id }, { label: 'Name', value: r => r.name },
            { label: 'Business', value: r => r.businessName }, { label: 'Email', value: r => r.email },
            { label: 'Phone', value: r => r.phone }, { label: 'Alt Phone', value: r => r.alternativePhone },
            { label: 'Website', value: r => r.website }, { label: 'Status', value: r => r.status },
            { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        clientProjects: [
            { label: 'ID', value: r => r.id }, { label: 'Project Name', value: r => r.projectName },
            { label: 'Client ID', value: r => r.clientId }, { label: 'Type', value: r => r.projectType },
            { label: 'Stage', value: r => r.stage }, { label: 'Priority', value: r => r.priority },
            { label: 'Progress %', value: r => r.progress }, { label: 'Contract Value', value: r => r.contractValue },
            { label: 'Amount Paid', value: r => r.amountPaid }, { label: 'Balance', value: r => r.balance },
            { label: 'Payment Status', value: r => r.paymentStatus }, { label: 'Target Date', value: r => csvDate(r.targetDate) },
            { label: 'Portal Enabled', value: r => r.portalEnabled ? 'Yes' : 'No' }, { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        invoices: [
            { label: 'ID', value: r => r.id }, { label: 'Invoice Number', value: r => r.invoiceNumber },
            { label: 'Client Name', value: r => r.clientName }, { label: 'Client ID', value: r => r.clientId },
            { label: 'Type', value: r => r.invoiceType }, { label: 'Title', value: r => r.title },
            { label: 'Total', value: r => r.total }, { label: 'Status', value: r => r.workflowStatus },
            { label: 'Due Date', value: r => csvDate(r.dueDate) }, { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        receipts: [
            { label: 'ID', value: r => r.id }, { label: 'Receipt Number', value: r => r.receiptNumber },
            { label: 'Client Name', value: r => r.clientName }, { label: 'Client ID', value: r => r.clientId },
            { label: 'Invoice Number', value: r => r.invoiceNumber }, { label: 'Amount', value: r => r.amount },
            { label: 'Payment Date', value: r => csvDate(r.paymentDate) }, { label: 'Method', value: r => r.paymentMethod },
            { label: 'Voided', value: r => r.voided ? 'Yes' : 'No' }, { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        projects: [
            { label: 'ID', value: r => r.id }, { label: 'Slug', value: r => r.slug },
            { label: 'Business Name', value: r => r.businessName }, { label: 'Category', value: r => r.category },
            { label: 'Published', value: r => r.published ? 'Yes' : 'No' }, { label: 'Featured', value: r => r.featured ? 'Yes' : 'No' },
            { label: 'Created', value: r => csvDate(r.createdAt) }
        ],
        reviews: [
            { label: 'ID', value: r => r.id }, { label: 'Name', value: r => r.name },
            { label: 'Company', value: r => r.company }, { label: 'Project', value: r => r.projectName },
            { label: 'Rating', value: r => r.rating }, { label: 'Status', value: r => r.status },
            { label: 'Featured', value: r => r.featured ? 'Yes' : 'No' }, { label: 'Message', value: r => r.message },
            { label: 'Created', value: r => csvDate(r.createdAt) }
        ]
    };

    document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.export;
            let rows;
            try {
                if (key === 'reviews') rows = await getReviewsForExport();
                else {
                    const sourceMap = {
                        leads: allLeads, quotes: allQuotes, clients: allClients,
                        clientProjects: allClientProjects, invoices: allInvoices,
                        receipts: allReceipts, projects: allProjects
                    };
                    rows = sourceMap[key] || [];
                }
            } catch (err) {
                alert('Could not export ' + key + ': ' + err.message);
                return;
            }
            const csv = toCsv(rows, EXPORT_COLUMNS[key]);
            downloadTextFile(`rm-digitals-${key}-${todayDateStamp()}.csv`, csv, 'text/csv;charset=utf-8;');
        });
    });

    /* ── Full JSON Backup ──
       Timestamps are wrapped as { __ts: isoString } rather than left
       as raw Firestore {seconds,nanoseconds} objects or silently
       stringified — this keeps the file human-readable AND lets
       Restore convert them back into real Timestamps unambiguously
       (a plain string field could never be told apart from a real
       date otherwise). */
    function serializeForBackup(value) {
        if (value === null || value === undefined) return value;
        if (typeof value.toDate === 'function') return { __ts: value.toDate().toISOString() };
        if (Array.isArray(value)) return value.map(serializeForBackup);
        if (typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach(k => { out[k] = serializeForBackup(value[k]); });
            return out;
        }
        return value;
    }
    function deserializeForBackup(value) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'object' && !Array.isArray(value) && value.__ts) {
            return fsMod.Timestamp.fromDate(new Date(value.__ts));
        }
        if (Array.isArray(value)) return value.map(deserializeForBackup);
        if (typeof value === 'object') {
            const out = {};
            Object.keys(value).forEach(k => { out[k] = deserializeForBackup(value[k]); });
            return out;
        }
        return value;
    }

    /* Exactly the 8 business collections named in the brief — never
       clientAccounts (Firebase Auth UIDs can't be safely restored
       anyway, per the "never restore Auth accounts" rule), never
       portalInvites (active secrets), never the derived
       clientPortalProjects mirror (re-created automatically the next
       time each project is saved). */
    const BACKUP_COLLECTIONS = ['leads', 'quotes', 'clients', 'clientProjects', 'invoices', 'receipts', 'projects', 'reviews'];
    const BACKUP_SCHEMA_VERSION = 1;

    async function buildFullBackup() {
        const collections = {};
        for (const name of BACKUP_COLLECTIONS) {
            const snap = await fsMod.getDocs(fsMod.collection(db, name));
            collections[name] = snap.docs.map(d => ({ id: d.id, ...serializeForBackup(d.data()) }));
        }
        return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), collections };
    }

    document.getElementById('openBackupWarningBtn').addEventListener('click', () => {
        document.getElementById('backupAckCheckbox').checked = false;
        document.getElementById('backupConfirmDownloadBtn').disabled = true;
        document.getElementById('backupWarningOverlay').classList.add('active');
    });
    document.getElementById('backupWarningClose').addEventListener('click', () => document.getElementById('backupWarningOverlay').classList.remove('active'));
    document.getElementById('backupWarningOverlay').addEventListener('click', (e) => { if (e.target.id === 'backupWarningOverlay') document.getElementById('backupWarningOverlay').classList.remove('active'); });
    document.getElementById('backupAckCheckbox').addEventListener('change', (e) => {
        document.getElementById('backupConfirmDownloadBtn').disabled = !e.target.checked;
    });
    document.getElementById('backupConfirmDownloadBtn').addEventListener('click', async () => {
        const btn = document.getElementById('backupConfirmDownloadBtn');
        btn.disabled = true; btn.textContent = 'Preparing…';
        try {
            const backup = await buildFullBackup();
            downloadTextFile(`rm-digitals-backup-${todayDateStamp()}.json`, JSON.stringify(backup, null, 2), 'application/json');
            document.getElementById('backupWarningOverlay').classList.remove('active');
        } catch (err) {
            alert('Could not build backup: ' + err.message);
        } finally {
            btn.disabled = false; btn.textContent = 'Download Backup';
        }
    });

    /* ── Restore From Backup ──
       Default (and only) behaviour: RESTORE MISSING RECORDS ONLY. Any
       document ID that already exists is skipped, never overwritten —
       there is deliberately no overwrite mode. Firebase Auth accounts
       and anything portal-credential-related are never touched. */
    let pendingRestoreData = null;
    let pendingRestoreExistingIds = null;

    document.getElementById('restoreFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('restorePreview');
        const counts = document.getElementById('restorePreviewCounts');
        const resultEl = document.getElementById('restoreResult');
        resultEl.textContent = '';
        preview.style.display = 'none';
        pendingRestoreData = null;
        pendingRestoreExistingIds = null;
        if (!file) return;

        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            resultEl.textContent = '❌ That file is not valid JSON.';
            resultEl.style.color = '#ff7070';
            return;
        }
        if (!parsed || typeof parsed !== 'object' || !parsed.collections || typeof parsed.collections !== 'object') {
            resultEl.textContent = '❌ This does not look like an RM Digitals backup file (missing "collections").';
            resultEl.style.color = '#ff7070';
            return;
        }

        counts.innerHTML = '<p class="empty-note">Checking for existing records…</p>';
        preview.style.display = 'block';

        const existingIds = {};
        const lines = [];
        for (const name of BACKUP_COLLECTIONS) {
            const records = Array.isArray(parsed.collections[name]) ? parsed.collections[name] : [];
            try {
                const snap = await fsMod.getDocs(fsMod.collection(db, name));
                const existingSet = new Set(snap.docs.map(d => d.id));
                const newCount = records.filter(r => r && r.id && !existingSet.has(r.id)).length;
                lines.push(`${name}: ${records.length} in file — ${newCount} new, ${records.length - newCount} already exist (will be skipped)`);
                existingIds[name] = existingSet;
            } catch (err) {
                lines.push(`${name}: could not check existing records (${err.message})`);
                existingIds[name] = new Set();
            }
        }
        counts.innerHTML = lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
        pendingRestoreData = parsed;
        pendingRestoreExistingIds = existingIds;
    });

    document.getElementById('confirmRestoreBtn').addEventListener('click', async () => {
        if (!pendingRestoreData) return;
        if (!confirm('Restore missing records from this backup? Existing records will never be overwritten or deleted.')) return;
        const resultEl = document.getElementById('restoreResult');
        resultEl.style.color = '';
        resultEl.textContent = 'Restoring…';

        let restored = 0, skipped = 0, invalid = 0, failed = 0;
        for (const name of BACKUP_COLLECTIONS) {
            const records = Array.isArray(pendingRestoreData.collections[name]) ? pendingRestoreData.collections[name] : [];
            const existingSet = pendingRestoreExistingIds[name] || new Set();
            for (const rec of records) {
                if (!rec || !rec.id || typeof rec.id !== 'string') { invalid++; continue; }
                if (existingSet.has(rec.id)) { skipped++; continue; }
                const { id, ...fields } = rec;
                try {
                    await fsMod.setDoc(fsMod.doc(db, name, id), deserializeForBackup(fields));
                    restored++;
                } catch {
                    failed++;
                }
            }
        }
        resultEl.textContent = `✅ Restore complete — ${restored} restored, ${skipped} skipped (already existed), ${invalid} invalid, ${failed} failed.`;
        document.getElementById('restorePreview').style.display = 'none';
        document.getElementById('restoreFileInput').value = '';
        pendingRestoreData = null;
        pendingRestoreExistingIds = null;

        loadLeads(); loadQuotes(); loadClients();
        await loadClientProjects();
        loadInvoices(); loadReceipts(); loadProjects();
    });

    /* ── Data Integrity Check ──
       Report-only — never auto-fixes anything, per the brief. */
    document.getElementById('runIntegrityCheckBtn').addEventListener('click', async () => {
        const container = document.getElementById('integrityResults');
        container.innerHTML = '<p class="empty-note">Checking…</p>';
        let reviews = [];
        try { reviews = await getReviewsForExport(); } catch { /* review-link checks below just get skipped */ }
        let portalInvoiceIds = new Set(), portalReceiptIds = new Set();
        try {
            const [invSnap, recSnap] = await Promise.all([
                fsMod.getDocs(fsMod.collection(db, 'clientPortalInvoices')),
                fsMod.getDocs(fsMod.collection(db, 'clientPortalReceipts'))
            ]);
            portalInvoiceIds = new Set(invSnap.docs.map(d => d.id));
            portalReceiptIds = new Set(recSnap.docs.map(d => d.id));
        } catch { /* portal-mirror checks below just get skipped */ }

        const issues = [];
        const clientIds = new Set(allClients.map(c => c.id));
        const leadIds = new Set(allLeads.map(l => l.id));
        const quoteIds = new Set(allQuotes.map(q => q.id));
        const invoiceIds = new Set(allInvoices.map(i => i.id));
        const portfolioIds = new Set(allProjects.map(p => p.id));
        const reviewIds = new Set(reviews.map(r => r.id));

        allQuotes.forEach(q => {
            if (q.leadId && !leadIds.has(q.leadId)) issues.push({ text: `Quote ${q.quoteNumber} references a lead that no longer exists.`, action: () => openQuotePreview(q.id) });
        });
        allClientProjects.forEach(p => {
            if (!p.clientId || !clientIds.has(p.clientId)) issues.push({ text: `Client Project "${p.projectName}" has no matching client.`, action: () => openProjectDetail({ project: p }) });
            if (p.quoteId && !quoteIds.has(p.quoteId)) issues.push({ text: `Client Project "${p.projectName}" references a quote that no longer exists.`, action: () => openProjectDetail({ project: p }) });
            if (p.portfolioProjectId && !portfolioIds.has(p.portfolioProjectId)) issues.push({ text: `Client Project "${p.projectName}" links to a portfolio project that no longer exists.`, action: () => openProjectDetail({ project: p }) });
            if (p.linkedReviewId && !reviewIds.has(p.linkedReviewId)) issues.push({ text: `Client Project "${p.projectName}" links to a review that no longer exists.`, action: () => openProjectDetail({ project: p }) });
            if (clampProgress(p.progress) !== Number(p.progress)) issues.push({ text: `Client Project "${p.projectName}" has an invalid progress value (${p.progress}).`, action: () => openProjectDetail({ project: p }) });
            if (Number(p.contractValue) < 0 || Number(p.amountPaid) < 0) issues.push({ text: `Client Project "${p.projectName}" has a negative contract value or amount paid.`, action: () => openProjectDetail({ project: p }) });
            if (p.contentFolderUrl && !isSafeHttpUrl(p.contentFolderUrl)) issues.push({ text: `Client Project "${p.projectName}" has an invalid Content Folder URL.`, action: () => openProjectDetail({ project: p }) });
            if (p.liveWebsiteUrl && !isSafeHttpUrl(p.liveWebsiteUrl)) issues.push({ text: `Client Project "${p.projectName}" has an invalid Live Website URL.`, action: () => openProjectDetail({ project: p }) });
        });
        allInvoices.forEach(inv => {
            if (!inv.clientId || !clientIds.has(inv.clientId)) issues.push({ text: `Invoice ${inv.invoiceNumber} has no matching client.`, action: () => openInvoicePreview(inv.id) });
            if (inv.clientProjectId && !allClientProjects.some(p => p.id === inv.clientProjectId)) issues.push({ text: `Invoice ${inv.invoiceNumber} references a project that no longer exists.`, action: () => openInvoicePreview(inv.id) });
            if (Number(inv.total) < 0) issues.push({ text: `Invoice ${inv.invoiceNumber} has a negative total.`, action: () => openInvoicePreview(inv.id) });
            if (inv.workflowStatus !== 'draft' && !portalInvoiceIds.has(inv.id)) issues.push({ text: `Invoice ${inv.invoiceNumber} is missing its Client Portal mirror — use "Rebuild Client Portal Financial Data" in Data & Backup.`, action: () => openInvoicePreview(inv.id) });
        });
        allReceipts.forEach(r => {
            if (r.invoiceId && !invoiceIds.has(r.invoiceId)) issues.push({ text: `Receipt ${r.receiptNumber} references an invoice that no longer exists.`, action: () => openReceiptPreview(r.id) });
            if (Number(r.amount) < 0) issues.push({ text: `Receipt ${r.receiptNumber} has a negative amount.`, action: () => openReceiptPreview(r.id) });
            if (!portalReceiptIds.has(r.id)) issues.push({ text: `Receipt ${r.receiptNumber} is missing its Client Portal mirror — use "Rebuild Client Portal Financial Data" in Data & Backup.`, action: () => openReceiptPreview(r.id) });
        });

        function findDuplicates(list, keyFn, label) {
            const seen = new Map();
            list.forEach(item => {
                const key = keyFn(item);
                if (!key) return;
                if (!seen.has(key)) seen.set(key, []);
                seen.get(key).push(item);
            });
            seen.forEach((items, key) => {
                if (items.length > 1) issues.push({ text: `Duplicate ${label}: ${key} (${items.length} records)`, action: null });
            });
        }
        findDuplicates(allQuotes, q => q.quoteNumber, 'quote number');
        findDuplicates(allInvoices, i => i.invoiceNumber, 'invoice number');
        findDuplicates(allReceipts, r => r.receiptNumber, 'receipt number');
        findDuplicates(allClients, c => c.email ? c.email.trim().toLowerCase() : null, 'client email');
        findDuplicates(allClients, c => normalizePhoneForWa(c.phone), 'client phone');

        if (!issues.length) { container.innerHTML = '<p class="empty-note">No issues found.</p>'; return; }
        container.innerHTML = '';
        issues.forEach(issue => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--border);font-size:.82rem;' + (issue.action ? 'cursor:pointer;color:var(--cyan);' : 'color:var(--text-mid);');
            row.textContent = issue.text;
            if (issue.action) row.addEventListener('click', issue.action);
            container.appendChild(row);
        });
    });
}
