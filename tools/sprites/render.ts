// Runs in a browser page (tools/make-sprites.ts opens it): turns Kenney's 3D models into 2D
// pictures seen from the game's camera angle. Not part of the game.
import * as THREE from 'three';
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

Object.assign(window, { renderRecipe, ready: true });
