/* ==========================================================================
   Maison De La Fork — motion
   No dependencies. Works with motion.css:
     · intro curtain           (.intro, html.intro-out / .intro-done)
     · text splitting          [data-split="words|chars"]
     · scroll reveals          [data-reveal] + optional [data-delay]
     · scroll progress         [data-progress] → --p (0…1),  html → --hero-p
     · photo tilt              [data-tilt]       (fine pointers)
     · custom cursor                             (fine pointers)
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ------------------------------------------------------------------------
     1. Split text into words / characters (screen readers get the label)
     ---------------------------------------------------------------------- */
  function split(el, mode) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.setAttribute('aria-hidden', 'true');
            if (mode === 'chars') {
              Array.from(part).forEach((ch) => {
                const c = document.createElement('span');
                c.className = 'c';
                c.textContent = ch;
                c.style.setProperty('--i', i++);
                w.appendChild(c);
              });
            } else {
              const inner = document.createElement('span');
              inner.className = 'w__i';
              inner.textContent = part;
              inner.style.setProperty('--i', i++);
              w.appendChild(inner);
            }
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'BR') {
          walk(n);
        }
      });
    };
    walk(el);
    el.setAttribute('aria-label', label);
  }
  $$('[data-split]').forEach((el) => split(el, el.dataset.split));

  /* "Made in your name." — each line keeps its own gold-foil background */
  $$('.story__title > span').forEach((line, li) => {
    const mask = document.createElement('span');
    mask.className = 'line-mask';
    line.classList.add('line');
    line.style.setProperty('--li', li);
    line.replaceWith(mask);
    mask.appendChild(line);
  });

  $$('[data-delay]').forEach((el) => el.style.setProperty('--d', `${parseInt(el.dataset.delay, 10) || 0}ms`));

  /* ------------------------------------------------------------------------
     2. Scroll reveals (start once the curtain has lifted)
     ---------------------------------------------------------------------- */
  const revealEls = $$('[data-reveal], [data-split], .story__title');
  let io = null;
  function startReveals() {
    if (reduce || !('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is-in'));
      return;
    }
    // Photos start fully clipped, and a clipped box never "intersects",
    // so they are watched through a 0-height sentinel placed at their top edge.
    const owners = new Map();
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        (owners.get(e.target) || [e.target]).forEach((el) => el.classList.add('is-in'));
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    revealEls.forEach((el) => {
      let target = el;
      if (el.dataset.reveal === 'photo') {
        target = document.createElement('span');
        target.className = 'reveal-sentinel';
        target.setAttribute('aria-hidden', 'true');
        Object.assign(target.style, {
          position: 'absolute', pointerEvents: 'none', width: '1px', height: '1px',
          left: el.offsetLeft + 'px', top: (el.offsetTop + Math.min(el.offsetHeight * 0.08, 60)) + 'px',
        });
        (el.offsetParent || el.parentElement).appendChild(target);
      }
      owners.set(target, [el]);
      io.observe(target);
    });
  }

  /* ------------------------------------------------------------------------
     3. Scroll progress → CSS variables (one rAF per frame, only when needed)
     ---------------------------------------------------------------------- */
  const hero = document.querySelector('.hero');
  const progressEls = $$('[data-progress]');
  let ticking = false;
  function measure() {
    ticking = false;
    const vh = window.innerHeight;
    if (hero) {
      const h = hero.offsetHeight || 1;
      root.style.setProperty('--hero-p', clamp(window.scrollY / h).toFixed(4));
    }
    progressEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      el.style.setProperty('--p', clamp((vh - r.top) / (vh + r.height)).toFixed(4));
    });
  }
  const requestMeasure = () => { if (!ticking) { ticking = true; requestAnimationFrame(measure); } };
  if (!reduce) {
    window.addEventListener('scroll', requestMeasure, { passive: true });
    window.addEventListener('resize', requestMeasure);
    measure();
  }

  /* ------------------------------------------------------------------------
     4. Photo tilt — a print lifted gently off the table
     ---------------------------------------------------------------------- */
  if (finePointer && !reduce) {
    $$('[data-tilt]').forEach((card) => {
      const max = parseFloat(card.dataset.tilt) || 5;
      let raf = 0;
      card.addEventListener('pointerenter', () => card.classList.add('is-hover', 'is-tilting'));
      card.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `perspective(1100px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`;
        });
      });
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        card.classList.remove('is-hover', 'is-tilting');
        card.style.transform = '';
      });
    });
  }

  /* ------------------------------------------------------------------------
     4b. Hero depth — garlands and title drift a few pixels against the pointer
     ---------------------------------------------------------------------- */
  if (finePointer && !reduce && hero) {
    let tx = 0, ty = 0, cx = 0, cy = 0, on = false;
    const step = () => {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      hero.style.setProperty('--mx', cx.toFixed(4));
      hero.style.setProperty('--my', cy.toFixed(4));
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(step); else on = false;
    };
    const kick = () => { if (!on) { on = true; requestAnimationFrame(step); } };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      kick();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  }

  /* ------------------------------------------------------------------------
     5. Cursor — a dot and a slower ring (difference blend: reads on cream & navy)
     ---------------------------------------------------------------------- */
  if (finePointer && !reduce) {
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(dot, ring);

    let mx = -100, my = -100, rx = -100, ry = -100, running = false;
    const loop = () => {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      if (Math.abs(mx - rx) > 0.1 || Math.abs(my - ry) > 0.1) requestAnimationFrame(loop);
      else running = false;
    };
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY;
      root.classList.add('has-cursor');
      if (!running) { running = true; requestAnimationFrame(loop); }
      const t = e.target;
      ring.classList.toggle('is-link', !!(t.closest && t.closest('a, button')));
      ring.classList.toggle('is-photo', !!(t.closest && t.closest('[data-tilt]')));
    }, { passive: true });
    document.addEventListener('pointerleave', () => root.classList.remove('has-cursor'));
    window.addEventListener('pointerdown', () => ring.classList.add('is-down'));
    window.addEventListener('pointerup', () => ring.classList.remove('is-down'));
  }

  /* ------------------------------------------------------------------------
     6. Intro curtain → hero entrance
     ---------------------------------------------------------------------- */
  const intro = document.querySelector('.intro');
  const skipIntro = reduce || root.classList.contains('no-intro') || !intro;

  function ready() {
    root.classList.add('is-ready');
    startReveals();
  }

  if (skipIntro) {
    root.classList.add('intro-done');
    requestAnimationFrame(() => requestAnimationFrame(ready));
  } else {
    const heroImg = document.querySelector('.hero__bg');
    const imgReady = heroImg && !heroImg.complete
      ? new Promise((res) => { heroImg.addEventListener('load', res, { once: true }); heroImg.addEventListener('error', res, { once: true }); })
      : Promise.resolve();
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const minShow = new Promise((res) => setTimeout(res, 2900));   // let the mark, name and tagline finish
    const maxWait = new Promise((res) => setTimeout(res, 4800));

    Promise.race([Promise.all([imgReady, fontsReady, minShow]), maxWait]).then(() => {
      root.classList.add('intro-out');
      setTimeout(ready, 380);                                        // hero starts while the curtain lifts
      setTimeout(() => { root.classList.add('intro-done'); measure(); }, 1350);
      try { sessionStorage.setItem('mdlf-intro', '1'); } catch (e) { /* private mode */ }
    });
  }
})();
