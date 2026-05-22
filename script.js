/* ============================================================
   Ramagoma Muthuhadini (Anani) | script.js
   Full interactive behaviour — loader · particles · typing ·
   navbar · mobile menu · scroll reveal · skill bars · counters ·
   portfolio filter · EmailJS contact form · back-to-top · socials
   ============================================================ */

/* ─────────────────────────────────────────────────────────────
   ✅ EMAILJS CONFIGURATION
   ─────────────────────────────────────────────────────────────
   To make the contact form send emails to ramagoma212@gmail.com:

   STEP 1 → Go to  https://www.emailjs.com  and create a FREE account
   STEP 2 → Click "Add New Service" → choose Gmail → connect your Gmail
             Note the SERVICE ID  (looks like: service_abc123)
   STEP 3 → Click "Email Templates" → "Create New Template"
             In the template body use these variables:
               From:    {{from_name}}  ({{from_email}})
               Subject: {{subject}}
               Message: {{message}}
             Save the template and note the TEMPLATE ID (template_xyz456)
   STEP 4 → Click "Account" at the top → copy your PUBLIC KEY
   STEP 5 → Paste all three values into the three lines below

   Once done the form will deliver emails directly to your Gmail inbox.
───────────────────────────────────────────────────────────── */
// Paste your actual keys inside the single quotes:

const EMAILJS_PUBLIC_KEY  = 'kny0eiqRgrzjHcU-F';   
const EMAILJS_SERVICE_ID   = 'service_4tyhfpc';   
const EMAILJS_TEMPLATE_ID  = 'template_4ki8lhk';

/* Initialise EmailJS as soon as the script runs */
if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);


}


/* ─────────────────────────────────────────────────────────────
   1. SCROLL-REVEAL SETUP
   Adds  sr-ready  to <body> so CSS can hide reveal elements
   before the IntersectionObserver animates them back in.
   Must run before anything else.
───────────────────────────────────────────────────────────── */
document.body.classList.add('sr-ready');


/* ─────────────────────────────────────────────────────────────
   2. LOADING SCREEN
   Shows the loader while the page loads, then fades it out.
───────────────────────────────────────────────────────────── */
(function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;

    /* Minimum display time so the animation is always seen */
    const minDisplay = 1800; // milliseconds
    const startTime  = Date.now();

    function hideLoader() {
        const elapsed = Date.now() - startTime;
        const delay   = Math.max(0, minDisplay - elapsed);
        setTimeout(() => {
            loader.classList.add('hidden');
        }, delay);
    }

    /* Hide after page fully loads */
    if (document.readyState === 'complete') {
        hideLoader();
    } else {
        window.addEventListener('load', hideLoader);
    }

    /* Safety fallback — always hide after 4 seconds no matter what */
    setTimeout(() => loader.classList.add('hidden'), 4000);
})();


/* ─────────────────────────────────────────────────────────────
   3. FOOTER YEAR
───────────────────────────────────────────────────────────── */
const yearEl = document.getElementById('currentYear');
if (yearEl) yearEl.textContent = new Date().getFullYear();


