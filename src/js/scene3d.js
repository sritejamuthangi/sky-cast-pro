/**
 * The 3D hero icon, rendered with Three.js: glossy, softly lit models of the
 * current weather (sun, moon, clouds, rain, snow, lightning) that float and
 * turn toward the pointer. Pauses off-screen and renders a single still frame
 * when reduced motion is on.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = t => {
  const c1 = 1.45;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const easeInCubic = t => t * t * t;

/* ---------- Geometry ---------- */

/** A puffy crescent: a tube swept along an arc whose radius tapers to the tips. */
function crescentGeometry() {
  const seg = 80;
  const ring = 32;
  const R = 0.78;
  const span = Math.PI * 0.62;
  const thick = 0.47;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const th = Math.PI + (t * 2 - 1) * span;
    const nx = Math.cos(th);
    const ny = Math.sin(th);
    const r = thick * Math.sin(Math.PI * t) ** 0.75 + 0.002;
    for (let j = 0; j <= ring; j++) {
      const ph = (j / ring) * TAU;
      const radial = Math.cos(ph) * r;
      positions.push(nx * (R + radial), ny * (R + radial), Math.sin(ph) * r * 0.85);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sparkleShape() {
  const k = 0.2;
  const s = new THREE.Shape();
  s.moveTo(0, 1);
  s.quadraticCurveTo(k, k, 1, 0);
  s.quadraticCurveTo(k, -k, 0, -1);
  s.quadraticCurveTo(-k, -k, -1, 0);
  s.quadraticCurveTo(-k, k, 0, 1);
  return s;
}

function boltShape() {
  const s = new THREE.Shape();
  s.moveTo(0.18, 1.0);
  s.lineTo(-0.42, -0.08);
  s.lineTo(-0.02, -0.08);
  s.lineTo(-0.28, -1.05);
  s.lineTo(0.48, 0.22);
  s.lineTo(0.06, 0.22);
  s.lineTo(0.36, 1.0);
  s.closePath();
  return s;
}

/** Teardrop: round at the bottom, pointed at the top. */
function dropGeometry() {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const th = Math.PI * (1 - i / 24);
    pts.push(new THREE.Vector2(Math.max(0.0001, (Math.sin(th) * (1 - Math.cos(th))) / 2), Math.cos(th)));
  }
  const geometry = new THREE.LatheGeometry(pts, 24);
  geometry.scale(0.13, 0.13, 0.13);
  return geometry;
}

function radialTexture(stops) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createAssets() {
  const phys = options => new THREE.MeshPhysicalMaterial(options);
  return {
    geo: {
      sphere: new THREE.SphereGeometry(1, 64, 40),
      ray: new THREE.CapsuleGeometry(0.11, 0.36, 8, 16),
      cloudBase: new THREE.CapsuleGeometry(0.5, 2.1, 12, 32),
      crescent: crescentGeometry(),
      sparkle: new THREE.ExtrudeGeometry(sparkleShape(), {
        depth: 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 5, curveSegments: 16,
      }).center(),
      bolt: new THREE.ExtrudeGeometry(boltShape(), {
        depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.045, bevelSegments: 5,
      }).center(),
      drop: dropGeometry(),
      flake: new THREE.IcosahedronGeometry(0.1, 0),
      fogBar: new THREE.CapsuleGeometry(0.085, 2.3, 6, 16),
    },
    mat: {
      sun: phys({ color: 0xffc21a, emissive: 0xff8400, emissiveIntensity: 0.34, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.45 }),
      ray: phys({ color: 0xffd23a, emissive: 0xffa000, emissiveIntensity: 0.36, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.45 }),
      moon: phys({ color: 0xf7ecd2, emissive: 0x9c844c, emissiveIntensity: 0.32, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      star: phys({ color: 0xfff1bd, emissive: 0xffcf5a, emissiveIntensity: 0.9, roughness: 0.3, clearcoat: 1 }),
      cloud: phys({
        color: 0xf6f9ff, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 1, sheenRoughness: 0.5, sheenColor: 0xdce8ff,
      }),
      cloudGrey: phys({ color: 0xbcc7d6, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.6, sheenColor: 0xc9d6ea }),
      cloudDark: phys({ color: 0x737f94, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45 }),
      drop: phys({ color: 0x47a6ff, emissive: 0x0a4cab, emissiveIntensity: 0.35, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 }),
      snow: phys({ color: 0xffffff, emissive: 0xb6d0ff, emissiveIntensity: 0.25, roughness: 0.5, flatShading: true }),
      bolt: phys({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 0.8, roughness: 0.22, clearcoat: 1 }),
      fog: phys({ color: 0xeef2f8, roughness: 0.6, transparent: true, opacity: 0.85 }),
    },
    glowTex: radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [0.6, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']]),
    shadowTex: radialTexture([[0, 'rgba(0,0,0,.6)'], [0.5, 'rgba(0,0,0,.22)'], [1, 'rgba(0,0,0,0)']]),
  };
}

/* ---------- Models ---------- */

function glowSprite(A, color, opacity, scale) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color, transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(scale);
  s.position.z = -0.8;
  return s;
}

function buildSun(A) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(A.geo.sphere, A.mat.sun);
  const rays = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const ray = new THREE.Mesh(A.geo.ray, A.mat.ray);
    ray.position.set(Math.cos(a) * 1.62, Math.sin(a) * 1.62, 0);
    ray.rotation.z = a - Math.PI / 2;
    rays.add(ray);
  }
  const glow = glowSprite(A, 0xffb347, 0.75, 5.4);
  group.add(glow, rays, core);
  return {
    group,
    update(t) {
      rays.rotation.z = -t * 0.2;
      const pulse = Math.sin(t * 1.8);
      core.scale.setScalar(1 + pulse * 0.018);
      glow.material.opacity = 0.68 + pulse * 0.08;
    },
    dispose() {
      glow.material.dispose();
    },
  };
}

function buildMoon(A) {
  const group = new THREE.Group();
  const moon = new THREE.Mesh(A.geo.crescent, A.mat.moon);
  moon.position.set(0.3, 0, 0);
  moon.rotation.z = -0.38;
  moon.scale.setScalar(1.35);
  const glow = glowSprite(A, 0xa9c1ff, 0.38, 4.8);
  const stars = [[1.2, 0.95, 0.25, 0.26], [1.55, -0.25, 0.1, 0.18], [0.55, 1.6, -0.1, 0.15]].map(([x, y, z, s], i) => {
    const m = new THREE.Mesh(A.geo.sparkle, A.mat.star);
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.userData = { s, p: i * 1.9 };
    return m;
  });
  group.add(glow, moon, ...stars);
  return {
    group,
    update(t) {
      moon.rotation.y = Math.sin(t * 0.5) * 0.15;
      for (const m of stars) {
        m.scale.setScalar(m.userData.s * (0.7 + 0.3 * Math.sin(t * 2.2 + m.userData.p)));
        m.rotation.z = Math.sin(t * 0.8 + m.userData.p) * 0.25;
      }
    },
    dispose() {
      glow.material.dispose();
    },
  };
}

const PUFFS = [[-0.95, -0.05, 0, 0.62], [-0.28, 0.36, 0.06, 0.86], [0.52, 0.2, 0, 0.72], [1.1, -0.12, -0.04, 0.5]];

function buildCloud(A, material) {
  const group = new THREE.Group();
  for (const [x, y, z, r] of PUFFS) {
    const puff = new THREE.Mesh(A.geo.sphere, material);
    puff.position.set(x, y - 0.26, z);
    puff.scale.setScalar(r);
    group.add(puff);
  }
  const base = new THREE.Mesh(A.geo.cloudBase, material);
  base.rotation.z = Math.PI / 2;
  base.position.set(0.06, -0.48, 0);
  group.add(base);
  return group;
}

function rainSystem(A, { count, top = -0.15, bottom = -2.1, speed = [2.1, 2.8], size = 1, spread = 1.05 }) {
  const mesh = new THREE.InstancedMesh(A.geo.drop, A.mat.drop, count);
  mesh.frustumCulled = false;
  const tilt = 0.16;
  const slope = Math.tan(tilt);
  const span = top - bottom;
  const drops = Array.from({ length: count }, () => ({
    x: rand(-spread, spread), y: rand(bottom, top), z: rand(-0.2, 0.5), v: rand(...speed), s: rand(0.8, 1.1) * size,
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt));
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  function update(t, dt) {
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y -= d.v * dt;
      d.x += d.v * dt * slope * 0.6;
      if (d.y < bottom) {
        d.y = top;
        d.x = rand(-spread, spread) - span * slope * 0.3;
      }
      const life = (top - d.y) / span;
      const k = Math.min(1, life * 5, (1 - life) * 3.5);
      p.set(d.x, d.y, d.z);
      s.setScalar(Math.max(0.001, d.s * k));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update };
}

function snowSystem(A, { count, top = -0.15, bottom = -2.1, spread = 1.1 }) {
  const mesh = new THREE.InstancedMesh(A.geo.flake, A.mat.snow, count);
  mesh.frustumCulled = false;
  const span = top - bottom;
  const flakes = Array.from({ length: count }, () => ({
    x: rand(-spread, spread), y: rand(bottom, top), z: rand(-0.2, 0.5), v: rand(0.45, 0.8), s: rand(0.7, 1.25),
    phase: rand(0, TAU), freq: rand(1, 2), spin: rand(0, TAU),
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  function update(t, dt) {
    for (let i = 0; i < count; i++) {
      const f = flakes[i];
      f.y -= f.v * dt;
      f.spin += dt * 1.2;
      if (f.y < bottom) {
        f.y = top;
        f.x = rand(-spread, spread);
      }
      const life = (top - f.y) / span;
      const k = Math.min(1, life * 5, (1 - life) * 3.5);
      p.set(f.x + Math.sin(t * f.freq + f.phase) * 0.12, f.y, f.z);
      e.set(f.spin, f.spin * 0.7, 0);
      q.setFromEuler(e);
      s.setScalar(Math.max(0.001, f.s * k));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update };
}

function fogBars(A) {
  const group = new THREE.Group();
  const bars = [[-0.15, -0.6, 0.45, 1], [0.25, -0.95, 0.3, 0.85], [-0.05, -1.3, 0.5, 0.7]].map(([x, y, z, len], i) => {
    const bar = new THREE.Mesh(A.geo.fogBar, A.mat.fog);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(x, y, z);
    bar.scale.set(1, len, 1);
    bar.userData = { x, p: i * 1.3 };
    group.add(bar);
    return bar;
  });
  return {
    group,
    update(t) {
      for (const bar of bars) bar.position.x = bar.userData.x + Math.sin(t * 0.6 + bar.userData.p) * 0.18;
    },
  };
}

function buildBolt(A) {
  const material = A.mat.bolt.clone();
  const mesh = new THREE.Mesh(A.geo.bolt, material);
  mesh.position.set(0.1, -0.85, 0.45);
  mesh.scale.setScalar(0.85);
  mesh.rotation.z = 0.08;
  const light = new THREE.PointLight(0xd8e6ff, 0, 6, 1.5);
  light.position.set(0, -0.2, 1.4);
  const group = new THREE.Group();
  group.add(mesh, light);
  let flash = 0;
  return {
    group,
    flash() {
      flash = 0.7;
    },
    update(t, dt) {
      flash = Math.max(0, flash - dt);
      const f = flash > 0 ? (Math.sin(flash * 45) > 0 ? 1 : 0.35) * (flash / 0.7) : 0;
      material.emissiveIntensity = 0.75 + f * 2.5;
      light.intensity = f * 30;
      mesh.position.y = -0.85 + Math.sin(t * 2) * 0.03;
    },
    dispose() {
      material.dispose();
    },
  };
}

function compose(A, kind, isDay) {
  const root = new THREE.Group();
  const parts = [];
  const use = part => {
    root.add(part.group ?? part.mesh);
    parts.push(part);
    return part;
  };
  const cloud = (material, scale, x, y, z) => {
    const c = buildCloud(A, material);
    c.scale.setScalar(scale);
    c.position.set(x, y, z);
    root.add(c);
    return c;
  };
  let onFlash = null;

  switch (kind) {
    case 'clear':
      use(isDay ? buildSun(A) : buildMoon(A));
      break;
    case 'partly': {
      const sky = use(isDay ? buildSun(A) : buildMoon(A));
      sky.group.scale.setScalar(0.7);
      sky.group.position.set(-0.7, 0.6, -0.8);
      cloud(A.mat.cloud, 0.85, 0.35, -0.45, 0.5);
      break;
    }
    case 'cloudy':
      cloud(A.mat.cloudGrey, 0.66, 0.9, 0.6, -0.9);
      cloud(A.mat.cloud, 0.92, -0.2, -0.2, 0.3);
      break;
    case 'fog':
      cloud(A.mat.cloud, 0.82, 0, 0.5, 0);
      use(fogBars(A));
      break;
    case 'drizzle':
      cloud(A.mat.cloud, 0.92, 0, 0.78, 0);
      use(rainSystem(A, { count: 9, size: 0.75, speed: [1.5, 2.0] }));
      break;
    case 'rain':
      cloud(A.mat.cloudGrey, 0.92, 0, 0.78, 0);
      use(rainSystem(A, { count: 16 }));
      break;
    case 'heavy-rain':
      cloud(A.mat.cloudDark, 0.92, 0, 0.78, 0);
      use(rainSystem(A, { count: 28, speed: [2.8, 3.6] }));
      break;
    case 'sleet':
      cloud(A.mat.cloudGrey, 0.92, 0, 0.78, 0);
      use(rainSystem(A, { count: 8 }));
      use(snowSystem(A, { count: 9 }));
      break;
    case 'snow':
      cloud(A.mat.cloud, 0.92, 0, 0.78, 0);
      use(snowSystem(A, { count: 22 }));
      break;
    case 'storm': {
      cloud(A.mat.cloudDark, 0.92, 0, 0.78, 0);
      use(rainSystem(A, { count: 12 }));
      const bolt = use(buildBolt(A));
      onFlash = () => bolt.flash();
      break;
    }
    default:
      cloud(A.mat.cloud, 0.92, 0, 0, 0);
  }

  return {
    group: root,
    update(t, dt) {
      for (const part of parts) part.update?.(t, dt);
    },
    flash() {
      onFlash?.();
    },
    dispose() {
      for (const part of parts) part.dispose?.();
      root.traverse(o => {
        if (o.isInstancedMesh) o.dispose();
      });
    },
  };
}

/* ---------- Scene ---------- */

// Yield to the browser between heavy setup steps so no single task blocks for long.
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

export async function createHeroScene(canvas, { context, pointer = { x: 0, y: 0 }, reducedMotion = false, onContextLost } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    console.info('WebGL is unavailable; keeping the 2D weather icon.', err);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  await nextFrame();
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.85;
  room.dispose();
  pmrem.dispose();
  await nextFrame();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0, 9.5);

  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x34405a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(-3, 4.5, 6);
  const rim = new THREE.DirectionalLight(0xa8c8ff, 1.5);
  rim.position.set(4, 1.5, -4);
  scene.add(key, rim);

  const A = createAssets();
  const rig = new THREE.Group();
  const holder = new THREE.Group();
  rig.add(holder);
  scene.add(rig);

  const shadowMaterial = new THREE.SpriteMaterial({ map: A.shadowTex, transparent: true, opacity: 0.3, depthWrite: false });
  const shadow = new THREE.Sprite(shadowMaterial);
  shadow.position.set(0, -2.2, -0.5);
  shadow.scale.set(2.8, 0.42, 1);
  scene.add(shadow);

  let active = null;
  let leaving = null;
  let enter = 1;
  let leave = 1;
  let current = '';
  let running = false;
  let visible = true;
  let last = 0;
  let shadowBase = 0.3;

  function frame(time) {
    const t = time / 1000;
    const dt = last ? Math.min(0.05, t - last) : 1 / 60;
    last = t;

    if (leaving) {
      leave = Math.min(1, leave + dt / 0.3);
      leaving.group.scale.setScalar(Math.max(0.001, 1 - easeInCubic(leave)));
      if (leave >= 1) {
        holder.remove(leaving.group);
        leaving.dispose();
        leaving = null;
      }
    } else if (active && enter < 1) {
      enter = Math.min(1, enter + dt / 0.8);
      active.group.scale.setScalar(Math.max(0.001, easeOutBack(enter)));
    }

    holder.position.y = Math.sin(t * 1.15) * 0.1;
    holder.rotation.z = Math.sin(t * 0.55) * 0.03;
    rig.rotation.y += (pointer.x * 0.42 - rig.rotation.y) * 0.05;
    rig.rotation.x += (pointer.y * 0.26 - rig.rotation.x) * 0.05;

    const lift = holder.position.y;
    shadow.scale.set(2.8 - lift * 1.4, 0.42 - lift * 0.2, 1);
    shadowMaterial.opacity = Math.max(0, shadowBase - lift * 0.5);

    active?.update(t, dt);
    leaving?.update(t, dt);
    renderer.render(scene, camera);
  }

  function renderStill() {
    if (active) {
      active.group.scale.setScalar(1);
      active.update(0, 0);
    }
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reducedMotion || !visible || document.hidden) return;
    running = true;
    last = 0;
    renderer.setAnimationLoop(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
  }

  let pending = 0;
  // compileAsync() warns (and polls) without this extension, so check it up front.
  const canCompileAsync = Boolean(renderer.getContext().getExtension('KHR_parallel_shader_compile'));

  async function setCondition(kind, isDay) {
    const next = `${kind}:${isDay ? 'day' : 'night'}`;
    if (next === current) return;
    current = next;
    const model = compose(A, kind, isDay);
    // Compile shaders without blocking the page where parallel compilation is available.
    const token = ++pending;
    try {
      if (canCompileAsync) await renderer.compileAsync(model.group, camera, scene);
      else renderer.compile(model.group, camera, scene);
    } catch {
      /* fall back to compiling on first render */
    }
    if (token !== pending) {
      model.dispose();
      return;
    }
    shadowBase = ['clear', 'partly', 'cloudy', 'fog'].includes(kind) ? 0.32 : 0.16;

    if (reducedMotion) {
      if (active) {
        holder.remove(active.group);
        active.dispose();
      }
      active = model;
      holder.add(model.group);
      renderStill();
      return;
    }

    if (leaving) {
      holder.remove(leaving.group);
      leaving.dispose();
      leaving = null;
    }
    if (active) {
      leaving = active;
      leave = 0;
    }
    active = model;
    enter = 0;
    model.group.scale.setScalar(0.001);
    holder.add(model.group);
    if (!running) renderer.render(scene, camera);
    start();
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = 9.5 / Math.min(1, camera.aspect);
    camera.updateProjectionMatrix();
    if (!running) renderStill();
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
    else stop();
  }).observe(canvas);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('skycast:lightning', () => active?.flash());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stop();
    onContextLost?.();
  });

  return { setCondition };
}
