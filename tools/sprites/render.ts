// Runs in a browser page (tools/make-sprites.ts opens it): turns Kenney's 3D models into 2D
// pictures seen from the game's camera angle. Not part of the game.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Recipe } from './recipes';

/** Pixels per model unit. One model unit is WORLD_PER_UNIT game units. */
export const PX = 150;
const AZIMUTH = (35 * Math.PI) / 180;
const ELEVATION = (32 * Math.PI) / 180;

const loader = new GLTFLoader();
const textures = new Map<string, THREE.Texture>();
const models = new Map<string, THREE.Group>();

async function model(name: string): Promise<THREE.Group> {
  if (!models.has(name)) models.set(name, (await loader.loadAsync(`/art/castle-kit/${name}.glb`)).scene);
  return models.get(name)!.clone(true);
}

/** Kenney's colour sets by roof colour and stone kind. Purple is made here from blue. */
const TEXTURES: Record<string, string> = {
  'blue-sand': 'colormap',
  'red-sand': 'variation-a',
  'green-sand': 'variation-b',
  'yellow-sand': 'variation-c',
  'blue-grey': 'variation-d',
  'red-grey': 'variation-e',
  'green-grey': 'variation-f',
  'yellow-grey': 'variation-g',
};

async function image(file: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `/art/castle-kit/Textures/${file}.png`;
  await img.decode();
  return img;
}

/** The blue set with its roof colours turned purple: only pixels that differ from the red set change. */
async function purple(stone: string): Promise<HTMLCanvasElement> {
  const [blue, red] = await Promise.all([image(TEXTURES[`blue-${stone}`]), image(TEXTURES[`red-${stone}`])]);
  const c = document.createElement('canvas');
  c.width = blue.width;
  c.height = blue.height;
  const g = c.getContext('2d')!;
  g.drawImage(red, 0, 0);
  const r = g.getImageData(0, 0, c.width, c.height).data;
  g.drawImage(blue, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const b = data.data;
  for (let i = 0; i < b.length; i += 4) {
    if (Math.abs(b[i] - r[i]) + Math.abs(b[i + 1] - r[i + 1]) + Math.abs(b[i + 2] - r[i + 2]) < 30) continue;
    // Blue to purple: more red, a little less green.
    b[i] = Math.min(255, b[i] * 0.55 + b[i + 2] * 0.55);
    b[i + 1] = b[i + 1] * 0.7;
  }
  g.putImageData(data, 0, 0);
  return c;
}

async function texture(name: string): Promise<THREE.Texture> {
  if (!textures.has(name)) {
    const [roof, stone] = name.split('-');
    const t = roof === 'purple' ? new THREE.CanvasTexture(await purple(stone)) : new THREE.Texture(await image(TEXTURES[name]));
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.needsUpdate = true;
    textures.set(name, t);
  }
  return textures.get(name)!;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

export interface Sprite {
  dataUrl: string;
  /** Size in pixels, and where the model's ground point (0, 0, 0) is in the picture. */
  w: number;
  h: number;
  ax: number;
  ay: number;
}

async function build(r: Recipe): Promise<THREE.Group> {
  const group = new THREE.Group();
  let y = 0;
  for (const part of r.parts) {
    const m = await model(part);
    m.position.y = y;
    group.add(m);
    const box = new THREE.Box3().setFromObject(m);
    y = box.max.y - (r.overlap ?? 0);
  }
  for (const extra of r.top ?? []) {
    const m = await model(extra.part);
    m.position.set(extra.x ?? 0, y + (extra.y ?? 0), extra.z ?? 0);
    m.rotation.y = extra.turn ?? 0;
    group.add(m);
  }
  if (r.texture) {
    const t = await texture(r.texture);
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (mat.map) {
          t.magFilter = mat.map.magFilter;
          t.minFilter = mat.map.minFilter;
          t.wrapS = mat.map.wrapS;
          t.wrapT = mat.map.wrapT;
        }
        mat.map = t;
        mesh.material = mat;
      }
    });
  }
  for (const turn of r.turn ?? []) {
    const node = group.getObjectByName(turn.node);
    if (node) node.rotation[turn.axis] += turn.angle;
  }
  group.scale.setScalar(r.scale ?? 1);
  return group;
}

