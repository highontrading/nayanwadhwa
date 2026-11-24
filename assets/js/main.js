/* Nayan Wadhwa — site behaviour. No dependencies. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Calls `cb(true|false)` whenever `el` enters or leaves the viewport. */
  const watch = (el, cb, threshold = 0.35) => {
    if (!('IntersectionObserver' in window)) return cb(true);
    new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), { threshold }).observe(el);
  };

  /* Theme ----------------------------------------------------------------- */

  function initTheme() {
    const btn = $('[data-theme-toggle]');
    if (!btn) return;
    const meta = $('meta[name="theme-color"]');

    const apply = (theme) => {
      root.setAttribute('data-theme', theme);
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      if (meta) meta.content = theme === 'dark' ? '#0f0f0f' : '#fafafa';
    };
    const current = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    apply(current());

    // Fetch the other theme's artwork as soon as a switch looks likely.
    const warm = () => {
      const img = $(`.mind__head--${current() === 'dark' ? 'light' : 'dark'}`);
      if (!img) return;
      const pre = new Image();
      pre.sizes = img.sizes;
      pre.srcset = img.srcset;
      pre.src = img.src;
    };
    btn.addEventListener('pointerenter', warm, { once: true });
    btn.addEventListener('focus', warm, { once: true });

    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('nw-theme', next);
      } catch (e) { /* private mode: the choice just won't persist */ }
      if (document.startViewTransition && !reduceMotion.matches) {
        document.startViewTransition(() => apply(next));
      } else {
        apply(next);
      }
    });
  }

  /* Navigation ------------------------------------------------------------ */

  function initNav() {
    const nav = $('[data-nav]');
    if (!nav) return;

    const links = $$('.nav__links a[href^="#"]', nav);
    const thumb = $('.nav__thumb', nav);
    const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
    let active = null;
    let ticking = false;

    const moveThumb = () => {
      if (!thumb) return;
      const link = links.find((a) => a.hash === `#${active}`);
      if (!link) return thumb.classList.remove('is-on');
      thumb.style.setProperty('--x', `${link.offsetLeft}px`);
      thumb.style.setProperty('--w', `${link.offsetWidth}px`);
      thumb.classList.add('is-on');
    };

    const update = () => {
      ticking = false;
      nav.classList.toggle('is-scrolled', window.scrollY > 24);
      if (!sections.length) return;

      const line = window.innerHeight * 0.4;
      let id = null;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) id = section.id;
      }
      // At the very bottom the last section wins even if it is short.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        id = sections[sections.length - 1].id;
      }
      if (id === active) return;
      active = id;
      links.forEach((a) => {
        const on = a.hash === `#${id}`;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      moveThumb();
    };

    const request = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', () => { request(); moveThumb(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveThumb);
    update();
  }

  /* Scroll reveals -------------------------------------------------------- */

  function initReveal() {
    const items = $$('[data-reveal]');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.06 });
    items.forEach((el) => io.observe(el));
  }

  /* Hero: rotating tagline + pointer parallax ----------------------------- */

  function initRotator() {
    const el = $('[data-rotator]');
    if (!el) return;
    const items = $$('.rotator__item', el);
    if (items.length < 2) return;
    let index = 0;
    let timer = 0;

    const next = () => {
      const prev = items[index];
      index = (index + 1) % items.length;
      prev.classList.remove('is-active');
      prev.classList.add('is-leaving');
      items[index].classList.remove('is-leaving');
      items[index].classList.add('is-active');
      setTimeout(() => prev.classList.remove('is-leaving'), 700);
    };
    const stop = () => clearInterval(timer);
    const start = () => {
      stop();
      if (!reduceMotion.matches && !document.hidden) timer = setInterval(next, 4200);
    };
    document.addEventListener('visibilitychange', start);
    reduceMotion.addEventListener('change', start);
    start();
  }

  function initParallax() {
    const hero = $('.hero');
    const mind = $('[data-mind]');
    if (!hero || !mind || !finePointer.matches || reduceMotion.matches) return;

    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const tick = () => {
      x += (tx - x) * 0.07;
      y += (ty - y) * 0.07;
      mind.style.setProperty('--px', x.toFixed(4));
      mind.style.setProperty('--py', y.toFixed(4));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const aim = (nx, ny) => {
      tx = nx;
      ty = ny;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      aim(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    hero.addEventListener('pointerleave', () => aim(0, 0));
  }

  /* Demo 1: the agent graph ----------------------------------------------- */

  function initGraph() {
    const box = $('[data-graph]');
    if (!box) return;
    const list = $('.steps', box);
    const steps = $$('.step', box);
    const status = $('[data-graph-status]', box);
    const btn = $('[data-graph-run]', box);
    list.classList.remove('is-static');
    let run = 0;
    let played = false;

    const play = async () => {
      const id = ++run;
      played = true;
      btn.disabled = true;
      btn.textContent = 'Running…';
      const pace = reduceMotion.matches ? 350 : 1500;
      for (let i = 0; i < steps.length; i++) {
        if (id !== run) return;
        steps.forEach((step, j) => {
          step.classList.toggle('is-active', j === i);
          step.classList.toggle('is-done', j < i);
        });
        status.textContent = `Step ${i + 1} of ${steps.length}: ${steps[i].dataset.name}`;
        await sleep(pace);
      }
      if (id !== run) return;
      steps.forEach((step) => {
        step.classList.remove('is-active');
        step.classList.add('is-done');
      });
      status.textContent = 'Sequence complete';
      btn.textContent = 'Run again';
      btn.disabled = false;
    };

    btn.addEventListener('click', () => {
      status.setAttribute('aria-live', 'polite'); // only narrate runs the visitor asked for
      play();
    });
    watch(box, (visible) => { if (visible && !played) play(); }, 0.5);
  }

  /* Demo 2: the studio pipeline ------------------------------------------- */

  function initStudio() {
    const box = $('[data-studio]');
    if (!box) return;
    const out = $('[data-brief]', box);
    const stages = $$('.pipe li', box);
    const briefs = [
      out.textContent.trim(),
      'Khaki utility vest over heavy-knit cream mock neck sweater, fashion editorial',
      'Handcrafted silver jewelry rings detailed macro photography on charcoal basalt rock',
      'Tailored indigo silk jacket against brutalist raw concrete backdrop, dusk lightning',
      'Drape linen dress on active mannequin with soft studio counter-bounce lighting',
    ];
    let visible = false;
    let token = 0;
    let index = 0;

    const loop = async () => {
      const mine = ++token;
      const alive = () => visible && mine === token;
      while (alive()) {
        const text = briefs[index % briefs.length];
        stages.forEach((li) => li.classList.remove('is-active', 'is-done'));
        for (let n = 1; n <= text.length; n++) {
          if (!alive()) return;
          out.textContent = text.slice(0, n);
          await sleep(text[n - 1] === ' ' ? 46 : 24);
        }
        await sleep(450);
        for (const li of stages) {
          if (!alive()) return;
          li.style.setProperty('--stage', '0.85s');
          li.classList.add('is-active');
          await sleep(900);
          li.classList.remove('is-active');
          li.classList.add('is-done');
        }
        await sleep(2000);
        index += 1;
      }
    };

    watch(box, (isVisible) => {
      visible = isVisible && !reduceMotion.matches;
      if (visible) loop();
      else token += 1;
    }, 0.3);
  }

  /* Demo 3: Black-Scholes pricer ------------------------------------------ */

  // Standard normal density and distribution. The CDF is good to about 1e-14:
  // a power series for erf near zero, a continued fraction for erfc in the tails.
  const normPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const erfc = (x) => {
    const z = Math.abs(x);
    let value;
    if (z < 2.5) {
      let term = z;
      let sum = z;
      for (let n = 1; n < 80; n++) {
        term *= (-z * z) / n;
        const add = term / (2 * n + 1);
        sum += add;
        if (Math.abs(add) < 1e-17) break;
      }
      value = 1 - (2 / Math.sqrt(Math.PI)) * sum;
    } else {
      let f = z;
      for (let k = 60; k >= 1; k--) f = z + k / 2 / f;
      value = Math.exp(-z * z) / (Math.sqrt(Math.PI) * f);
    }
    return x >= 0 ? value : 2 - value;
  };
  const normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);

  /** Black-Scholes price and Greeks for a European option on a non-dividend stock. */
  const blackScholes = (S, K, vol, T, r) => {
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * vol * vol) * T) / (vol * sqrtT);
    const d2 = d1 - vol * sqrtT;
    const pv = K * Math.exp(-r * T);
    const decay = -(S * normPdf(d1) * vol) / (2 * sqrtT);
    return {
      call: S * normCdf(d1) - pv * normCdf(d2),
      put: pv * normCdf(-d2) - S * normCdf(-d1),
      dCall: normCdf(d1),
      dPut: normCdf(d1) - 1,
      gamma: normPdf(d1) / (S * vol * sqrtT),
      vega: S * sqrtT * normPdf(d1),
      tCall: (decay - r * pv * normCdf(d2)) / 365,
      tPut: (decay + r * pv * normCdf(-d2)) / 365,
    };
  };

  function initPricer() {
    const box = $('[data-pricer]');
    if (!box) return;
    const input = {};
    $$('input[data-in]', box).forEach((el) => { input[el.dataset.in] = el; });
    const out = (key) => $(`[data-out="${key}"]`, box);
    const val = (key) => $(`[data-val="${key}"]`, box);
    const part = (name) => $(`[data-${name}]`, box);

    const X0 = 8, X1 = 312, Y0 = 110, Y1 = 12, S_MIN = 50, S_MAX = 150, POINTS = 48;
    const sx = (s) => X0 + ((s - S_MIN) / (S_MAX - S_MIN)) * (X1 - X0);
    const signed = (n, digits = 4) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(digits);

    const update = () => {
      const S = +input.S.value;
      const K = +input.K.value;
      const vol = +input.v.value / 100;
      const T = +input.T.value;
      const r = +input.r.value / 100;
      const g = blackScholes(S, K, vol, T, r);

      val('S').textContent = `$${S}`;
      val('K').textContent = `$${K}`;
      val('v').textContent = `${Math.round(vol * 100)}%`;
      val('T').textContent = T.toFixed(2);
      val('r').textContent = `${(r * 100).toFixed(1)}%`;

      out('call').textContent = `$${g.call.toFixed(4)}`;
      out('put').textContent = `$${g.put.toFixed(4)}`;
      out('dCall').textContent = signed(g.dCall);
      out('dPut').textContent = signed(g.dPut);
      out('gamma').textContent = signed(g.gamma);
      out('vega').textContent = signed(g.vega);
      out('tCall').textContent = signed(g.tCall);
      out('tPut').textContent = signed(g.tPut);

      // Chart: option value across the whole spot range for the current inputs
      const top = Math.max(20, 1.12 * Math.max(blackScholes(S_MAX, K, vol, T, r).call, blackScholes(S_MIN, K, vol, T, r).put));
      const sy = (v) => Y0 - (Math.max(0, v) / top) * (Y0 - Y1);
      let call = '';
      let put = '';
      for (let i = 0; i <= POINTS; i++) {
        const s = S_MIN + (i / POINTS) * (S_MAX - S_MIN);
        const q = blackScholes(s, K, vol, T, r);
        const cmd = i ? 'L' : 'M';
        call += `${cmd}${sx(s).toFixed(1)} ${sy(q.call).toFixed(1)}`;
        put += `${cmd}${sx(s).toFixed(1)} ${sy(q.put).toFixed(1)}`;
      }
      part('call-curve').setAttribute('d', call);
      part('put-curve').setAttribute('d', put);

      const xs = sx(S).toFixed(1);
      const xk = sx(K);
      ['x1', 'x2'].forEach((a) => {
        part('s-line').setAttribute(a, xs);
        part('k-line').setAttribute(a, xk.toFixed(1));
      });
      part('call-knob').setAttribute('cx', xs);
      part('call-knob').setAttribute('cy', sy(g.call).toFixed(1));
      part('put-knob').setAttribute('cx', xs);
      part('put-knob').setAttribute('cy', sy(g.put).toFixed(1));
      part('k-label').textContent = `Strike $${K}`;

      Object.values(input).forEach((el) => {
        el.style.setProperty('--fill', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
      });
    };

    box.addEventListener('input', update);
    update();
  }

  /* Demo 4: strategy payoffs ---------------------------------------------- */

  function initPayoff() {
    const box = $('[data-payoff]');
    if (!box) return;
    const line = $('[data-line]', box);
    const areas = $$('[data-area]', box);
    const desc = $('[data-payoff-desc]', box);
    const buttons = $$('[data-strategy]', box);
    const pos = (x) => Math.max(0, x);

    // Profit and loss at expiry per share, for an underlying trading around $100.
    const strategies = {
      'long-call': {
        pnl: (s) => pos(s - 100) - 5,
        text: 'Purchase of a call option betting on high bullish momentum.',
      },
      'short-put': {
        pnl: (s) => 5 - pos(100 - s),
        text: 'Selling a put option to capture high implied premium decaying over time.',
      },
      'bull-call': {
        pnl: (s) => Math.min(pos(s - 90), 10) - 5,
        text: 'Buying a call and selling a further out call to cap risk and lower premium.',
      },
      'iron-condor': {
        pnl: (s) => 5 - pos(90 - s) + pos(80 - s) - pos(s - 110) + pos(s - 120),
        text: 'Selling out-of-the-money puts and calls while buying farther-out protection.',
      },
    };

    const LO = 70, HI = 130, X0 = 8, X1 = 312, ZERO = 95, SCALE = 3.2;
    const sample = (fn) => Array.from({ length: HI - LO + 1 }, (_, i) => fn(LO + i));
    const draw = (values) => {
      const d = values
        .map((v, i) => `${i ? 'L' : 'M'}${(X0 + (i / (HI - LO)) * (X1 - X0)).toFixed(1)} ${(ZERO - v * SCALE).toFixed(1)}`)
        .join('');
      line.setAttribute('d', d);
      areas.forEach((a) => a.setAttribute('d', `${d}L${X1} ${ZERO}L${X0} ${ZERO}Z`));
    };

    let shown = sample(strategies['long-call'].pnl);
    let frame = 0;

    const select = (key) => {
      const target = sample(strategies[key].pnl);
      const from = shown.slice();
      const started = performance.now();
      const duration = reduceMotion.matches ? 0 : 700;
      cancelAnimationFrame(frame);
      const step = (now) => {
        const t = duration ? Math.min(1, (now - started) / duration) : 1;
        const eased = 1 - Math.pow(1 - t, 4);
        shown = from.map((v, i) => v + (target[i] - v) * eased);
        draw(shown);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      desc.textContent = strategies[key].text;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.strategy === key)));
    };

    buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.strategy)));
    draw(shown);
  }

  /* Demo 5: anatomy of a high-retention video ------------------------------ */

  function initRetention() {
    const box = $('[data-retention]');
    if (!box) return;
    const band = $('[data-band]', box);
    const desc = $('[data-retention-desc]', box);
    const buttons = $$('[data-phase]', box);
    const segments = $$('[data-seg]', box);

    // x and width are in the chart's own units and line up with the curve segments
    const phases = {
      hook: { x: 8, width: 38, when: '0–3 sec.', text: 'Pattern interrupt. Visual contrast. Immediate value proposition.' },
      payoff: { x: 46, width: 212, when: 'Middle.', text: 'Deliver on the promise. Maintain pacing. Strategic loops.' },
      cta: { x: 258, width: 54, when: 'End.', text: 'Clear next step. Algorithmic signal. Retention anchor.' },
    };

    const select = (key) => {
      const phase = phases[key];
      band.style.x = `${phase.x}px`;
      band.style.width = `${phase.width}px`;
      segments.forEach((s) => s.classList.toggle('is-on', s.dataset.seg === key));
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.phase === key)));
      const when = document.createElement('b');
      when.textContent = phase.when;
      desc.replaceChildren(when, ` ${phase.text}`);
    };

    buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.phase)));
  }

  /* Contact form ---------------------------------------------------------- */

  function initForm() {
    const form = $('[data-form]');
    if (!form) return;
    const status = $('[data-form-status]', form);
    const btn = $('button[type="submit"]', form);

    const say = (state, html) => {
      status.dataset.state = state;
      status.innerHTML = html;
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      btn.disabled = true;
      say('busy', 'Sending…');
      try {
        const response = await fetch(form.getAttribute('action') || '/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        form.reset();
        say('ok', 'Thanks, your message is on its way. I’ll reply by email.');
      } catch (error) {
        // Never pretend it worked: point to a channel that definitely does.
        say('error', 'That didn’t send. Please message me on <a href="https://www.linkedin.com/in/nayanwadhwa/" target="_blank" rel="noopener">LinkedIn</a> instead.');
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* Small things ---------------------------------------------------------- */

  function initMisc() {
    $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

    // Opened straight from disk, folders have no index page: spell it out.
    if (location.protocol === 'file:') {
      $$('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (/^(\.\/|(\.\.\/)+)(#.*)?$/.test(href)) a.setAttribute('href', href.replace(/\/(#.*)?$/, '/index.html$1'));
      });
    }
  }

  const start = () => {
    [initTheme, initNav, initReveal, initRotator, initParallax, initRetention, initGraph, initStudio, initPricer, initPayoff, initForm, initMisc]
      .forEach((init) => {
        try {
          init();
        } catch (error) {
          console.error(error); // one broken widget should never take the page down
        }
      });
    root.classList.add('is-ready');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
