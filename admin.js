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

const STATUS_LABELS = {
    new: 'New', contacted: 'Contacted', quote_sent: 'Quote Sent', won: 'Won', lost: 'Lost'
};
const SOURCE_LABELS = {
    manual: 'Manual', website_email: 'Website / Email', whatsapp: 'WhatsApp', referral: 'Referral', other: 'Other'
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
}