async function renderRecipe(r: Recipe): Promise<Sprite> {
  const scene = new THREE.Scene();
  // Light from the top left, like the shadows the game draws.
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6a7a5a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const obj = await build(r);
  scene.add(obj);

  // Camera looking down at the game's angle, from the front-right.
  const dir = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  cam.position.copy(dir.multiplyScalar(10));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();

  // Fit the picture tightly around the model, in camera space.
  const box = new THREE.Box3().setFromObject(obj);
  const inv = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = 0.04;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  cam.left = minX; cam.right = maxX; cam.top = maxY; cam.bottom = minY;
  cam.updateProjectionMatrix();
  const w = Math.ceil((maxX - minX) * PX);
  const h = Math.ceil((maxY - minY) * PX);
  renderer.setSize(w, h, false);
  renderer.render(scene, cam);
  const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(inv);
  return { dataUrl: renderer.domElement.toDataURL('image/png'), w, h, ax: (origin.x - minX) * PX, ay: (maxY - origin.y) * PX };
}

/** What is inside an FBX file: animations, bones, meshes and size (for choosing what to render). */
async function inspectFbx(path: string) {
  const obj = await new FBXLoader().loadAsync(path);
  const box = new THREE.Box3().setFromObject(obj);
  const meshes: string[] = [];
  const bones: string[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(`${o.name} (${(Array.isArray((o as THREE.Mesh).material) ? ((o as THREE.Mesh).material as THREE.Material[]) : [(o as THREE.Mesh).material as THREE.Material]).map((m) => m.name).join(', ')})`);
    if ((o as THREE.Bone).isBone) bones.push(o.name);
  });
  return {
    animations: obj.animations.map((a) => `${a.name} ${a.duration.toFixed(2)}s`),
    meshes,
    bones,
    size: [box.min.toArray().map((n) => +n.toFixed(2)), box.max.toArray().map((n) => +n.toFixed(2))],
  };
}

export interface CharacterRecipe {
  name: string;
  /** The character FBX, e.g. /art/knight-pack/KnightCharacter.fbx. */
  model: string;
  /** Height in model units after scaling (1 unit = 50 game units). */
  height: number;
  /** Pieces attached to bones: placed at the bone in the rest pose, then they move with it. */
  props?: { file: string; bone: string; offset?: number[]; rotation?: number[]; scale?: number }[];
  /** Animation name (without "HumanArmature|") and the moments to render, in seconds. */
  anim: string;
  times: number[];
  /** Which way it faces, in degrees around the vertical axis (0 = towards the camera's right). */
  facing?: number;
  /** Colours by material name. */
  colors?: Record<string, string>;
  /** A material to also render alone in white (the game tints it: the team colour). */
  mask?: string;
}

const fbx = new Map<string, THREE.Group>();
async function loadFbx(path: string): Promise<THREE.Group> {
  if (!fbx.has(path)) fbx.set(path, await new FBXLoader().loadAsync(path));
  return fbx.get(path)!;
}

