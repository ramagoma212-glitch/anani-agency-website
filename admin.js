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

const DEFAULT_QUOTE_TERMS =
`This quote is valid until the date shown above.
Work begins once the agreed deposit/payment arrangement is confirmed.
Final delivery depends on receiving required content and information from the client.
Changes outside the agreed scope may require an updated quote.
Third-party costs such as domains, premium software, paid plugins or external services are excluded unless specifically listed.
Final ownership/handover occurs according to the agreed payment arrangement.`;

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
}