/* ─────────────────────────────────────────────────────────────
   4. PARTICLE CANVAS BACKGROUND
   Draws softly drifting connected dots behind the whole page.
───────────────────────────────────────────────────────────── */
(function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let W, H, particles;

    /* Resize canvas to match the viewport */
    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    /* Build a fresh array of particles */
    function createParticles() {
        const count = Math.min(Math.floor(W * H / 14000), 90);
        particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x  : Math.random() * W,
                y  : Math.random() * H,
                r  : Math.random() * 1.6 + 0.4,           // radius 0.4 – 2 px
                dx : (Math.random() - 0.5) * 0.35,         // horizontal drift
                dy : (Math.random() - 0.5) * 0.35,         // vertical drift
                a  : Math.random() * 0.5 + 0.1,            // opacity 0.1 – 0.6
                col: Math.random() < 0.5 ? '0,212,255' : '123,47,255' // cyan or purple
            });
        }
    }

    /* Draw one animation frame */
    function draw() {
        ctx.clearRect(0, 0, W, H);

        particles.forEach(p => {
            /* Move each particle */
            p.x += p.dx;
            p.y += p.dy;

            /* Wrap around screen edges */
            if (p.x < 0)  p.x = W;
            if (p.x > W)  p.x = 0;
            if (p.y < 0)  p.y = H;
            if (p.y > H)  p.y = 0;

            /* Draw the dot */
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${p.col},${p.a})`;
            ctx.fill();
        });

        /* Draw faint connecting lines between close particles */
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx   = particles[i].x - particles[j].x;
                const dy   = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0,212,255,${0.06 * (1 - dist / 120)})`;
                    ctx.lineWidth   = 0.5;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(draw);
    }

    resize();
    createParticles();
    draw();

    /* Rebuild on window resize (debounced 200 ms) */
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resize();
            createParticles();
        }, 200);
    });
})();


/* ─────────────────────────────────────────────────────────────
   5. TYPING TEXT EFFECT
   Cycles through service phrases in the hero subtitle.
───────────────────────────────────────────────────────────── */
(function initTyping() {
    const el = document.getElementById('typedText');
    if (!el) return;

    const phrases = [
        'Web Developer',
        'AI Solutions Creator',
        'CV Designer That Gets Jobs',
        'UI/UX Designer',
        'Business Website Builder',
        'WhatsApp Integration Expert',
        'SEO Specialist'
    ];

    let phraseIndex  = 0;
    let charIndex    = 0;
    let isDeleting   = false;
    const typeSpeed  = 80;    // ms per character while typing
    const deleteSpeed= 40;    // ms per character while deleting
    const pauseAfter = 1800;  // ms pause after full phrase is typed

    function type() {
        const current = phrases[phraseIndex];

        if (isDeleting) {
            el.textContent = current.slice(0, charIndex - 1);
            charIndex--;

            if (charIndex === 0) {
                isDeleting  = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                setTimeout(type, 400);
            } else {
                setTimeout(type, deleteSpeed);
            }

        } else {
            el.textContent = current.slice(0, charIndex + 1);
            charIndex++;

            if (charIndex === current.length) {
                isDeleting = true;
                setTimeout(type, pauseAfter);
            } else {
                setTimeout(type, typeSpeed);
            }
        }
    }

    /* Small delay so the page has settled before typing starts */
    setTimeout(type, 800);
})();


/* ─────────────────────────────────────────────────────────────
   6. STICKY NAVBAR  — adds .scrolled class on scroll
───────────────────────────────────────────────────────────── */
(function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    function onScroll() {
        navbar.classList.toggle('scrolled', window.scrollY > 40);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // check immediately on load
})();


/* ─────────────────────────────────────────────────────────────
   7. MOBILE HAMBURGER MENU
───────────────────────────────────────────────────────────── */
(function initMobileMenu() {
    const hamburger  = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeBtn   = document.getElementById('mobileClose');
    const overlay    = document.getElementById('menuOverlay');
    const mobileLinks= document.querySelectorAll('.mobile-link');

    if (!hamburger || !mobileMenu) return;

    function openMenu() {
        mobileMenu.classList.add('open');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // stop background scrolling
    }

    function closeMenu() {
        mobileMenu.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', openMenu);
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    if (overlay)  overlay.addEventListener('click', closeMenu);

    /* Close menu when any link inside it is tapped */
    mobileLinks.forEach(link => link.addEventListener('click', closeMenu));
})();


/* ─────────────────────────────────────────────────────────────
   8. SCROLL REVEAL  — IntersectionObserver
   Cards in grid sections are staggered so they cascade in.
───────────────────────────────────────────────────────────── */
(function initScrollReveal() {
    const revealEls = document.querySelectorAll('.reveal, .reveal-card');
    if (!revealEls.length) return;

    /* Stagger the animation delay for cards in each grid */
    document.querySelectorAll(
        '.services-grid, .portfolio-grid, .testimonials-grid'
    ).forEach(grid => {
        grid.querySelectorAll('.reveal-card').forEach((card, i) => {
            card.style.transitionDelay = `${i * 0.1}s`;
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // animate once only
            }
        });
    }, {
        threshold : 0.12,
        rootMargin: '0px 0px -40px 0px'
    });

    revealEls.forEach(el => observer.observe(el));
})();


