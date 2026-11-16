// Vista 3D del proyecto con Three.js. Solo dibuja: el estado sale de la misma simulación que la vista 2D
// (ver escena3d.js). Three.js se carga hasta que se abre la vista 3D: primero la copia incluida en
// Rangokit (vendor/) y, si no se puede (por ejemplo al abrir el archivo directo desde el disco), desde
// jsDelivr. No se envía nada del proyecto: solo se descarga la librería.
import { scene, pose, spinRate } from './escena3d.js';

export const THREE_VERSION = '0.170.0';
export const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`;

let threePromise = null;
export function loadThree() {
  if (!threePromise) {
    const local = new URL('vendor/three.module.min.js', document.baseURI).href;
    threePromise = import(local).catch(() => import(THREE_CDN));
    threePromise.catch(() => { threePromise = null; });
  }
  return threePromise;
}

function stripeTexture(THREE, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const g = canvas.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 8);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, 22, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function labelSprite(THREE, text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = 'bold 34px system-ui, Segoe UI, sans-serif';
  const w = Math.min(250, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(15,22,21,0.78)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 10);
  g.fill();
  g.fillStyle = '#f7faf6';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.8, 0.2, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Crea la vista 3D dentro de `container`.
 * ctx: { project() → proyecto, view() → view(sim) o null, interaction(c), press(id), toggle(id), select(id) }.
 * Devuelve { rebuild(), frame(), dispose() }.
 */
export async function createView3d(container, ctx) {
  const THREE = await loadThree();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    throw new Error('este navegador o esta computadora no tienen WebGL activo');
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'view3d-canvas';
  renderer.domElement.setAttribute('aria-label', 'Vista 3D del proyecto. Arrastra para girar, rueda para acercar, clic derecho o Mayús para desplazar.');
  renderer.domElement.tabIndex = 0;
  container.prepend(renderer.domElement);

  const css = getComputedStyle(document.documentElement);
  const cssColor = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const world = new THREE.Scene();
  world.background = new THREE.Color(cssColor('--paper', '#e9eeea'));
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);

  world.add(new THREE.HemisphereLight(0xffffff, 0x5a6670, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  world.add(sun, sun.target);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: cssColor('--sheet', '#f7faf6'), roughness: 0.95 }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  world.add(table);
  const grid = new THREE.GridHelper(200, 400, cssColor('--line', '#a9b8b0'), cssColor('--grid', '#dbe4dd'));
  grid.position.y = 0.002;
  world.add(grid);

  // ── Cámara orbital propia (sin complementos de Three.js) ──
  const orbit = { target: new THREE.Vector3(8, 0, 5), dist: 12, theta: -0.35, phi: 0.95 };
  const place = () => {
    const { target, dist, theta, phi } = orbit;
    camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    sun.position.set(orbit.target.x + 6, 14, orbit.target.z + 9);
    sun.target.position.copy(orbit.target);
  };

  let root = new THREE.Group();
  world.add(root);
  const materials = new Map();
  const animated = [];   // { mesh/pivot, part, compId }
  const links = new Map();
  let compById = new Map();

  const material = (part) => {
    const unique = ['lamp', 'panel', 'river', 'charge'].includes(part.role);
    const key = `${part.color}|${part.metal ?? 0}|${part.glass ? 1 : 0}`;
    if (!unique && materials.has(key)) return materials.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: part.color, metalness: part.metal ?? 0.08, roughness: part.metal ? 0.35 : 0.6,
      transparent: Boolean(part.glass), opacity: part.glass ? (part.role === 'water' ? 0.75 : 0.4) : 1,
    });
    if (!unique) materials.set(key, m);
    return m;
  };

  const geometry = (part) => {
    if (part.shape === 'box') return new THREE.BoxGeometry(...part.size);
    if (part.shape === 'sph') return new THREE.SphereGeometry(part.size[0], 20, 14);
    const [rTop, len, rBottom = rTop] = part.size;
    return new THREE.CylinderGeometry(rTop, rBottom, len, part.segments ?? 24);
  };

  const orient = (obj, axis) => {
    if (axis === 'x') obj.rotation.z = Math.PI / 2;
    if (axis === 'z') obj.rotation.x = Math.PI / 2;
  };

  function buildPart(group, part, compId) {
    const mesh = new THREE.Mesh(geometry(part), material(part));
    mesh.castShadow = !part.glass;
    mesh.receiveShadow = true;
    mesh.userData.comp = compId;
    if (part.shape === 'cyl') orient(mesh, part.axis);
    if (part.turn) mesh.rotation.y = part.turn;
    if (part.tilt) mesh.rotation.x = part.tilt;
    let node = mesh;
    if (part.role === 'blades') {
      const pivot = new THREE.Group();
      pivot.position.set(...part.hub);
      mesh.position.set(0, part.offset, 0);
      pivot.add(mesh);
      node = pivot;
    } else if (part.role === 'lever' && part.pivot) {
      const pivot = new THREE.Group();
      pivot.position.set(...part.pivot);
      mesh.position.set(part.pos[0] - part.pivot[0], part.pos[1] - part.pivot[1], part.pos[2] - part.pivot[2]);
      pivot.add(mesh);
      node = pivot;
    } else if (part.role === 'shaft') {
      // Grupo que gira sobre el eje de la pieza, con una marca para que se note el giro.
      const spin = new THREE.Group();
      spin.position.set(...part.pos);
      spin.add(mesh);
      const r = part.size[0];
      const key = new THREE.Mesh(new THREE.BoxGeometry(part.axisSpin === 'x' ? part.size[1] * 0.9 : r * 0.6, r * 0.5, part.axisSpin === 'x' ? r * 0.6 : r * 0.6), material({ color: '#15191b' }));
      key.position.set(0, r, 0);
      if (part.axisSpin === 'y') key.position.set(r, 0, 0);
      spin.add(key);
      node = spin;
    } else {
      mesh.position.set(...part.pos);
    }
    group.add(node);
    if (part.role) animated.push({ node, mesh, part, compId, base: [...part.pos], angle: part.angle ?? 0 });
  }

  function build() {
    world.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Array.from(materials.values()).includes(o.material)) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    root = new THREE.Group();
    world.add(root);
    animated.length = 0;
    links.clear();
    const project = ctx.project();
    compById = new Map(project.components.map((c) => [c.id, c]));
    const desc = scene(project);
    for (const comp of desc.components) {
      const group = new THREE.Group();
      group.position.set(comp.x, 0, comp.z);
      group.rotation.y = comp.rotY;
      group.userData.comp = comp.id;
      for (const part of comp.parts) buildPart(group, part, comp.id);
      const top = Math.max(0.3, ...comp.parts.map((p) => p.pos[1] + (p.shape === 'box' ? p.size[1] / 2 : p.size[0])));
      const label = labelSprite(THREE, comp.label);
      label.position.set(0, top + 0.22, 0);
      group.add(label);
      root.add(group);
    }
    for (const link of desc.links) {
      if (link.points.length < 2) continue;
      const path = new THREE.CurvePath();
      let length = 0;
      for (let i = 1; i < link.points.length; i += 1) {
        const a = new THREE.Vector3(...link.points[i - 1]);
        const b = new THREE.Vector3(...link.points[i]);
        length += a.distanceTo(b);
        path.add(new THREE.LineCurve3(a, b));
      }
      const map = stripeTexture(THREE, link.color);
      map.repeat.set(Math.max(1, length / 0.25), 1);
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', map, metalness: link.kind === 'eje' ? 0.7 : 0.1, roughness: 0.45 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(16, link.points.length * 12), link.r, 10, false), mat);
      tube.castShadow = true;
      tube.userData.link = link.id;
      root.add(tube);
      links.set(link.id, { tube, mat, map, kind: link.kind, color: new THREE.Color(link.color) });
    }
    return desc;
  }

  function frame() {
    const desc = scene(ctx.project());
    orbit.target.set(desc.bounds.x, 0, desc.bounds.z);
    orbit.dist = desc.bounds.size * 0.75 + 2.5;
    orbit.theta = -0.3;
    orbit.phi = 0.85;
    table.position.set(desc.bounds.x, 0, desc.bounds.z);
    grid.position.set(Math.round(desc.bounds.x), 0.002, Math.round(desc.bounds.z));
    place();
  }

  // ── Animación ──
  let last = performance.now();
  let raf = 0;
  const tmpColor = new THREE.Color();
  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!container.isConnected || container.hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const view = ctx.view();
    for (const a of animated) {
      const component = compById.get(a.compId);
      if (!component) continue;
      const live = view?.parts.get(a.compId) ?? null;
      const s = pose(component, live);
      const { part, node, mesh, base } = a;
      switch (part.role) {
        case 'rod': node.position.x = base[0] + s.rod * part.stroke; break;
        case 'button': if (part.axisPress === 'x') node.position.x = base[0] + (s.pressed ? 0.05 : 0); else node.position.y = base[1] - (s.pressed ? 0.05 : 0); break;
        case 'lever': node.rotation.z = s.toggled ? -0.55 : 0.55; break;
        case 'spool': node.position.x = base[0] + (s.spool ? 0.25 : -0.25); break;
        case 'wheel': node.rotation.y = s.toggled ? 0 : Math.PI / 2; break;
        case 'servo': node.rotation.y = ((s.servo - 90) * Math.PI) / 180; break;
        case 'water': {
          const level = Math.max(0.001, s.level);
          node.scale.y = level;
          node.position.y = part.bottom + (part.height * level) / 2;
          break;
        }
        case 'charge': {
          const soc = Math.max(0.001, s.soc);
          node.scale.x = soc;
          node.position.x = base[0] - part.width / 2 + (part.width * soc) / 2;
          mesh.material.color?.set(soc < 0.2 ? '#d63a3a' : soc < 0.5 ? '#f2c230' : '#2e8b57');
          break;
        }
        case 'lamp': case 'panel': case 'river': {
          const on = part.always ? Boolean(view) : s.lamp;
          mesh.material.emissive.set(on ? (part.lamp ?? part.color) : '#000000');
          mesh.material.emissiveIntensity = on ? (part.role === 'lamp' ? 1.6 : 0.35) : 0;
          if (part.glass) mesh.material.opacity = on ? 0.95 : 0.4;
          break;
        }
        case 'blades': case 'shaft': {
          const rate = spinRate(s.rpm) * (part.fast ? 1.6 : 1);
          a.angle += rate * dt;
          const axis = part.axisSpin ?? 'x';
          node.rotation[axis] = a.angle;
          break;
        }
        default: break;
      }
    }
    for (const [id, l] of links) {
      const state = view?.links.get(id) ?? '';
      const live = Boolean(state);
      l.mat.emissive.copy(live ? tmpColor.copy(l.color) : tmpColor.set('#000000'));
      l.mat.emissiveIntensity = live ? 0.55 : 0;
      if (live) l.map.offset.x -= dt * (l.kind === 'eje' ? 3 : 1.2);
    }
    renderer.render(world, camera);
  }

  // ── Tamaño ──
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  // ── Mouse y toque: girar, acercar, desplazar y accionar componentes ──
  const el = renderer.domElement;
  const pointers = new Map();
  let drag = null;
  let pinch = 0;
  const raycaster = new THREE.Raycaster();
  const hit = (event) => {
    const rect = el.getBoundingClientRect();
    const v = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    for (const h of raycaster.intersectObjects(root.children, true)) {
      let o = h.object;
      while (o && !o.userData.comp) o = o.parent;
      if (o?.userData.comp && !(h.object instanceof THREE.Sprite)) return o.userData.comp;
    }
    return null;
  };
  const onDown = (event) => {
    el.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      drag = null;
      return;
    }
    const id = event.button === 0 ? hit(event) : null;
    const component = id ? compById.get(id) : null;
    const mode = component && ctx.view() ? ctx.interaction(component) : null;
    drag = { x: event.clientX, y: event.clientY, moved: false, pan: event.button === 2 || event.button === 1 || event.shiftKey, id, mode };
    if (mode === 'hold') {
      ctx.press(id);
      drag.holding = true;
    }
  };
  const onMove = (event) => {
    if (!pointers.has(event.pointerId)) return;
    const prev = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) orbit.dist = Math.min(80, Math.max(1.2, orbit.dist * (pinch / d)));
      pinch = d;
      place();
      return;
    }
    if (!drag || drag.holding) return;
    const dx = event.clientX - prev.x;
    const dy = event.clientY - prev.y;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
    if (drag.pan) {
      const k = orbit.dist * 0.0016;
      const right = new THREE.Vector3(Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
      const forward = new THREE.Vector3(Math.sin(orbit.theta), 0, Math.cos(orbit.theta));
      orbit.target.addScaledVector(right, -dx * k).addScaledVector(forward, -dy * k);
    } else {
      orbit.theta -= dx * 0.006;
      orbit.phi = Math.min(1.5, Math.max(0.15, orbit.phi - dy * 0.006));
    }
    place();
  };
  const onUp = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag && !drag.moved && !drag.holding && drag.id) {
      if (drag.mode === 'toggle') ctx.toggle(drag.id);
      else if (!ctx.view()) ctx.select(drag.id);
    }
    drag = null;
  };
  const onWheel = (event) => {
    event.preventDefault();
    orbit.dist = Math.min(80, Math.max(1.2, orbit.dist * Math.exp(event.deltaY * 0.001)));
    place();
  };
  const onKey = (event) => {
    const step = { ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[event.key];
    if (step) {
      event.preventDefault();
      orbit.theta += step[0];
      orbit.phi = Math.min(1.5, Math.max(0.15, orbit.phi + step[1]));
      place();
    } else if (event.key === '+' || event.key === '-') {
      orbit.dist = Math.min(80, Math.max(1.2, orbit.dist * (event.key === '+' ? 0.85 : 1.18)));
      place();
    }
  };
  const noMenu = (event) => event.preventDefault();
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('keydown', onKey);
  el.addEventListener('contextmenu', noMenu);

  build();
  frame();
  resize();
  raf = requestAnimationFrame(tick);

  return {
    rebuild: build,
    frame,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      root.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose?.(); });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      el.remove();
    },
  };
}
