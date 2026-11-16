// The night at the top of the page: a starry sky with its Milky Way, ridgelines in parallax, a constellation shaped
// like a tree, and campfires with cloaked figures around them. All are out at first. At the first scroll a fire
// catches; the others answer it one by one, left and right, near and far, then the pseudonym appears. Clicking the
// night lights the fires, then sends sparks up.
// States are classes on <html>: awake (sky drawn), lit (the first fire caught), revealed (the name is shown).
(() => {
  const root = document.documentElement;
  const night = document.querySelector('.night');
  if (!night) return;
  const stage = night.querySelector('.stage');
  const sky = stage.querySelector('.sky');
  const skyCtx = sky.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Each fire: its hearth (a point of the ridge drawing), its camp (vector flames, light on the ground, people), the
  // canvas of its embers, its halo, its size in the drawing's units and its lighting time after the first one.
  const fires = [...stage.querySelectorAll('.hearth')].map((hearth) => {
    const id = hearth.dataset.fire;
    const layer = hearth.closest('.land');
    const canvas = layer.querySelector(`.fire[data-fire="${id}"]`);
    const camp = layer.querySelector(`.camp[data-fire="${id}"]`);
    const flames = camp.querySelector('.flames');
    return {
      hearth,
      layer,
      canvas,
      ctx: canvas.getContext('2d'),
      halo: layer.querySelector(`.halo[data-fire="${id}"]`),
      flames,
      place: `translate(${flames.dataset.x} ${flames.dataset.y})`,
      ground: camp.querySelector('.ground'),
      people: camp.querySelector('.people'),
      glowing: camp.querySelector('.glowing'),
      size: Number(hearth.dataset.unit),
      delay: Number(hearth.dataset.delay),
      seed: Number(id) * 7.31,
      sparks: [],
      unit: 0,
      w: 0,
      h: 0,
    };
  });
  const first = fires.find((fire) => fire.delay === 0) ?? fires[0];

  let width = 0;
  let height = 0;
  let stars = [];
  let milkyWay = null;
  let shooting = null;
  let nextShot = 0;
  let progress = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let awakeAt = null;
  let litAt = null;
  let running = false;
  let inView = true;

  const now = () => performance.now() / 1000;
  // Smooth wandering value in [0, 1]: the breathing of the flames.
  const wave = (x) => 0.5 + 0.25 * Math.sin(x) + 0.15 * Math.sin(2.31 * x + 1.3) + 0.1 * Math.sin(4.73 * x + 0.4);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  function sizeCanvas(canvas, ctx, w, h) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The Milky Way rises from the valley toward the upper right: drawn once, a veil of dust and faint stars.
  function paintMilkyWay() {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const from = [width * 0.4, height * 0.9];
    const to = [width * 1.05, -height * 0.15];
    const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const normal = [-(to[1] - from[1]) / span, (to[0] - from[0]) / span];
    const at = (along, across) => [
      from[0] + (to[0] - from[0]) * along + normal[0] * across,
      from[1] + (to[1] - from[1]) * along + normal[1] * across,
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const [x, y] = at(Math.random(), gauss() * span * 0.06);
      const r = span * (0.04 + Math.random() * 0.07);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tint = Math.random() < 0.7 ? '150,165,225' : '205,170,225';
      glow.addColorStop(0, `rgba(${tint},${0.018 + Math.random() * 0.02})`);
      glow.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = '#e8edff';
    for (let i = 0; i < Math.round(span * 1.6); i++) {
      const [x, y] = at(Math.random(), gauss() * span * 0.05);
      ctx.globalAlpha = 0.12 + Math.random() * 0.4;
      ctx.fillRect(x, y, 0.4 + Math.random() * 0.5, 0.4 + Math.random() * 0.5);
    }
    milkyWay = canvas;
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // Mobile browsers resize while their address bar slides: keep the same sky for small height changes.
    if (w !== width || Math.abs(h - height) > 120) {
      width = w;
      height = h;
      sizeCanvas(sky, skyCtx, width, height);
      stars = Array.from({ length: Math.round((width * height) / 2200) }, () => {
        const size = Math.random() ** 4;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.3 + size * 1.25,
          depth: 0.2 + Math.random() * 0.8,
          alpha: 0.25 + Math.random() * 0.6,
          speed: 0.4 + Math.random() * 1.8,
          phase: Math.random() * Math.PI * 2,
        };
      });
      paintMilkyWay();
    }
    for (const fire of fires) placeFire(fire);
  }

  // The ridges scale with the screen (the drawing is cropped, never stretched): each fire follows its hearth, and its
  // size follows the drawing's scale, so the flames keep their proportion to the figures around them.
  function placeFire(fire) {
    const drawing = fire.hearth.ownerSVGElement.getBoundingClientRect();
    const scale = Math.max(drawing.width / 2400, drawing.height / 600);
    const unit = Math.max(4, fire.size * scale);
    if (Math.abs(unit - fire.unit) > 0.5) {
      fire.unit = unit;
      fire.w = Math.ceil(unit * 4);
      fire.h = Math.ceil(unit * 8);
      sizeCanvas(fire.canvas, fire.ctx, fire.w, fire.h);
    }
    const spot = fire.hearth.getBoundingClientRect();
    const box = fire.layer.getBoundingClientRect();
    const x = spot.left + spot.width / 2 - box.left;
    const y = spot.top + spot.height / 2 - box.top;
    fire.canvas.style.left = `${x - fire.w / 2}px`;
    fire.canvas.style.top = `${y - fire.h * 0.88}px`;
    fire.halo.style.setProperty('--hx', `${x}px`);
    fire.halo.style.setProperty('--hy', `${y - unit * 0.4}px`);
    fire.halo.style.setProperty('--r', `${unit * 5.5}px`);
  }

  // Strength of a fire, seconds after it caught: an ember that hesitates, a first flame, then the fire takes.
  function strength(t) {
    if (t < 0) return 0;
    if (t < 0.7) return 0.1 * Math.abs(Math.sin(t * 13));
    if (t < 1.5) return 0.12 + (t - 0.7) * 0.35 + 0.05 * Math.sin(t * 21);
    const k = Math.min(1, (t - 1.5) / 1.6);
    return 0.4 + 0.6 * k * k * (3 - 2 * k);
  }

  // The vector flames grow with the fire and breathe slowly; their tongues sway on their own (style.css). The light
  // on the ground follows, trembling a little.
  function drawCamp(fire, time, power, flicker) {
    const grow = 0.3 + 0.7 * power;
    const breathe = 1 + (wave((time + fire.seed) * 0.8) - 0.5) * 0.1;
    fire.flames.setAttribute('transform', `${fire.place} scale(${(fire.size * grow).toFixed(2)} ${(fire.size * grow * breathe).toFixed(2)})`);
    fire.flames.style.opacity = Math.min(1, power * 2.5).toFixed(3);
    fire.ground.style.opacity = (power * (0.85 + flicker * 0.2)).toFixed(3);
  }

  // Embers hang in the warm air: each fades in, drifts a little, fades out. Their overlap makes the glow.
  function drawEmbers(fire) {
    const { ctx, w, h, sparks } = fire;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffc27a';
    for (const spark of sparks) {
      const age = spark.life / spark.max;
      ctx.globalAlpha = spark.alpha * Math.sin(age * Math.PI) * (0.75 + 0.25 * Math.sin(spark.life * 0.02 + spark.seed));
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // An ember born in the flames: it barely rises, and lives for several seconds.
  function spark(fire, boost = 1) {
    const { unit } = fire;
    fire.sparks.push({
      x: fire.w / 2 + (Math.random() - 0.5) * unit * 0.9,
      y: fire.h * 0.88 - unit * (0.2 + Math.random() * 1.1),
      vx: (Math.random() - 0.5) * 0.03 * boost,
      vy: -(0.02 + Math.random() * 0.09) * (unit / 20) * boost,
      r: Math.max(0.3, 0.025 * unit) + Math.random() ** 2 * 0.7,
      alpha: 0.35 + Math.random() * 0.6,
      life: 0,
      max: 360 + Math.random() * 360,
      seed: Math.random() * 100,
    });
  }

  // Embers come unevenly, in slow waves: lulls, then a few together.
  function stepSparks(fire, power, time) {
    const mood = 0.3 + 1.4 * wave((time + fire.seed) * 0.31);
    if (fire.sparks.length < 28 && Math.random() < power * 0.014 * mood * Math.min(1, fire.size / 16)) spark(fire);
    for (let i = fire.sparks.length - 1; i >= 0; i--) {
      const s = fire.sparks[i];
      s.life += 1;
      s.x += s.vx + Math.sin((s.life + s.seed) * 0.012) * 0.025;
      s.y += s.vy;
      if (s.life > s.max || s.y < 0) fire.sparks.splice(i, 1);
    }
  }

  function drawShootingStar(time) {
    if (!shooting && time > nextShot) {
      shooting = {
        x: width * (0.3 + Math.random() * 0.65),
        y: height * Math.random() * 0.3,
        vx: -(9 + Math.random() * 5),
        vy: 3 + Math.random() * 2,
        life: 0,
        max: 32,
      };
      nextShot = time + 9 + Math.random() * 12;
    }
    if (!shooting) return;
    const s = shooting;
    s.life += 1;
    s.x += s.vx;
    s.y += s.vy;
    const tailX = s.x - s.vx * 9;
    const tailY = s.y - s.vy * 9;
    const gradient = skyCtx.createLinearGradient(s.x, s.y, tailX, tailY);
    gradient.addColorStop(0, `rgba(240,244,255,${0.75 * Math.sin((s.life / s.max) * Math.PI)})`);
    gradient.addColorStop(1, 'rgba(240,244,255,0)');
    skyCtx.globalAlpha = 1;
    skyCtx.strokeStyle = gradient;
    skyCtx.lineWidth = 0.9;
    skyCtx.beginPath();
    skyCtx.moveTo(s.x, s.y);
    skyCtx.lineTo(tailX, tailY);
    skyCtx.stroke();
    if (s.life >= s.max) shooting = null;
  }

  function drawSky(time, light) {
    skyCtx.clearRect(0, 0, width, height);
    const fade = awakeAt === null ? 0 : Math.min(1, (time - awakeAt) / 2);
    const drift = progress * height * 0.04;
    skyCtx.globalAlpha = fade * (1 - light * 0.2);
    skyCtx.drawImage(milkyWay, -pointer.x * 4, drift * 0.5 - pointer.y * 3, width, height);
    skyCtx.fillStyle = '#e9eeff';
    for (const s of stars) {
      const y = s.y + drift * s.depth - pointer.y * 8 * s.depth;
      const x = s.x - pointer.x * 10 * s.depth;
      const twinkle = 1 - (0.15 + s.r * 0.25) * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
      // The firelight washes out the faintest stars near the horizon.
      skyCtx.globalAlpha = s.alpha * twinkle * fade * (1 - light * 0.3 * (y / height));
      skyCtx.beginPath();
      skyCtx.arc(x, y, s.r, 0, Math.PI * 2);
      skyCtx.fill();
    }
    if (fade === 1) drawShootingStar(time);
    skyCtx.globalAlpha = 1;
  }

  function frame() {
    if (!running) return;
    const time = now();
    pointer.x += (pointer.tx - pointer.x) * 0.035;
    pointer.y += (pointer.ty - pointer.y) * 0.035;
    for (const fire of fires) {
      const power = litAt === null ? 0 : strength(time - litAt - fire.delay);
      const flicker = wave((time + fire.seed) * 2.2) - 0.5;
      stepSparks(fire, power, time);
      drawEmbers(fire);
      drawCamp(fire, time, power, flicker);
      fire.halo.style.opacity = (power * (0.9 + flicker * 0.18)).toFixed(3);
      // The people around a fire come out of the dark as it takes, the firelight trembling on them.
      fire.people.style.opacity = Math.min(1, power * 1.6).toFixed(3);
      fire.glowing.style.opacity = (power * (0.82 + flicker * 0.36)).toFixed(3);
      fire.power = power;
    }
    drawSky(time, first.power ?? 0);
    stage.style.setProperty('--glow', (first.power ?? 0).toFixed(3));
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
    setTimeout(() => root.classList.add('revealed'), reduced ? 0 : 2200);
  }

  function onScroll() {
    const box = night.getBoundingClientRect();
    const run = box.height - innerHeight;
    progress = run > 0 ? Math.min(1, Math.max(0, -box.top / run)) : 0;
    stage.style.setProperty('--p', progress.toFixed(4));
    if (-box.top > innerHeight * 0.08) light();
  }

  // Without motion: every fire already burns, drawn once.
  function still() {
    awakeAt = -10;
    litAt = -100;
    for (const fire of fires) {
      // A few embers already hanging over the fire.
      for (let i = 0; i < 10; i++) {
        spark(fire);
        fire.sparks.at(-1).life = Math.random() * 300;
      }
      drawEmbers(fire);
      drawCamp(fire, 0, 1, 0);
      fire.halo.style.opacity = '0.9';
      fire.people.style.opacity = '1';
      fire.glowing.style.opacity = '0.9';
    }
    drawSky(0, 1);
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
    for (const fire of fires) if (fire.power > 0.3) for (let i = 0; i < 10; i++) spark(fire, 2.5);
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
    nextShot = awakeAt + 5;
    requestAnimationFrame(() => root.classList.add('awake'));
    onScroll();
    start();
  }
})();
