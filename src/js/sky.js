/**
 * The living sky behind the app: gradient colors for the weather and time
 * of day, drifting clouds, and a lightweight canvas for rain, snow, stars
 * and lightning. Pauses when the tab is hidden; calm when reduced motion is on.
 */

const PALETTES = {
  clear: {
    day: ['#2a6ad3', '#4b93e6', '#94c8f2'],
    dawn: ['#334389', '#a8739e', '#f2a37c'],
    dusk: ['#23275f', '#80508a', '#ec8a5c'],
    night: ['#040918', '#0c1a3c', '#1b305f'],
  },
  cloudy: {
    day: ['#4c5e76', '#6d8199', '#9eafc2'],
    dawn: ['#434a66', '#7b7390', '#b39b9c'],
    dusk: ['#33384f', '#5f5872', '#94787f'],
    night: ['#090d17', '#161e2d', '#283245'],
  },
  rain: {
    day: ['#36475b', '#52657c', '#7a8da4'],
    dawn: ['#323a50', '#535872', '#7f7c91'],
    dusk: ['#272b40', '#42455b', '#6a6678'],
    night: ['#05080f', '#101824', '#1c2737'],
  },
  snow: {
    day: ['#6b84a5', '#9ab0ca', '#cddbeb'],
    dawn: ['#5c6889', '#978dab', '#d1bfcb'],
    dusk: ['#434b6b', '#7a7594', '#b1a3b6'],
    night: ['#0b1121', '#212c46', '#41516d'],
  },
  storm: {
    day: ['#1e2432', '#343c4e', '#515a6d'],
    dawn: ['#1e2132', '#37394f', '#585466'],
    dusk: ['#181a29', '#2e2f43', '#4a4658'],
    night: ['#030407', '#0a0d15', '#151a26'],
  },
};

const GLOW = {
  day: { x: '82%', y: '0%', clear: 'rgb(255 238 180 / .42)', muted: 'rgb(255 255 255 / .12)' },
  dawn: { x: '50%', y: '100%', clear: 'rgb(255 176 120 / .5)', muted: 'rgb(255 190 160 / .2)' },
  dusk: { x: '50%', y: '100%', clear: 'rgb(255 140 90 / .5)', muted: 'rgb(255 160 130 / .2)' },
  night: { x: '18%', y: '0%', clear: 'rgb(160 180 255 / .16)', muted: 'rgb(140 160 220 / .06)' },
};

const CLOUDS = {
  clear: { opacity: 0.16, rgb: [255, 255, 255] },
  partly: { opacity: 0.5, rgb: [255, 255, 255] },
  cloudy: { opacity: 0.85, rgb: [236, 241, 248] },
  fog: { opacity: 0.95, rgb: [228, 234, 242] },
  drizzle: { opacity: 0.8, rgb: [196, 206, 220] },
  rain: { opacity: 0.85, rgb: [176, 188, 206] },
  'heavy-rain': { opacity: 0.9, rgb: [150, 162, 182] },
  sleet: { opacity: 0.85, rgb: [200, 210, 224] },
  snow: { opacity: 0.75, rgb: [240, 245, 252] },
  storm: { opacity: 0.92, rgb: [104, 114, 136] },
};

const TINT = {
  day: 'rgb(14 30 66 / .16)',
  dawn: 'rgb(36 22 60 / .16)',
  dusk: 'rgb(30 18 52 / .18)',
  night: 'rgb(130 150 220 / .07)',
};

const PRECIP = { drizzle: 70, rain: 170, 'heavy-rain': 320, storm: 260, sleet: 110, snow: 150 };