/* ─────────────────────────────────────────────────────────────
   9. SKILL BARS ANIMATION
   Fills the coloured bars when the About section scrolls in.
───────────────────────────────────────────────────────────── */
(function initSkillBars() {
    const bars = document.querySelectorAll('.skill-fill');
    if (!bars.length) return;

    let animated = false;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !animated) {
                animated = true;
                bars.forEach(bar => {
                    const target = bar.getAttribute('data-width') || '0';
                    /* Short delay so the reveal animation finishes first */
                    setTimeout(() => {
                        bar.style.width = target + '%';
                    }, 300);
                });
                observer.disconnect();
            }
        });
    }, { threshold: 0.3 });

    const skillsWrapper = document.querySelector('.skills-list');
    if (skillsWrapper) observer.observe(skillsWrapper);
})();


/* ─────────────────────────────────────────────────────────────
   10. COUNTER ANIMATION  (hero stats)
   Counts up the numbers when the stats row comes into view.
───────────────────────────────────────────────────────────── */
(function initCounters() {
    const counters = document.querySelectorAll('.stat-number[data-count]');
    if (!counters.length) return;

    let done = false;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !done) {
                done = true;
                counters.forEach(counter => {
                    const target   = parseInt(counter.getAttribute('data-count'), 10);
                    if (isNaN(target)) return; // skip non-integer values like "1.5"
                    const duration = 1800;
                    const step     = duration / target;
                    let current    = 0;

                    const timer = setInterval(() => {
                        current++;
                        counter.textContent = current;
                        if (current >= target) {
                            counter.textContent = target;
                            clearInterval(timer);
                        }
                    }, step);
                });
                observer.disconnect();
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) observer.observe(heroStats);
})();


