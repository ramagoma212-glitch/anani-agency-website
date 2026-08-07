/* ============================================================
   REVIEWS & PORTFOLIO — Firebase-backed
   ============================================================
   Public site behaviour (index.html):
     - Renders approved reviews into #testimonials, after the
       existing real testimonials.
     - Renders real (admin-added) projects into #portfolio,
       before the existing concept-project cards.
     - Handles the "Leave a Review" form: writes a new review
       with status "pending" — it will not appear publicly until
       approved in admin.html.

   Safe no-op: if Firebase hasn't been configured yet
   (see firebase-config.js), every function here exits quietly.
   No console errors, no broken UI, the site works exactly as
   before.
   ============================================================ */

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const STAR_FULL = '★';
const STAR_EMPTY = '☆';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

async function loadFirebase() {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const firestore = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    const app = initializeApp(firebaseConfig);
    const db = firestore.getFirestore(app);
    return { app, db, firestore };
}

/* ── Render approved reviews into the testimonials grid ── */
async function renderApprovedReviews(db, firestore) {
    const grid = document.querySelector('.testimonials-grid');
    if (!grid) return;

    const { collection, query, where, orderBy, limit, getDocs } = firestore;
    let snap;
    try {
        const q = query(
            collection(db, 'reviews'),
            where('status', '==', 'approved'),
            orderBy('createdAt', 'desc'),
            limit(12)
        );
        snap = await getDocs(q);
    } catch (err) {
        console.warn('Could not load reviews (Firestore not set up yet?):', err.message);
        return;
    }

    snap.forEach(doc => {
        const r = doc.data();
        const rating = Math.min(5, Math.max(1, Number(r.rating) || 5));
        const stars = STAR_FULL.repeat(rating) + STAR_EMPTY.repeat(5 - rating);

        const card = document.createElement('div');
        card.className = 'testi-card reveal-card visible';
        card.innerHTML = `
            <div class="quote-mark">"</div>
            <div class="stars">${stars}</div>
            <p>"${escapeHtml(r.message)}"</p>
            <div class="client-row">
                <div class="client-avatar">${escapeHtml(initials(r.name))}</div>
                <div>
                    <strong>${escapeHtml(r.name)}</strong>
                    <span>${escapeHtml([r.projectName, r.company].filter(Boolean).join(' · '))}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ── Render real (admin-added) projects into the portfolio grid ── */
async function renderRealProjects(db, firestore) {
    const grid = document.querySelector('.portfolio-grid');
    if (!grid) return;

    const { collection, query, orderBy, limit, getDocs } = firestore;
    let snap;
    try {
        const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'), limit(24));
        snap = await getDocs(q);
    } catch (err) {
        console.warn('Could not load projects (Firestore not set up yet?):', err.message);
        return;
    }
    if (snap.empty) return;

    const cards = [];
    snap.forEach(doc => {
        const p = doc.data();
        const category = ['web', 'ai', 'design'].includes(p.category) ? p.category : 'web';
        const bg = p.imageUrl
            ? `background-image:url('${p.imageUrl}');background-size:cover;background-position:center;`
            : `background: linear-gradient(135deg,rgba(0,212,255,.15),rgba(123,47,255,.15))`;

        const card = document.createElement('div');
        card.className = 'project-card reveal-card visible';
        card.dataset.category = category;
        card.innerHTML = `
            <div class="project-img" style="${bg}">
                <span class="real-badge">Real Project</span>
                ${p.imageUrl ? '' : '<i class="fas fa-briefcase project-ico"></i>'}
                <div class="project-hover">
                    ${p.liveUrl
                        ? `<a href="${escapeHtml(p.liveUrl)}" target="_blank" rel="noopener noreferrer" class="view-link">View Live Website <i class="fas fa-external-link-alt"></i></a>`
                        : (p.caseStudyUrl
                            ? `<a href="${escapeHtml(p.caseStudyUrl)}" target="_blank" rel="noopener noreferrer" class="view-link">View Case Study <i class="fas fa-external-link-alt"></i></a>`
                            : '')}
                </div>
            </div>
            <div class="project-body">
                <div class="project-chips">${(p.servicesDelivered || '').split(',').filter(Boolean).map(s => `<span>${escapeHtml(s.trim())}</span>`).join('')}</div>
                <h3>${escapeHtml(p.businessName)}</h3>
                <p>${escapeHtml(p.description)}</p>
            </div>
        `;
        cards.push(card);
    });

    // Insert real projects at the top of the grid, before the concept cards
    cards.reverse().forEach(c => grid.insertBefore(c, grid.firstChild));
}

/* ── Compact toggle: "Leave a Review" button reveals the form ── */
function initReviewToggle() {
    const toggleBtn = document.getElementById('reviewToggleBtn');
    const wrap = document.getElementById('reviewFormWrap');
    if (!toggleBtn || !wrap) return;
    toggleBtn.addEventListener('click', () => {
        const open = wrap.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.textContent = open ? 'Hide Review Form' : 'Leave a Review';
    });
}

/* ── "Leave a Review" form submission ──
   Attached unconditionally on page load (not inside the Firebase
   init path) so the form NEVER falls back to a native browser
   submit — even if Firebase is unconfigured, offline, or fails to
   load. Firebase itself is only loaded lazily, on first submit. */
function initReviewForm() {
    const form = document.getElementById('reviewForm');
    if (!form) return;

    const msgEl = document.getElementById('reviewFormMsg');
    const starInputs = form.querySelectorAll('.star-input input[type="radio"]');
    let firebasePromise = null;

    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // always — regardless of Firebase state

        if (!isFirebaseConfigured()) {
            msgEl.textContent = 'Reviews aren\'t open yet — please reach out on WhatsApp or the contact form instead.';
            msgEl.className = 'form-msg error';
            return;
        }

        const name = form.querySelector('#rvName').value.trim();
        const company = form.querySelector('#rvCompany').value.trim();
        const projectName = form.querySelector('#rvProject').value.trim();
        const message = form.querySelector('#rvMessage').value.trim();
        const ratingInput = [...starInputs].find(r => r.checked);
        const rating = ratingInput ? Number(ratingInput.value) : 0;

        if (!name || !message || !rating) {
            msgEl.textContent = '⚠️ Please add your name, a rating, and a short review.';
            msgEl.className = 'form-msg error';
            return;
        }
        if (name.length > 100 || company.length > 100 || projectName.length > 100 || message.length > 2000) {
            msgEl.textContent = '⚠️ Please shorten your review before submitting.';
            msgEl.className = 'form-msg error';
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Sending…';

        try {
            if (!firebasePromise) firebasePromise = loadFirebase();
            const { db, firestore } = await firebasePromise;
            const { collection, addDoc, serverTimestamp } = firestore;

            await addDoc(collection(db, 'reviews'), {
                name, company, projectName, message, rating,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            form.reset();
            msgEl.textContent = '✅ Thank you! Your review will appear once it\'s been approved.';
            msgEl.className = 'form-msg success';
        } catch (err) {
            console.error('Review submit error:', err);
            msgEl.textContent = '❌ Something went wrong sending your review. Please try again or WhatsApp us instead.';
            msgEl.className = 'form-msg error';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Submit Review';
        }
    });
}

/* Always attach the form handler + toggle, immediately, regardless
   of Firebase configuration state — this is what prevents any
   "broken form" scenario. */
initReviewToggle();
initReviewForm();

/* Reading data (testimonials / portfolio) still only happens once
   Firebase is actually configured. */
(async function init() {
    if (!isFirebaseConfigured()) return; // safe no-op until Firebase is set up
    try {
        const { db, firestore } = await loadFirebase();
        await Promise.all([
            renderApprovedReviews(db, firestore),
            renderRealProjects(db, firestore)
        ]);
    } catch (err) {
        console.warn('Firebase features unavailable:', err.message);
    }
})();