export function createSky({ el, canvas, flash }) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  let w = 0;
  let h = 0;
  let key = '';
  let kind = 'clear';
  let starAlpha = 0;
  let rain = [];
  let snow = [];
  let stars = [];
  let frame = 0;
  let last = 0;
  let nextFlash = 0;

  function resize() {
    // Particles are soft; 1.25x keeps them smooth without a huge full-screen buffer.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const widthChanged = window.innerWidth !== w;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (widthChanged) seed();
    draw(performance.now() / 1000, 0);
  }

  const newDrop = anywhere => ({
    x: Math.random() * (w + 200) - 150,
    y: anywhere ? Math.random() * h : -40 - Math.random() * 120,
    len: 12 + Math.random() * 18,
    v: 900 + Math.random() * 550,
    far: Math.random() < 0.55,
  });

  const newFlake = anywhere => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -10 - Math.random() * 60,
    r: 1 + Math.random() * 2.4,
    v: 28 + Math.random() * 55,
    sway: 0.6 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
  });

  function seed() {
    const area = Math.max(0.35, (w * h) / (1280 * 800));
    const amount = Math.round((PRECIP[kind] ?? 0) * area);
    const rainShare = kind === 'snow' ? 0 : kind === 'sleet' ? 0.5 : 1;
    rain = Array.from({ length: Math.round(amount * rainShare) }, () => newDrop(true));
    snow = Array.from({ length: Math.round(amount * (1 - rainShare)) }, () => newFlake(true));
    stars = starAlpha
      ? Array.from({ length: Math.round(130 * area) }, () => ({
          x: Math.random() * w,
          y: Math.random() * h * 0.7,
          r: 0.4 + Math.random() * 1.1,
          a: 0.3 + Math.random() * 0.7,
          speed: 0.6 + Math.random() * 2,
          phase: Math.random() * Math.PI * 2,
        }))
      : [];
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, w, h);
    const still = reduced.matches;

    if (stars.length) {
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        ctx.globalAlpha = starAlpha * s.a * (still ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (still) return;

    if (rain.length) {
      for (const far of [true, false]) {
        ctx.strokeStyle = far ? 'rgba(200, 216, 245, 0.22)' : 'rgba(220, 232, 255, 0.45)';
        ctx.lineWidth = far ? 0.8 : 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const d of rain) {
          if (d.far !== far) continue;
          const v = far ? d.v * 0.75 : d.v;
          d.y += v * dt;
          d.x += v * 0.12 * dt;
          if (d.y - d.len > h) Object.assign(d, newDrop(false));
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * 0.12, d.y - d.len);
        }
        ctx.stroke();
      }
    }

    if (snow.length) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      for (const f of snow) {
        f.y += f.v * dt;
        f.x += Math.sin(t * f.sway + f.phase) * 18 * dt;
        if (f.y - f.r > h) Object.assign(f, newFlake(false));
        ctx.moveTo(f.x + f.r, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    if (kind === 'storm' && t > nextFlash) {
      if (nextFlash) strike();
      nextFlash = t + 4 + Math.random() * 6;
    }
  }

  function strike() {
    flash.animate(
      [{ opacity: 0 }, { opacity: 0.5, offset: 0.06 }, { opacity: 0.08, offset: 0.18 }, { opacity: 0.38, offset: 0.28 }, { opacity: 0 }],
      { duration: 900, easing: 'ease-out' },
    );
    window.dispatchEvent(new CustomEvent('skycast:lightning'));
  }

  const animating = () => !reduced.matches && !document.hidden && (rain.length || snow.length || stars.length || kind === 'storm');

  function loop(now) {
    frame = 0;
    const t = now / 1000;
    const dt = last ? Math.min(0.05, t - last) : 0;
    last = t;
    // Stars alone only need a gentle twinkle; skip frames to save battery.
    if (rain.length || snow.length || kind === 'storm' || dt === 0 || Math.floor(t * 20) !== Math.floor((t - dt) * 20)) draw(t, dt);
    if (animating()) frame = requestAnimationFrame(loop);
  }

  function start() {
    if (frame || !animating()) {
      if (!animating()) draw(performance.now() / 1000, 0);
      return;
    }
    last = 0;
    frame = requestAnimationFrame(loop);
  }

  function set({ group, phase, kind: nextKind }) {
    const nextKey = `${group}|${phase}|${nextKind}`;
    if (nextKey === key) return;
    key = nextKey;
    kind = nextKind;

    const [c1, c2, c3] = PALETTES[group]?.[phase] ?? PALETTES.clear.night;
    el.style.setProperty('--sky-1', c1);
    el.style.setProperty('--sky-2', c2);
    el.style.setProperty('--sky-3', c3);
    const glow = GLOW[phase];
    el.style.setProperty('--glow', group === 'clear' ? glow.clear : glow.muted);
    el.style.setProperty('--glow-x', glow.x);
    el.style.setProperty('--glow-y', glow.y);

    const cloud = CLOUDS[nextKind] ?? CLOUDS.cloudy;
    const dim = phase === 'night' ? 0.42 : phase === 'day' ? 1 : 0.8;
    el.style.setProperty('--cloud-rgb', cloud.rgb.map(v => Math.round(v * dim)).join(' '));
    el.style.setProperty('--cloud-opacity', String(cloud.opacity));
    // Bright skies (snow, daytime clouds) need a deeper tint to keep white text readable.
    const bright = phase !== 'night' && (group === 'snow' || group === 'cloudy');
    document.documentElement.style.setProperty('--glass-tint', bright ? 'rgb(18 34 70 / .36)' : TINT[phase]);
    themeMeta?.setAttribute('content', c1);

    starAlpha = phase === 'night' ? ({ clear: 1, partly: 0.7, cloudy: 0.15 }[nextKind] ?? 0) : 0;
    nextFlash = 0;
    seed();
    draw(performance.now() / 1000, 0); // clear the previous condition right away
    start();
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      start();
    }
  });
  reduced.addEventListener?.('change', () => start());
  resize();

  return { set };
}