/* ─────────────────────────────────────────────────────────────
   11. PORTFOLIO FILTER BUTTONS
   Shows / hides project cards based on their data-category.
───────────────────────────────────────────────────────────── */
(function initPortfolioFilter() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const cards      = document.querySelectorAll('.project-card');
    if (!filterBtns.length || !cards.length) return;

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {

            /* Highlight active button */
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');

            cards.forEach(card => {
                const category = card.getAttribute('data-category');
                const show     = filter === 'all' || category === filter;

                if (show) {
                    card.classList.remove('hidden');
                    /* Re-trigger the reveal animation */
                    card.classList.remove('visible');
                    requestAnimationFrame(() => card.classList.add('visible'));
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    });
})();


/* ─────────────────────────────────────────────────────────────
   12. CONTACT FORM  — sends email via EmailJS
   Falls back to a mailto link if EmailJS is not configured.
───────────────────────────────────────────────────────────── */
(function initContactForm() {
    const form    = document.getElementById('contactForm');
    const msgEl   = document.getElementById('formMsg');
    if (!form || !msgEl) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const nameField    = document.getElementById('fname');
        const emailField   = document.getElementById('femail');
        const subjectField = document.getElementById('fsubject');
        const msgField     = document.getElementById('fmessage');

        /* ── Validation ── */
        if (!nameField.value.trim()) {
            showMsg('⚠️ Please enter your name.', 'error');
            nameField.focus();
            return;
        }
        if (!emailField.value.trim() || !emailField.value.includes('@')) {
            showMsg('⚠️ Please enter a valid email address.', 'error');
            emailField.focus();
            return;
        }
        if (!msgField.value.trim()) {
            showMsg('⚠️ Please write a message before sending.', 'error');
            msgField.focus();
            return;
        }

        const submitBtn = form.querySelector('.submit-btn');
        submitBtn.disabled  = true;
        submitBtn.innerHTML = '<span>Sending…</span> <i class="fas fa-spinner fa-spin"></i>';

        /* ── EmailJS send ── */
        if (
            typeof emailjs !== 'undefined' &&
            EMAILJS_PUBLIC_KEY  !== 'YOUR_PUBLIC_KEY' &&
            EMAILJS_SERVICE_ID  !== 'YOUR_SERVICE_ID' &&
            EMAILJS_TEMPLATE_ID !== 'YOUR_TEMPLATE_ID'
        ) {
            /* Real send via EmailJS */
            const templateParams = {
                from_name : nameField.value.trim(),
                from_email: emailField.value.trim(),
                subject   : subjectField.value.trim() || 'New message from portfolio',
                message   : msgField.value.trim(),
                to_email  : 'ramagoma212@gmail.com'
            };

            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
                .then(() => {
                    submitBtn.disabled  = false;
                    submitBtn.innerHTML = '<span>Send Message</span> <i class="fas fa-paper-plane"></i>';
                    form.reset();
                    showMsg('✅ Message sent! I will get back to you soon.', 'success');
                })
                .catch((err) => {
                    console.error('EmailJS error:', err);
                    submitBtn.disabled  = false;
                    submitBtn.innerHTML = '<span>Send Message</span> <i class="fas fa-paper-plane"></i>';
                    showMsg('❌ Sending failed. Please try WhatsApp or email me directly.', 'error');
                });

        } else {
            /* ── Fallback: open default email client with prefilled message ── */
            /* This works without EmailJS setup — it just opens your email app  */
            const subject = encodeURIComponent(
                subjectField.value.trim() || 'New message from portfolio website'
            );
            const body = encodeURIComponent(
                `Name: ${nameField.value.trim()}\n` +
                `Email: ${emailField.value.trim()}\n\n` +
                `Message:\n${msgField.value.trim()}`
            );

            window.location.href = `mailto:ramagoma212@gmail.com?subject=${subject}&body=${body}`;

            setTimeout(() => {
                submitBtn.disabled  = false;
                submitBtn.innerHTML = '<span>Send Message</span> <i class="fas fa-paper-plane"></i>';
                form.reset();
                showMsg(
                    '📧 Your email app opened with the message ready to send!',
                    'success'
                );
            }, 1000);
        }
    });

    /* Helper to show a timed status message below the form */
    function showMsg(text, type) {
        msgEl.textContent = text;
        msgEl.className   = 'form-msg ' + type;
        setTimeout(() => { msgEl.className = 'form-msg'; }, 6000);
    }
})();


