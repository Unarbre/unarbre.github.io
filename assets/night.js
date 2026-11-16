// The night at the top of the page: a starry sky in parallax, a constellation shaped like a tree, and a campfire that
// lights itself as soon as the visitor scrolls, then reveals the pseudonym in its glow. Clicking the night lights the
// fire, then makes it flare. States are classes on <html>: awake (sky drawn), lit (fire caught), revealed (name shown).
(() => {
  const root = document.documentElement;
  const night = document.querySelector('.night');
  if (!night) return;
  const stage = night.querySelector('.stage');
  const sky = stage.querySelector('.sky');
  const fireCanvas = stage.querySelector('.fire');
  const campfire = stage.querySelector('.campfire');
  const hearth = stage.querySelector('.hearth');
  const skyCtx = sky.getContext('2d');
  const fireCtx = fireCanvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Height of the flames' base in the fire canvas, as a fraction of its height.
  const BASE = 0.93;

  let width = 0;
  let height = 0;
  let stars = [];
  let fireW = 0;
  let fireH = 0;
  let hearthX = 0;
  let hearthY = 0;
  const flames = [];
  const embers = [];
  let shooting = null;
  let nextShot = 0;
  let progress = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let awakeAt = null;
  let litAt = null;
  let flare = 0;
  let running = false;
  let inView = true;

  const now = () => performance.now() / 1000;

  // Soft round sprites, from white-hot to dark red, drawn additively.
  const sprites = ['255,246,220', '255,196,96', '255,128,44', '196,52,20'].map((rgb) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, `rgba(${rgb},1)`);
    gradient.addColorStop(0.45, `rgba(${rgb},0.45)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
  });

  function sizeCanvas(canvas, ctx, w, h) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // Mobile browsers resize while their address bar slides: keep the same sky for small height changes.
    if (w !== width || Math.abs(h - height) > 120) {
      width = w;
      height = h;
      sizeCanvas(sky, skyCtx, width, height);
      stars = Array.from({ length: Math.round((width * height) / 2400) }, () => {
        const depth = Math.random() < 0.6 ? 0.3 : Math.random() < 0.7 ? 0.6 : 1;
        return {
          x: Math.random() * width,
          y: Math.random() * height * 1.35,
          r: (0.35 + Math.random() * 0.8) * (0.7 + depth * 0.6),
          depth,
          alpha: 0.3 + Math.random() * 0.7,
          speed: 0.6 + Math.random() * 2.2,
          phase: Math.random() * Math.PI * 2,
        };
      });
      fireW = Math.round(Math.max(150, Math.min(300, width * 0.22)));
      fireH = Math.round(fireW * 1.6);
      sizeCanvas(fireCanvas, fireCtx, fireW, fireH);
    }
    placeFire();
  }

  // The hearth is a point of the hills drawing, which scales with the screen: the fire follows it.
  function placeFire() {
    const spot = hearth.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    hearthX = spot.left + spot.width / 2 - box.left;
    hearthY = spot.top + spot.height / 2 - box.top;
    campfire.style.transform = `translate(${hearthX - fireW / 2}px, ${hearthY - fireH * BASE}px)`;
    stage.style.setProperty('--hx', `${(hearthX / width) * 100}%`);
    stage.style.setProperty('--hy', `${((hearthY - fireW * 0.3) / height) * 100}%`);
    stage.style.setProperty('--gy', `${(hearthY / height) * 100}%`);
  }

  // Strength of the fire, seconds after it caught: a hesitant spark, then the flames take.
  function power(t) {
    if (t < 0.9) return 0.12 + 0.1 * Math.abs(Math.sin(t * 17));
    const k = Math.min(1, (t - 0.9) / 2);
    return 0.2 + 0.8 * k * k * (3 - 2 * k);
  }

  function stepFire(heat) {
    const baseX = fireW / 2;
    const baseY = fireH * BASE;
    const scale = fireW / 240;
    const rate = heat * 7;
    for (let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0); n > 0; n--) {
      flames.push({
        x: baseX + (Math.random() - 0.5) * fireW * 0.22 * (0.5 + heat * 0.5),
        y: baseY - Math.random() * 4 * scale,
        vx: (Math.random() - 0.5) * 0.5 * scale,
        vy: -(1.8 + Math.random() * 2.2) * scale * (0.55 + heat * 0.45),
        life: 0,
        max: 26 + Math.random() * 22,
        size: (10 + Math.random() * 12) * scale * (0.5 + Math.min(heat, 1.2) * 0.5),
        seed: Math.random() * 100,
      });
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i];
      f.life += 1;
      // Flames lean back toward the middle, so the fire ends in a tip.
      f.vx += (baseX - f.x) * 0.006;
      f.x += f.vx + Math.sin((f.life + f.seed) * 0.17) * 0.3 * scale;
      f.y += f.vy;
      f.vy *= 0.985;
      if (f.life > f.max) flames.splice(i, 1);
    }
  }

  function drawFire() {
    fireCtx.clearRect(0, 0, fireW, fireH);
    fireCtx.globalCompositeOperation = 'lighter';
    for (const f of flames) {
      const t = f.life / f.max;
      const r = f.size * (1 - t * 0.8);
      // White-hot only at the very base, then yellow, orange and red as the flame rises.
      const sprite = t < 0.07 ? 0 : t < 0.38 ? 1 : t < 0.68 ? 2 : 3;
      fireCtx.globalAlpha = (1 - t) ** 1.2 * 0.36;
      fireCtx.drawImage(sprites[sprite], f.x - r, f.y - r, r * 2, r * 2);
    }
    fireCtx.globalAlpha = 1;
    fireCtx.globalCompositeOperation = 'source-over';
  }

  // Embers fly in the whole sky, not only above the fire.
  function spark(strength) {
    const scale = fireW / 240;
    embers.push({
      x: hearthX + (Math.random() - 0.5) * fireW * 0.2,
      y: hearthY - fireW * 0.35 * Math.random(),
      vx: (Math.random() - 0.5) * 1.3 * scale * strength,
      vy: -(0.9 + Math.random() * 1.8) * scale * strength,
      life: 0,
      max: 80 + Math.random() * 110,
      size: (0.8 + Math.random() * 1.5) * scale,
      seed: Math.random() * 100,
    });
  }

  function stepEmbers(heat) {
    if (Math.random() < heat * 0.32) spark(1);
    for (let i = embers.length - 1; i >= 0; i--) {
      const ember = embers[i];
      ember.life += 1;
      ember.x += ember.vx + Math.sin((ember.life + ember.seed) * 0.07) * 0.45;
      ember.y += ember.vy;
      ember.vy *= 0.996;
      if (ember.life > ember.max || ember.y < -10) embers.splice(i, 1);
    }
  }

  function drawShootingStar(time) {
    if (!shooting && time > nextShot) {
      shooting = {
        x: width * (0.35 + Math.random() * 0.6),
        y: height * Math.random() * 0.3,
        vx: -(7 + Math.random() * 5),
        vy: 2 + Math.random() * 2.5,
        life: 0,
        max: 55,
      };
      nextShot = time + 7 + Math.random() * 10;
    }
    if (!shooting) return;
    const s = shooting;
    s.life += 1;
    s.x += s.vx;
    s.y += s.vy;
    const tailX = s.x - s.vx * 14;
    const tailY = s.y - s.vy * 14;
    const gradient = skyCtx.createLinearGradient(s.x, s.y, tailX, tailY);
    gradient.addColorStop(0, `rgba(255,255,255,${Math.sin((s.life / s.max) * Math.PI)})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    skyCtx.globalAlpha = 1;
    skyCtx.strokeStyle = gradient;
    skyCtx.lineWidth = 1.4;
    skyCtx.beginPath();
    skyCtx.moveTo(s.x, s.y);
    skyCtx.lineTo(tailX, tailY);
    skyCtx.stroke();
    if (s.life >= s.max) shooting = null;
  }

  function drawSky(time, light) {
    skyCtx.clearRect(0, 0, width, height);
    const fade = awakeAt === null ? 0 : Math.min(1, (time - awakeAt) / 1.6);
    const lift = progress * height * 0.3;
    skyCtx.fillStyle = '#e8edff';
    for (const s of stars) {
      const y = s.y - lift * s.depth - pointer.y * 14 * s.depth;
      if (y < -2 || y > height) continue;
      const x = (((s.x - pointer.x * 18 * s.depth) % width) + width) % width;
      const twinkle = 0.6 + 0.4 * Math.sin(time * s.speed + s.phase);
      // The fire's light washes out the stars near the horizon.
      skyCtx.globalAlpha = s.alpha * twinkle * fade * (1 - light * 0.45 * (y / height));
      skyCtx.beginPath();
      skyCtx.arc(x, y, s.r, 0, Math.PI * 2);
      skyCtx.fill();
    }
    if (fade === 1) drawShootingStar(time);
    skyCtx.globalCompositeOperation = 'lighter';
    for (const ember of embers) {
      const t = ember.life / ember.max;
      skyCtx.globalAlpha = (1 - t) * (0.55 + 0.45 * Math.sin(ember.life * 0.35 + ember.seed));
      const r = ember.size * 3.2;
      skyCtx.drawImage(sprites[1], ember.x - r, ember.y - r, r * 2, r * 2);
    }
    skyCtx.globalCompositeOperation = 'source-over';
    skyCtx.globalAlpha = 1;
  }

  function frame() {
    if (!running) return;
    const time = now();
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    const strength = litAt === null ? 0 : power(time - litAt);
    flare *= 0.95;
    const heat = strength + flare;
    stepFire(heat);
    stepEmbers(heat);
    drawFire();
    drawSky(time, strength);
    const flicker = Math.sin(time * 7.1) * 0.5 + Math.sin(time * 12.7 + 1) * 0.3 + Math.sin(time * 2.3) * 0.2;
    stage.style.setProperty('--glow', (strength * (0.88 + flicker * 0.1) + flare * 0.35).toFixed(3));
    stage.style.setProperty('--px', pointer.x.toFixed(3));
    stage.style.setProperty('--py', pointer.y.toFixed(3));
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || !inView || document.hidden || reduced) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function light() {
    if (litAt !== null) return;
    litAt = now();
    root.classList.add('lit');
    setTimeout(() => root.classList.add('revealed'), reduced ? 0 : 1700);
  }

  function onScroll() {
    const box = night.getBoundingClientRect();
    const run = box.height - innerHeight;
    progress = run > 0 ? Math.min(1, Math.max(0, -box.top / run)) : 0;
    stage.style.setProperty('--p', progress.toFixed(4));
    if (-box.top > innerHeight * 0.06) light();
  }

  // Without motion: the fire already burns, drawn once.
  function still() {
    awakeAt = -10;
    litAt = now() - 10;
    flames.length = 0;
    for (let i = 0; i < 90; i++) stepFire(1);
    drawFire();
    drawSky(now(), 1);
    stage.style.setProperty('--glow', '0.9');
  }

  resize();
  addEventListener('resize', () => {
    resize();
    onScroll();
    if (reduced) still();
  });
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      pointer.tx = (event.clientX / innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / innerHeight) * 2 - 1;
    },
    { passive: true },
  );
  stage.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    if (litAt === null) return light();
    flare = 0.6;
    for (let i = 0; i < 36; i++) spark(2.2);
  });
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) start();
    else running = false;
  }).observe(night);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else start();
  });

  if (reduced) {
    root.classList.add('awake', 'lit', 'revealed');
    still();
  } else {
    awakeAt = now();
    nextShot = awakeAt + 4;
    requestAnimationFrame(() => root.classList.add('awake'));
    onScroll();
    start();
  }
})();
