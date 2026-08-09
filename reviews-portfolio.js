/* ============================================================
   REVIEWS & PORTFOLIO — Supabase-backed
   ============================================================
   Public site behaviour (index.html):
     - Renders approved reviews into #testimonials, after the
       existing real testimonials.
     - Renders real (admin-added) projects into #portfolio,
       before the existing concept-project cards.
     - Handles the "Leave a Review" form: writes a new review
       with status "pending" — it will not appear publicly until
       approved in admin.html.

   Safe no-op: if Supabase hasn't been configured yet
   (see supabase-config.js), every function here exits quietly.
   No console errors, no external Supabase SDK request, no broken
   UI — the site works exactly as before, on static content alone.
   ============================================================ */

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';

const STAR_FULL = '★';
const STAR_EMPTY = '☆';

/* Escapes a string for safe embedding as HTML TEXT (not an attribute
   value / URL — see isSafeHttpUrl for that). */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

/* A field being HTML-escaped does NOT make it safe to drop into an
   href/src — "javascript:alert(1)" contains no special characters
   for escapeHtml() to neutralise. Only allow http(s) URLs through. */
function isSafeHttpUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

let clientPromise = null;
async function loadSupabase() {
    if (!clientPromise) {
        clientPromise = (async () => {
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
            return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
        })();
    }
    return clientPromise;
}

/* ── Render approved reviews into the testimonials grid ── */
async function renderApprovedReviews(supabase) {
    const grid = document.querySelector('.testimonials-grid');
    if (!grid) return;

    const { data, error } = await supabase
        .from('reviews')
        .select('name, company, project_name, rating, message')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(12);

    if (error) {
        console.warn('Could not load reviews (Supabase not set up yet?):', error.message);
        return;
    }

    (data || []).forEach(r => {
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
                    <span>${escapeHtml([r.project_name, r.company].filter(Boolean).join(' · '))}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

/* ── Render real (admin-added) projects into the portfolio grid ── */
async function renderRealProjects(supabase) {
    const grid = document.querySelector('.portfolio-grid');
    if (!grid) return;

    const { data, error } = await supabase
        .from('projects')
        .select('business_name, category, description, services, image_path, live_url, case_study_url')
        .eq('published', true)
        .order('featured', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(24);

    if (error) {
        console.warn('Could not load projects (Supabase not set up yet?):', error.message);
        return;
    }
    if (!data || data.length === 0) return;

    const cards = [];
    data.forEach(p => {
        const category = ['web', 'ai', 'design'].includes(p.category) ? p.category : 'web';
        const bg = p.image_path
            ? `background-image:url('${escapeHtml(p.image_path)}');background-size:cover;background-position:center;`
            : `background: linear-gradient(135deg,rgba(0,212,255,.15),rgba(123,47,255,.15))`;

        let actionLink = '';
        if (isSafeHttpUrl(p.live_url)) {
            actionLink = `<a href="${escapeHtml(p.live_url)}" target="_blank" rel="noopener noreferrer" class="view-link">View Live Website <i class="fas fa-external-link-alt"></i></a>`;
        } else if (isSafeHttpUrl(p.case_study_url)) {
            actionLink = `<a href="${escapeHtml(p.case_study_url)}" target="_blank" rel="noopener noreferrer" class="view-link">View Case Study <i class="fas fa-external-link-alt"></i></a>`;
        }

        const services = Array.isArray(p.services) ? p.services : [];

        const card = document.createElement('div');
        card.className = 'project-card reveal-card visible';
        card.dataset.category = category;
        card.innerHTML = `
            <div class="project-img" style="${bg}">
                <span class="real-badge">Real Project</span>
                ${p.image_path ? '' : '<i class="fas fa-briefcase project-ico"></i>'}
                <div class="project-hover">${actionLink}</div>
            </div>
            <div class="project-body">
                <div class="project-chips">${services.map(s => `<span>${escapeHtml(s)}</span>`).join('')}</div>
                <h3>${escapeHtml(p.business_name)}</h3>
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
   Attached unconditionally on page load (not inside the Supabase
   init path) so the form NEVER falls back to a native browser
   submit — even if Supabase is unconfigured, offline, or fails to
   load. Supabase itself is only loaded lazily, on first submit. */
function initReviewForm() {
    const form = document.getElementById('reviewForm');
    if (!form) return;

    const msgEl = document.getElementById('reviewFormMsg');
    const starInputs = form.querySelectorAll('.star-input input[type="radio"]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // always — regardless of Supabase state

        if (!isSupabaseConfigured()) {
            msgEl.textContent = 'Online review submission is not available yet — please reach out on WhatsApp or the contact form instead.';
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
        if (name.length > 100 || company.length > 150 || projectName.length > 150 || message.length > 2000) {
            msgEl.textContent = '⚠️ Please shorten your review before submitting.';
            msgEl.className = 'form-msg error';
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Sending…';

        try {
            const supabase = await loadSupabase();
            // status is never sent by this form — the database itself
            // rejects anything but 'pending' for anonymous inserts.
            const { error } = await supabase.from('reviews').insert({
                name,
                company: company || null,
                project_name: projectName || null,
                message,
                rating,
                status: 'pending'
            });
            if (error) throw error;

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
   of Supabase configuration state — this is what prevents any
   "broken form" scenario. */
initReviewToggle();
initReviewForm();

/* Reading data (testimonials / portfolio) still only happens once
   Supabase is actually configured — this is also what avoids ever
   loading the Supabase SDK at all when it's unconfigured. */
(async function init() {
    if (!isSupabaseConfigured()) return; // safe no-op until Supabase is set up
    try {
        const supabase = await loadSupabase();
        await Promise.all([
            renderApprovedReviews(supabase),
            renderRealProjects(supabase)
        ]);
    } catch (err) {
        console.warn('Supabase features unavailable:', err.message);
    }
})();