/* ─────────────────────────────────────────────────────────────
   13. BACK-TO-TOP BUTTON
───────────────────────────────────────────────────────────── */
(function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();


/* ─────────────────────────────────────────────────────────────
   14. SMOOTH SCROLL  for all internal anchor links
───────────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        const target = document.querySelector(targetId);
        if (!target) return;
        e.preventDefault();
        const offset = 80; // height of the sticky navbar
        const top    = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
    });
});


/* ─────────────────────────────────────────────────────────────
   15. ACTIVE NAV LINK HIGHLIGHT on scroll
   Highlights the matching nav link as sections come into view.
───────────────────────────────────────────────────────────── */
(function initActiveNav() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');
    if (!sections.length || !navLinks.length) return;

    function updateActive() {
        const scrollY = window.scrollY + 120;

        sections.forEach(section => {
            const top    = section.offsetTop;
            const height = section.offsetHeight;
            const id     = section.getAttribute('id');

            if (scrollY >= top && scrollY < top + height) {
                navLinks.forEach(link => {
                    link.classList.remove('active-link');
                    if (link.getAttribute('href') === '#' + id) {
                        link.classList.add('active-link');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive(); // run once on load
})();


/* ─────────────────────────────────────────────────────────────
   16. SERVICE CARD  — subtle tilt on mouse move (desktop only)
   Gives the service cards a premium 3-D feel on hover.
───────────────────────────────────────────────────────────── */
(function initCardTilt() {
    if (window.matchMedia('(hover: none)').matches) return; // skip on touch devices

    document.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect   = card.getBoundingClientRect();
            const x      = e.clientX - rect.left;
            const y      = e.clientY - rect.top;
            const centreX= rect.width  / 2;
            const centreY= rect.height / 2;
            const rotateX= ((y - centreY) / centreY) * -6; // max 6°
            const rotateY= ((x - centreX) / centreX) *  6;

            card.style.transform =
                `translateY(-8px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            card.style.transition = 'transform 0.1s ease';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform  = '';
            card.style.transition = 'transform 0.4s ease';
        });
    });
})();

/* ─────────────────────────────────────────────────────────────
   17. ACADEMIC APPLICATIONS CARD — click navigates to service page
   ─────────────────────────────────────────────────────────────
   Self-contained DOMContentLoaded block — runs safely alongside
   every existing feature. The guard  "if (!academicCard) return"
   means this produces zero errors on any page that does not have
   this card (e.g. business-websites.html).
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const academicCard = document.getElementById('academic-card');

    /* Guard: silently exit if this card is not on the current page */
    if (!academicCard) return;

    /* ── Pointer cursor ── */
    academicCard.style.cursor = 'pointer';

    /* ── "Learn More" arrow hint — fades in on hover ── */
    const hint = document.createElement('div');
    hint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    hint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');

    academicCard.appendChild(hint);

    /* Show arrow when user hovers */
    academicCard.addEventListener('mouseenter', () => {
        hint.style.opacity   = '1';
        hint.style.transform = 'translateX(0)';
    });

    /* Hide arrow when user stops hovering */
    academicCard.addEventListener('mouseleave', () => {
        hint.style.opacity   = '0';
        hint.style.transform = 'translateX(-6px)';
    });

    /* ── Click → navigate to the new page ── */
    academicCard.addEventListener('click', function () {
        window.location.href = 'academic-applications.html';
    });

    /* ── Keyboard accessibility (Tab + Enter support) ── */
    academicCard.setAttribute('tabindex', '0');
    academicCard.setAttribute('role', 'link');
    academicCard.setAttribute('aria-label', 'Learn more about Tertiary Applications');

    academicCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'academic-applications.html';
        }
    });

});

/* ─────────────────────────────────────────────────────────────
   18. BUSINESS WEBSITES CARD — click navigates to service page
   ─────────────────────────────────────────────────────────────
   Waits for the DOM to be ready, then wires up the #business-card
   so clicking anywhere on it takes the user to business-websites.html.

   Why DOMContentLoaded here instead of a plain querySelector?
   - Guarantees the element exists before we try to target it,
     no matter how fast or slow the rest of the script runs.
   - Keeps this block self-contained and safe alongside every other
     feature (particles, scroll-reveal, tilt effect, etc.).
   - Produces zero console errors if the card is ever absent
     (e.g. on business-websites.html itself, which has no #business-card).
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const businessCard = document.getElementById('business-card');

    /* Guard: only run on pages that actually contain this card */
    if (!businessCard) return;

    /* ── Pointer cursor ── */
    /* style.css already sets cursor:pointer on .service-card,
       but we set it here too as an explicit programmatic guarantee. */
    businessCard.style.cursor = 'pointer';

    /* ── Visual "clickable" hint — a small arrow that appears at the
       bottom of the card so visitors know it leads somewhere ── */
    const hint = document.createElement('div');
    hint.innerHTML  = 'Learn More <i class="fas fa-arrow-right"></i>';
    hint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease',
    ].join(';');

    businessCard.appendChild(hint);

    /* Show/hide the arrow on hover */
    businessCard.addEventListener('mouseenter', () => {
        hint.style.opacity   = '1';
        hint.style.transform = 'translateX(0)';
    });
    businessCard.addEventListener('mouseleave', () => {
        hint.style.opacity   = '0';
        hint.style.transform = 'translateX(-6px)';
    });

    /* ── Click → navigate ── */
    businessCard.addEventListener('click', function () {
        /* Relative path works because both HTML files sit in the
           same project directory — no sub-folders needed. */
        window.location.href = 'business-websites.html';
    });

    /* ── Keyboard accessibility (Enter key on focused card) ── */
    businessCard.setAttribute('tabindex', '0');
    businessCard.setAttribute('role', 'link');
    businessCard.setAttribute('aria-label', 'Learn more about Business Websites');

    businessCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'business-websites.html';
        }
    });

});

/* ─────────────────────────────────────────────────────────────
   19. CV SERVICES CARD — click navigates to cv-services.html
   ─────────────────────────────────────────────────────────────
   Identical pattern to sections 17 (academic) and 18 (business).
   The guard "if (!cvCard) return" means zero errors on any page
   that does not have this card (e.g. cv-services.html itself).
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const cvCard = document.getElementById('cv-card');

    /* Guard: silently exit if this card is not on the current page */
    if (!cvCard) return;

    /* ── Pointer cursor ── */
    cvCard.style.cursor = 'pointer';

    /* ── "Learn More" arrow hint — fades in on hover ── */
    const hint = document.createElement('div');
    hint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    hint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');

    cvCard.appendChild(hint);

    /* Show arrow when user hovers */
    cvCard.addEventListener('mouseenter', () => {
        hint.style.opacity   = '1';
        hint.style.transform = 'translateX(0)';
    });

    /* Hide arrow when user stops hovering */
    cvCard.addEventListener('mouseleave', () => {
        hint.style.opacity   = '0';
        hint.style.transform = 'translateX(-6px)';
    });

    /* ── Click → navigate to cv-services.html ── */
    cvCard.addEventListener('click', function () {
        window.location.href = 'cv-services.html';
    });

    /* ── Keyboard accessibility (Tab + Enter support) ── */
    cvCard.setAttribute('tabindex', '0');
    cvCard.setAttribute('role', 'link');
    cvCard.setAttribute('aria-label', 'Learn more about CV Services');

    cvCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'cv-services.html';
        }
    });

});

/* ─────────────────────────────────────────────────────────────
   20. AI CHATBOTS CARD → chatbots.html
   ─────────────────────────────────────────────────────────────
   Requires  id="chatbot-card"  on the AI Chatbots service card
   in index.html (see index.html instructions below).
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const chatbotCard = document.getElementById('chatbot-card');

    /* Guard: exit silently on any page that has no #chatbot-card */
    if (!chatbotCard) return;

    /* Pointer cursor */
    chatbotCard.style.cursor = 'pointer';

    /* "Learn More" arrow hint — slides in on hover */
    const chatbotHint = document.createElement('div');
    chatbotHint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    chatbotHint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');
    chatbotCard.appendChild(chatbotHint);

    chatbotCard.addEventListener('mouseenter', () => {
        chatbotHint.style.opacity   = '1';
        chatbotHint.style.transform = 'translateX(0)';
    });
    chatbotCard.addEventListener('mouseleave', () => {
        chatbotHint.style.opacity   = '0';
        chatbotHint.style.transform = 'translateX(-6px)';
    });

    /* Click → navigate */
    chatbotCard.addEventListener('click', function () {
        window.location.href = 'chatbots.html';
    });

    /* Keyboard accessibility */
    chatbotCard.setAttribute('tabindex', '0');
    chatbotCard.setAttribute('role', 'link');
    chatbotCard.setAttribute('aria-label', 'Learn more about AI Chatbots');

    chatbotCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'chatbots.html';
        }
    });

});


/* ─────────────────────────────────────────────────────────────
   21. WHATSAPP INTEGRATION CARD → WhatsAppIntegration.html
   ─────────────────────────────────────────────────────────────
   Requires  id="whatsapp-card"  on the WhatsApp Integration
   service card in index.html (see instructions below).
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const whatsappCard = document.getElementById('whatsapp-card');

    /* Guard: exit silently on any page that has no #whatsapp-card */
    if (!whatsappCard) return;

    /* Pointer cursor */
    whatsappCard.style.cursor = 'pointer';

    /* "Learn More" arrow hint */
    const waHint = document.createElement('div');
    waHint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    waHint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');
    whatsappCard.appendChild(waHint);

    whatsappCard.addEventListener('mouseenter', () => {
        waHint.style.opacity   = '1';
        waHint.style.transform = 'translateX(0)';
    });
    whatsappCard.addEventListener('mouseleave', () => {
        waHint.style.opacity   = '0';
        waHint.style.transform = 'translateX(-6px)';
    });

    /* Click → navigate */
    whatsappCard.addEventListener('click', function () {
        window.location.href = 'WhatsAppIntegration.html';
    });

    /* Keyboard accessibility */
    whatsappCard.setAttribute('tabindex', '0');
    whatsappCard.setAttribute('role', 'link');
    whatsappCard.setAttribute('aria-label', 'Learn more about WhatsApp Integration');

    whatsappCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'WhatsAppIntegration.html';
        }
    });

});


/* ─────────────────────────────────────────────────────────────
   22. PORTFOLIO WEBSITES CARD → PortfolioWebsite.html
   ─────────────────────────────────────────────────────────────
   Requires  id="portfolio-card"  on the Portfolio Websites
   service card in index.html (see instructions below).
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const portfolioCard = document.getElementById('portfolio-card');

    /* Guard: exit silently on any page that has no #portfolio-card */
    if (!portfolioCard) return;

    /* Pointer cursor */
    portfolioCard.style.cursor = 'pointer';

    /* "Learn More" arrow hint */
    const portHint = document.createElement('div');
    portHint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    portHint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');
    portfolioCard.appendChild(portHint);

    portfolioCard.addEventListener('mouseenter', () => {
        portHint.style.opacity   = '1';
        portHint.style.transform = 'translateX(0)';
    });
    portfolioCard.addEventListener('mouseleave', () => {
        portHint.style.opacity   = '0';
        portHint.style.transform = 'translateX(-6px)';
    });

    /* Click → navigate */
    portfolioCard.addEventListener('click', function () {
        window.location.href = 'PortfolioWebsite.html';
    });

    /* Keyboard accessibility */
    portfolioCard.setAttribute('tabindex', '0');
    portfolioCard.setAttribute('role', 'link');
    portfolioCard.setAttribute('aria-label', 'Learn more about Portfolio Websites');

    portfolioCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'PortfolioWebsite.html';
        }
    });

});

/* ─────────────────────────────────────────────────────────────
   23 GRADE 12 ACADEMIC SUCCESS CARD → Excel-in-Grade12.html
   ─────────────────────────────────────────────────────────────
   Requires  id="matric-excellence-card"  on the service card
   in index.html (added in Change 1 above).
   The guard "if (!matricCard) return" means zero errors on
   any other page that does not have this card.
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const matricCard = document.getElementById('matric-excellence-card');

    /* Exit silently on pages that don't have this card */
    if (!matricCard) return;

    /* Pointer cursor on hover */
    matricCard.style.cursor = 'pointer';

    /* "Learn More" arrow that fades in on hover */
    const hint = document.createElement('div');
    hint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    hint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');
    matricCard.appendChild(hint);

    /* Show arrow on hover */
    matricCard.addEventListener('mouseenter', () => {
        hint.style.opacity   = '1';
        hint.style.transform = 'translateX(0)';
    });

    /* Hide arrow when hover ends */
    matricCard.addEventListener('mouseleave', () => {
        hint.style.opacity   = '0';
        hint.style.transform = 'translateX(-6px)';
    });

    /* Click navigates to the destination page */
    matricCard.addEventListener('click', function () {
        window.location.href = 'Excel-in-Grade12.html';
    });

    /* Keyboard support — Tab + Enter works too */
    matricCard.setAttribute('tabindex', '0');
    matricCard.setAttribute('role', 'link');
    matricCard.setAttribute('aria-label', 'Learn more about Grade 12 Academic Success');

    matricCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'Excel-in-Grade12.html';
        }
    });

});

/* ─────────────────────────────────────────────────────────────
   24 REDESIGN CARD  →  website-RedesingAndDesing.html
   ─────────────────────────────────────────────────────────────
   Requires  id="redesign-card"  on the Website Redesign
   service card in index.html (done in Step 1 above).
   Guard prevents errors on all other pages.
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const redesignCard = document.getElementById('redesign-card');

    /* Exit silently on any page that has no #redesign-card */
    if (!redesignCard) return;

    /* Pointer cursor on hover */
    redesignCard.style.cursor = 'pointer';

    /* "Learn More" arrow — fades in on hover */
    const redesignHint = document.createElement('div');
    redesignHint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    redesignHint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');
    redesignCard.appendChild(redesignHint);

    /* Show arrow on hover */
    redesignCard.addEventListener('mouseenter', () => {
        redesignHint.style.opacity   = '1';
        redesignHint.style.transform = 'translateX(0)';
    });

    /* Hide arrow when hover ends */
    redesignCard.addEventListener('mouseleave', () => {
        redesignHint.style.opacity   = '0';
        redesignHint.style.transform = 'translateX(-6px)';
    });

    /* Click → navigate to the redesign page */
    redesignCard.addEventListener('click', function () {
        window.location.href = 'website-RedesingAndDesing.html';
    });

    /* Keyboard support (Tab + Enter) */
    redesignCard.setAttribute('tabindex', '0');
    redesignCard.setAttribute('role', 'link');
    redesignCard.setAttribute('aria-label', 'Learn more about Website Redesign');

    redesignCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'website-RedesingAndDesing.html';
        }
    });

});


/* ─────────────────────────────────────────────────────────────
   25 SEO CARD  →  SEO-Optimization.html
   ─────────────────────────────────────────────────────────────
   Requires  id="seo-card"  on the SEO Optimization service
   card in index.html (done in Step 1 above).
   Guard prevents errors on all other pages.
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

    const seoCard = document.getElementById('seo-card');

    /* Exit silently on any page that has no #seo-card */
    if (!seoCard) return;

    /* Pointer cursor on hover */
    seoCard.style.cursor = 'pointer';

    /* "Learn More" arrow — fades in on hover */
    const seoHint = document.createElement('div');
    seoHint.innerHTML = 'Learn More <i class="fas fa-arrow-right"></i>';
    seoHint.style.cssText = [
        'margin-top: 14px',
        'font-size: .8rem',
        'font-weight: 600',
        'color: var(--cyan)',
        'display: flex',
        'align-items: center',
        'gap: 6px',
        'opacity: 0',
        'transform: translateX(-6px)',
        'transition: opacity .3s ease, transform .3s ease'
    ].join(';');
    seoCard.appendChild(seoHint);

    /* Show arrow on hover */
    seoCard.addEventListener('mouseenter', () => {
        seoHint.style.opacity   = '1';
        seoHint.style.transform = 'translateX(0)';
    });

    /* Hide arrow when hover ends */
    seoCard.addEventListener('mouseleave', () => {
        seoHint.style.opacity   = '0';
        seoHint.style.transform = 'translateX(-6px)';
    });

    /* Click → navigate to the SEO page */
    seoCard.addEventListener('click', function () {
        window.location.href = 'SEO-Optimization.html';
    });

    /* Keyboard support (Tab + Enter) */
    seoCard.setAttribute('tabindex', '0');
    seoCard.setAttribute('role', 'link');
    seoCard.setAttribute('aria-label', 'Learn more about SEO Optimization');

    seoCard.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.location.href = 'SEO-Optimization.html';
        }
    });

});