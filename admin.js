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
        loadClientProjects();
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

        document.getElementById('clientModalOverlay').classList.add('active');
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
                openProjectDetail({ client: c });
            });
            results.appendChild(row);
        });
    }
    function openClientPicker() {
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
                openProjectDetail({ client: match });
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
            openProjectDetail({ client: { id: clientRef.id, ...record } });
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
                <button type="button">Remove</button>
            `;
            row.querySelector('button').addEventListener('click', () => {
                if (!confirm('Remove this payment record?')) return;
                cpItemsPayments.splice(idx, 1);
                renderCpPayments();
                renderCpFinancials();
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

        document.getElementById('cpModalOverlay').classList.add('active');
    }

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
}
