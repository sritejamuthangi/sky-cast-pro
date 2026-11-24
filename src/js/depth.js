/**
 * Depth effects: glass cards tilt toward the pointer with a moving
 * specular highlight, and the hero/sky shift slightly for parallax.
 * `pointer` (-1..1 on each axis) is shared with the 3D hero scene.
 */

export const pointer = { x: 0, y: 0 };

const clamp = v => Math.max(-1, Math.min(1, v));

export function initDepth() {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rootStyle = document.documentElement.style;
  let frame = 0;
  let lastEvent = null;
  let lit = null;

  const setParallax = () => {
    rootStyle.setProperty('--px', pointer.x.toFixed(3));
    rootStyle.setProperty('--py', pointer.y.toFixed(3));
  };

  function release() {
    if (!lit) return;
    lit.style.setProperty('--rx', '0deg');
    lit.style.setProperty('--ry', '0deg');
    lit.classList.remove('is-lit');
    lit = null;
  }

  function update() {
    frame = 0;
    const e = lastEvent;
    if (!e || reduced.matches) return;
    pointer.x = clamp((e.clientX / window.innerWidth) * 2 - 1);
    pointer.y = clamp((e.clientY / window.innerHeight) * 2 - 1);
    setParallax();

    if (!fine.matches) return;
    const card = e.target instanceof Element ? e.target.closest('[data-tilt]') : null;
    if (card !== lit) release();
    if (!card) return;
    lit = card;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const max = parseFloat(card.dataset.tilt) || 3;
    card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    card.style.setProperty('--rx', `${((py - 0.5) * max).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${((0.5 - px) * max).toFixed(2)}deg`);
    card.classList.add('is-lit');
  }

  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    lastEvent = e;
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    pointer.x = 0;
    pointer.y = 0;
    setParallax();
    release();
  });

  // Phones: gentle parallax from device tilt, where the browser allows it without a permission prompt.
  const needsPermission = typeof window.DeviceOrientationEvent?.requestPermission === 'function';
  if (!fine.matches && 'DeviceOrientationEvent' in window && !needsPermission) {
    let base = null;
    let orientFrame = 0;
    window.addEventListener('deviceorientation', e => {
      if (reduced.matches || e.gamma == null || e.beta == null) return;
      base ??= { beta: e.beta, gamma: e.gamma };
      pointer.x = clamp((e.gamma - base.gamma) / 25);
      pointer.y = clamp((e.beta - base.beta) / 25);
      if (!orientFrame) orientFrame = requestAnimationFrame(() => { orientFrame = 0; setParallax(); });
    }, { passive: true });
  }
}