/** One picture per moment of an animation; all share one frame size so they line up. */
async function renderCharacter(r: CharacterRecipe): Promise<Sprite[]> {
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const source = await loadFbx(r.model);
  const char = clone(source) as THREE.Group;
  const rest = new THREE.Box3().setFromObject(char);
  const s = r.height / (rest.max.y - rest.min.y);
  const root = new THREE.Group();
  root.add(char);
  root.scale.setScalar(s);
  root.rotation.y = ((r.facing ?? 0) * Math.PI) / 180 + AZIMUTH + Math.PI / 2;
  root.updateMatrixWorld(true);
  for (const p of r.props ?? []) {
    // Wrapped, so our turn comes on top of the file's own (Blender files arrive turned 90°).
    const prop = new THREE.Group();
    prop.add((await loadFbx(p.file)).clone(true));
    const bone = char.getObjectByName(p.bone);
    if (!bone) throw new Error(`no bone ${p.bone}`);
    const pos = new THREE.Vector3();
    bone.getWorldPosition(pos);
    const off = p.offset ?? [0, 0, 0];
    prop.position.copy(root.worldToLocal(pos.clone())).add(new THREE.Vector3(off[0], off[1], off[2]));
    const rot = p.rotation ?? [0, 0, 0];
    prop.rotation.set((rot[0] * Math.PI) / 180, (rot[1] * Math.PI) / 180, (rot[2] * Math.PI) / 180);
    prop.scale.multiplyScalar(p.scale ?? 1);
    root.add(prop);
    prop.updateMatrixWorld(true);
    bone.attach(prop);
  }
  if (r.colors) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = mats.map((m) => {
        const c = r.colors![m.name];
        if (!c) return m;
        const n = (m as THREE.MeshPhongMaterial).clone();
        n.color = new THREE.Color(c);
        return n;
      });
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
  }
  const mixer = new THREE.AnimationMixer(char);
  const clip = source.animations.find((a) => a.name.endsWith(`|${r.anim}`) || a.name === r.anim);
  if (!clip) throw new Error(`no animation ${r.anim}`);
  mixer.clipAction(clip).play();

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6a7a5a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  scene.add(root);
  const dir = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  cam.position.copy(dir.multiplyScalar(10));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;

  // One frame box for all moments: the union of each pose's bounds.
  const poses: number[][] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of r.times) {
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      if (mesh.isSkinnedMesh) {
        const pos = mesh.geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i += 3) {
          mesh.getVertexPosition(i, v);
          box.expandByPoint(v.applyMatrix4(mesh.matrixWorld));
        }
      } else box.expandByObject(mesh);
    });
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    poses.push([t]);
  }
  const pad = 0.03;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  cam.left = minX; cam.right = maxX; cam.top = maxY; cam.bottom = minY;
  cam.updateProjectionMatrix();
  const w = Math.ceil((maxX - minX) * PX);
  const h = Math.ceil((maxY - minY) * PX);
  renderer.setSize(w, h, false);
  const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(inv);
  const out: Sprite[] = [];
  const shoot = () => {
    for (const t of r.times) {
      mixer.setTime(t);
      root.updateMatrixWorld(true);
      renderer.render(scene, cam);
      out.push({ dataUrl: renderer.domElement.toDataURL('image/png'), w, h, ax: (origin.x - minX) * PX, ay: (maxY - origin.y) * PX });
    }
  };
  shoot();
  if (r.mask) {
    // The mask: the chosen material in flat white, everything else hidden but still in front of it.
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hide = new THREE.MeshBasicMaterial({ colorWrite: false });
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => (m.name === r.mask ? white : hide);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    shoot();
  }
  return out;
}

/** All moments of an animation side by side in one picture (and the mask's, if any). */
async function renderCharacterSheet(r: CharacterRecipe) {
  const shots = await renderCharacter(r);
  const n = r.times.length;
  const { w, h, ax, ay } = shots[0];
  const pack = async (list: Sprite[]) => {
    const c = document.createElement('canvas');
    c.width = w * n;
    c.height = h;
    const g = c.getContext('2d')!;
    for (let i = 0; i < n; i++) {
      const img = new Image();
      img.src = list[i].dataUrl;
      await img.decode();
      g.drawImage(img, i * w, 0);
    }
    return c.toDataURL('image/png');
  };
  return { sheet: await pack(shots.slice(0, n)), mask: r.mask ? await pack(shots.slice(n)) : null, w, h, ax, ay, frames: n };
}

Object.assign(window, { renderRecipe, renderCharacter, renderCharacterSheet, inspectFbx, ready: true });
