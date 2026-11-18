// The stage: a row of comics shown as sheets of paper you can grab, bend and
// flip over. One WebGL canvas, one mesh per sheet, all motion on springs.

import * as THREE from "three";
import { drawPaper, paperKey, type PaperFonts } from "./paper";
import type { StageCallbacks, StageFace, StageSheet } from "./types";
import { tipAngleFor } from "./curl";
import { sealPose } from "./seal";
import { bookFrame, bookLayoutFor, stepBook, type BookLayout } from "./view";
import { edgeBand } from "./edges";

const SHEET_W = 1;
const SHEET_H = 1.5;
/** Centre-to-centre distance between neighbours, in sheet widths. */
const SPACING = 1.62;
const FOV = 26;
/** How a sheet sits when nobody is touching it. */
const REST = { yaw: -0.2, pitch: 0.03, roll: -0.035 };
/** Art is loaded for this many sheets either side of the current one. */
const LOAD_RADIUS = 2;
const KEEP_RADIUS = 5;
/** Phones have far less GPU memory: keep only the neighbours in reach. */
const LOAD_RADIUS_SMALL = 1;
const KEEP_RADIUS_SMALL = 2;

/** How a sheet bends (shared by the covers and the page edges between them). */
const DEFORM = /* glsl */ `
  uniform vec3 uBend;   // x: curl across the width, y: curl down the height, z: spin lag
  uniform float uTwist;
  // A bound leaf (reading a comic): hinged at the spine, bent as an arc from
  // the spine angle to the tip angle (see curl.ts), lifted off the stack.
  uniform float uLeaf;
  uniform float uSpine;
  uniform float uTip;
  uniform float uLift;
  vec3 deform(vec3 p) {
    if (uLeaf > 0.5) {
      float W = ${SHEET_W.toFixed(1)};
      float u = p.x / W + 0.5;
      float k = uTip - uSpine;
      float phi = uSpine + k * u;
      vec2 q = abs(k) < 0.0001
        ? u * vec2(cos(uSpine), sin(uSpine))
        : vec2(sin(phi) - sin(uSpine), cos(uSpine) - cos(phi)) / k;
      q *= W;
      // A corner grab lifts that corner a touch ahead of the rest of the page.
      float lift = uTwist * p.y * u * u * W * 0.35;
      return vec3(q.x - lift * sin(phi), p.y, q.y + lift * cos(phi) + uLift);
    }
    // Cylindrical curls keep the paper's length, so it bends instead of stretching.
    float kx = uBend.x;
    if (abs(kx) > 0.0001) {
      float a = p.x * kx;
      p.z += (1.0 - cos(a)) / kx;
      p.x = sin(a) / kx;
    }
    float ky = uBend.y;
    if (abs(ky) > 0.0001) {
      float a = p.y * ky;
      p.z += (1.0 - cos(a)) / ky;
      p.y = sin(a) / ky;
    }
    // The outer edges trail behind a spin.
    p.z += uBend.z * p.x * abs(p.x) * 2.0;
    float t = uTwist * p.y;
    float c = cos(t);
    float s = sin(t);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }
`;

const VERTEX = /* glsl */ `
  ${DEFORM}
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vUv = uv;
    vec3 p = deform(position);
    vec3 tangent = deform(position + vec3(0.01, 0.0, 0.0)) - p;
    vec3 bitangent = deform(position + vec3(0.0, 0.01, 0.0)) - p;
    vNormal = normalMatrix * normalize(cross(tangent, bitangent));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uFront;
  uniform sampler2D uBack;
  uniform vec2 uFrontFit;
  uniform vec2 uBackFit;
  uniform float uFrontOn;
  uniform float uBackOn;
  uniform float uFrontShimmer;
  uniform float uBackShimmer;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  const vec2 SIZE = vec2(${SHEET_W.toFixed(1)}, ${SHEET_H.toFixed(1)});
  const float MARGIN = 0.022;
  const vec3 PAPER = vec3(0.965, 0.96, 0.945);
  const vec3 BOARD = vec3(0.985, 0.985, 0.98);

  void main() {
    // The back cover is drawn from behind (BackSide), where three.js flips which faces count as
    // front-facing: there the side we see is the back, so it shows the back art, the right way round.
    #ifdef FLIP_SIDED
      bool front = !gl_FrontFacing;
    #else
      bool front = gl_FrontFacing;
    #endif
    vec2 uv = vUv;
    if (!front) uv.x = 1.0 - uv.x;

    // The art sits inside a thin white border, like a comic in its sleeve.
    vec2 pos = uv * SIZE;
    vec2 inner = (pos - MARGIN) / (SIZE - 2.0 * MARGIN);
    vec2 aa = fwidth(inner);
    vec2 edge = smoothstep(vec2(0.0), aa, inner) * smoothstep(vec2(0.0), aa, 1.0 - inner);
    float inArt = edge.x * edge.y;

    vec2 fit = front ? uFrontFit : uBackFit;
    vec2 tuv = (inner - 0.5) * fit + 0.5;
    vec3 art = front ? texture2D(uFront, tuv).rgb : texture2D(uBack, tuv).rgb;
    float on = front ? uFrontOn : uBackOn;
    vec3 col = mix(PAPER, art, on);

    // A slow light sweep over pages that are still being drawn.
    float shimmer = front ? uFrontShimmer : uBackShimmer;
    float sweep = sin((inner.x + inner.y * 0.6) * 4.0 - uTime * 2.4) * 0.5 + 0.5;
    col *= 1.0 - shimmer * 0.045 * sweep;

    col = mix(BOARD, col, inArt);

    vec3 n = normalize(vNormal);
    if (!front) n = -n;
    vec3 v = normalize(-vViewPos);

    // One soft key light from the upper left.
    float lit = clamp(dot(n, normalize(vec3(-0.35, 0.55, 0.76))), 0.0, 1.0);
    col *= mix(0.8, 1.0, smoothstep(0.3, 0.92, lit));

    // Sleeve gloss: two thin window reflections that slide as the sheet bends.
    vec3 r = reflect(-v, n);
    float streak = r.x * 0.82 + r.y * 0.57;
    float gloss = smoothstep(0.05, 0.0, abs(streak - 0.33)) * 0.07
                + smoothstep(0.014, 0.0, abs(streak - 0.44)) * 0.06;
    col += gloss;

    // A hairline at the paper's edge so white sheets hold on a white stage.
    float rim = min(min(pos.x, SIZE.x - pos.x), min(pos.y, SIZE.y - pos.y));
    col *= mix(0.9, 1.0, smoothstep(0.0, 0.0035, rim));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** The page edges and spine of a closed comic, bent exactly like its covers (see edges.ts). */
const EDGE_VERTEX = /* glsl */ `
  ${DEFORM}
  uniform float uDepth;
  attribute vec2 outward;
  attribute float edgeSide;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vSide;

  void main() {
    vUv = uv;
    vSide = edgeSide;
    vec3 base = vec3(position.xy, 0.0);
    vec3 p = deform(base);
    // The edge faces outward along the bent sheet.
    vNormal = normalMatrix * normalize(deform(base + vec3(outward * 0.01, 0.0)) - p);
    // The back cover sits uDepth behind the front, so the band spans the same gap.
    p.z -= position.z * uDepth;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const EDGE_FRAGMENT = /* glsl */ `
  uniform sampler2D uFront;
  uniform sampler2D uBack;
  uniform vec2 uFrontFit;
  uniform vec2 uBackFit;
  uniform float uFrontOn;
  uniform float uBackOn;
  uniform float uDepth;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vSide;

  const vec2 SIZE = vec2(${SHEET_W.toFixed(1)}, ${SHEET_H.toFixed(1)});
  const float MARGIN = 0.022;
  const vec3 PAPER = vec3(0.952, 0.94, 0.915);
  const vec3 COVER = vec3(0.985, 0.985, 0.98);

  // The cover's colour at a point, framed the way the cover shader frames it.
  vec3 coverAt(sampler2D tex, vec2 fit, float on, vec2 uv) {
    vec2 inner = (uv * SIZE - MARGIN) / (SIZE - 2.0 * MARGIN);
    return mix(PAPER, texture2D(tex, (inner - 0.5) * fit + 0.5).rgb, on);
  }

  void main() {
    float d = vUv.y;      // 0 at the front cover, 1 at the back cover
    float along = vUv.x;  // along the side
    vec3 col;
    if (abs(vSide - 2.0) < 0.5) {
      // The spine: the cover folds round it, front art meeting back art, with two staples.
      vec3 front = coverAt(uFront, uFrontFit, uFrontOn, vec2(0.03, along));
      vec3 back = coverAt(uBack, uBackFit, uBackOn, vec2(0.97, along));
      col = mix(front, back, smoothstep(0.3, 0.7, d));
      col *= 0.88 + 0.12 * sin(3.14159 * d);
      float sy = min(abs(along - 0.25), abs(along - 0.75)) * SIZE.y;
      float staple = (1.0 - smoothstep(0.03, 0.036, sy)) * (1.0 - smoothstep(0.1, 0.16, abs(d - 0.5)));
      col = mix(col, vec3(0.7, 0.72, 0.75) + 0.2 * (1.0 - abs(d - 0.5) * 6.0), staple);
    } else {
      // Trimmed pages: fine lines through the thickness, evening out to a soft tone when finer than a pixel.
      float x = d * max(uDepth / 0.00045, 4.0);
      float w = max(fwidth(x), 0.0001);
      float line = 1.0 - smoothstep(0.0, w, 0.5 - abs(fract(x) - 0.5));
      float fade = 1.0 - smoothstep(0.3, 0.8, w);
      col = PAPER * (1.0 - 0.1 * line * fade - 0.035 * (1.0 - fade));
      col *= 0.985 + 0.015 * sin(x * 0.37 + along * 9.0);
      // The covers wrap the pages: a whiter band at the front and the back.
      float cover = clamp(0.0007 / uDepth, 0.06, 0.5);
      float aa = fwidth(d);
      col = mix(col, COVER, 1.0 - smoothstep(cover - aa, cover + aa, min(d, 1.0 - d)));
    }
    // The same soft key light as the covers, gentler so the edges read as paper rather than shadow.
    float lit = clamp(dot(normalize(vNormal), normalize(vec3(-0.35, 0.55, 0.76))), 0.0, 1.0);
    col *= mix(0.86, 1.0, smoothstep(0.0, 0.8, lit));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

class Spring {
  value = 0;
  velocity = 0;
  target = 0;
  constructor(
    public stiffness: number,
    public damping: number,
  ) {}
  step(dt: number) {
    const accel = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
  }
  snap(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
  get resting(): boolean {
    return Math.abs(this.target - this.value) < 0.0004 && Math.abs(this.velocity) < 0.002;
  }
}

interface FaceSlot {
  face: StageFace;
  /** What `texture` currently shows, so unchanged faces are not reloaded. */
  shown: string;
  texture: THREE.Texture | null;
  loading: string;
  on: Spring;
}

interface Item {
  key: string;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  front: FaceSlot;
  back: FaceSlot;
  /** Rotation about the vertical axis; rests at `turns` half-turns. */
  spin: Spring;
  turns: number;
  bendX: Spring;
  bendY: Spring;
  lag: Spring;
  twist: Spring;
  tiltYaw: Spring;
  tiltPitch: Spring;
  /** Reading: the leaf's angle at the spine and at its edge (radians, 0 right, π left). */
  spine: Spring;
  tip: Spring;
  /** On the shelf a comic is a closed book: the back cover sits behind its pages. */
  backMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** The page edges and spine between the covers, bending with them. */
  edges: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  depth: number;
  /** The sealed bag around it, if this device has never opened it. */
  bag: Bag | null;
  seal: Spring;
  sealReported: boolean;
}

interface Bag {
  group: THREE.Group;
  sleeve: THREE.ShaderMaterial;
  flapPivot: THREE.Group;
  tape: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

/** A clear poly sleeve: mostly invisible, catching light at grazing angles and along its crinkles. */
const SLEEVE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const SLEEVE_FRAGMENT = /* glsl */ `
  uniform float uFade;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vViewPos);
    float facing = abs(dot(n, v));
    float fres = pow(1.0 - facing, 2.0);
    float crinkle = 0.5 + 0.5 * sin(vUv.x * 9.0 + vUv.y * 14.0 + sin(vUv.y * 31.0 + vUv.x * 5.0) * 0.8);
    float sheen = smoothstep(0.86, 1.0, crinkle) * 0.32 + smoothstep(0.7, 1.0, sin(vUv.x * 2.2 - vUv.y * 1.4 + 0.6)) * 0.12;
    float edge = smoothstep(0.985, 1.0, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0) * 0.35;
    float a = (0.05 + fres * 0.3 + sheen + edge) * (1.0 - uFade);
    gl_FragColor = vec4(vec3(1.0), a);
  }
`;

interface Pointer {
  id: number;
  mode: "grab" | "pan" | "turn";
  /** Reading: the leaf being turned, and which way (1 onto the left, -1 back to the right). */
  leaf?: number;
  dir?: 1 | -1;
  hit: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  time: number;
  /** Where on the sheet's height it was grabbed, -0.5 (bottom) to 0.5 (top). */
  grabV: number;
  startSpin: number;
  startScroll: number;
  lastX: number;
  lastTime: number;
  speed: number;
}

/** The band of page edges round a sheet, split like the sheet so it bends as smoothly. */
function edgeGeometry(): THREE.BufferGeometry {
  const band = edgeBand(SHEET_W, SHEET_H, 28, 42);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(band.positions, 3));
  geometry.setAttribute("outward", new THREE.Float32BufferAttribute(band.outward, 2));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(band.uvs, 2));
  geometry.setAttribute("edgeSide", new THREE.Float32BufferAttribute(band.sides, 1));
  geometry.setIndex(band.indices);
  return geometry;
}

function faceSource(face: StageFace): string {
  return face.state === "ready" && face.src ? `img:${face.src}` : `paper:${paperKey(face)}`;
}

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  private row = new THREE.Group();
  private geometry = new THREE.PlaneGeometry(SHEET_W, SHEET_H, 28, 42);
  private edgeGeometry = edgeGeometry();
  private loader = new THREE.TextureLoader();
  private raycaster = new THREE.Raycaster();
  private blank: THREE.Texture;

  private items: Item[] = [];
  private index = 0;
  private turned = false;
  private scroll = new Spring(130, 23);
  private pointer: Pointer | null = null;
  private hover = { x: 0, y: 0, inside: false };
  private wheelTimer: ReturnType<typeof setTimeout> | null = null;
  private wheelFrom = 0;

  private frame = 0;
  private lastTime = 0;
  private clock = 0;
  private dirty = true;
  private disposed = false;
  private pxPerUnit = 1;
  private insets = { top: 72, bottom: 150 };
  /** Phone-sized stage: smaller texture budget, wider sheet. */
  private small = false;
  private reducedMotion = false;
  private observer: ResizeObserver;
  private lastFace = -1;
  /** Reading a comic: the leaves hang off one spine and turn like a bound book. */
  private book = false;
  private bookLayout: BookLayout = "spread";
  private turnedCount = 0;
  private face: 0 | 1 = 0;
  private camX = new Spring(110, 21);
  /** Marking up the current sheet: it turns to face the viewer, flat and still. */
  private editing = false;
  private flat = new Spring(120, 22);
  private lastFaceIndex = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: StageCallbacks,
    private fonts: PaperFonts,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.row);

    const data = new Uint8Array([246, 245, 241, 255]);
    this.blank = new THREE.DataTexture(data, 1, 1);
    this.blank.colorSpace = THREE.SRGBColorSpace;
    this.blank.needsUpdate = true;

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  // ---- public API -------------------------------------------------------

  /**
   * Replace the row. Sheets are matched by key, so a sheet that is already on
   * stage keeps its pose and its loaded art while its neighbours change.
   * `turned` makes sheets left of the current one rest face-down, like the
   * leaves of a book you have already read.
   */
  setSheets(sheets: StageSheet[], options: { turned: boolean; index: number; face: 0 | 1 }) {
    const previous = new Map(this.items.map((item) => [item.key, item]));
    const sameRow = sheets.some((sheet) => previous.has(sheet.key));
    const anchorKey = this.items[this.index]?.key;
    const anchorWas = this.index;
    this.turned = options.turned;
    const wasBook = this.book;
    this.book = options.turned;

    this.items = sheets.map((sheet) => {
      const kept = previous.get(sheet.key);
      if (kept) {
        previous.delete(sheet.key);
        kept.front.face = sheet.front;
        kept.back.face = sheet.back;
        kept.depth = 0.004 + (sheet.thickness ?? 0) * 0.02;
        // Opened elsewhere (or made here): out of the bag, unless it is sliding out right now.
        if (!sheet.sealed && kept.bag && kept.seal.target === 0) this.dropBag(kept);
        return kept;
      }
      return this.createItem(sheet);
    });
    for (const gone of previous.values()) this.destroyItem(gone);

    this.index = Math.min(Math.max(options.index, 0), Math.max(sheets.length - 1, 0));
    if (!sameRow) {
      // A different row entirely: cut to it rather than fly across.
      this.scroll.snap(this.index);
      this.items.forEach((item, i) => {
        item.turns = this.restTurns(i, options.face);
        item.spin.snap(item.turns * Math.PI);
      });
    } else {
      // The sheet being looked at may have moved along the row (a new comic
      // arrived, or the row changed around it): keep it where it is on screen.
      const anchorNow = this.items.findIndex((item) => item.key === anchorKey);
      if (anchorNow >= 0) this.scroll.value += anchorNow - anchorWas;
      const busy = this.pointer?.mode === "pan" || this.wheelTimer !== null;
      if (!busy) this.scroll.target = this.index;
      this.settleNeighbours(options.face);
    }
    if (this.book) {
      // Open on the leaf asked for, with everything before it already turned.
      const frame = bookFrame(this.items.length, { index: this.index, face: options.face }, this.bookLayout);
      this.face = options.face;
      this.turnedCount = frame.turned;
      if (!wasBook) {
        this.camX.snap(0.5);
        this.items.forEach((item, i) => {
          const rest = i < frame.turned ? Math.PI : 0;
          item.spin.snap(0);
          item.turns = 0;
          // The cover starts closed and swings open if the reader is past it.
          item.tip.snap(i === 0 ? 0 : rest);
          item.spine.snap(i === 0 ? 0 : rest);
        });
      }
      this.camX.target = frame.cameraX;
    } else if (wasBook) {
      this.items.forEach((item) => {
        item.tip.snap(0);
        item.spine.snap(0);
      });
    }
    if (wasBook !== this.book) this.resize();
    this.layout();
    this.syncTextures();
    this.dirty = true;
  }

  goTo(index: number, face?: 0 | 1) {
    if (!this.items.length) return;
    if (this.book) {
      const next = Math.min(Math.max(index, 0), this.items.length - 1);
      const f = face ?? this.face;
      const changed = next !== this.index || f !== this.face;
      this.index = next;
      this.face = f;
      const frame = bookFrame(this.items.length, { index: next, face: f }, this.bookLayout);
      this.turnedCount = frame.turned;
      this.camX.target = frame.cameraX;
      this.syncTextures();
      this.dirty = true;
      if (changed) this.callbacks.onIndex(next, f);
      return;
    }
    const next = Math.min(Math.max(index, 0), this.items.length - 1);
    const changed = next !== this.index;
    this.index = next;
    this.scroll.target = next;
    if (face !== undefined) this.setFace(face);
    this.settleNeighbours();
    this.syncTextures();
    this.dirty = true;
    if (changed) {
      const turns = this.items[next].turns;
      this.callbacks.onIndex(next, (((turns % 2) + 2) % 2) as 0 | 1);
    }
  }

  setFace(face: 0 | 1) {
    if (this.book) {
      this.goTo(this.index, face);
      return;
    }
    const item = this.items[this.index];
    if (!item) return;
    const current = ((item.turns % 2) + 2) % 2;
    if (current !== face) item.turns += face === 1 ? 1 : -1;
    item.spin.target = item.turns * Math.PI;
    this.dirty = true;
  }

  flip() {
    const item = this.items[this.index];
    if (!item) return;
    const current = ((item.turns % 2) + 2) % 2;
    this.setFace(current === 0 ? 1 : 0);
  }

  /** Redraw typeset faces, e.g. once web fonts have finished loading. */
  refreshPaper() {
    for (const item of this.items) {
      for (const slot of [item.front, item.back]) {
        if (slot.shown.startsWith("paper:")) slot.shown = "";
      }
    }
    this.syncTextures();
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    if (this.wheelTimer) clearTimeout(this.wheelTimer);
    this.observer.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    for (const item of this.items) this.destroyItem(item);
    this.items = [];
    this.geometry.dispose();
    this.edgeGeometry.dispose();
    this.blank.dispose();
    this.renderer.dispose();
  }

  // ---- sheets -----------------------------------------------------------

  private createItem(sheet: StageSheet): Item {
    const slot = (face: StageFace): FaceSlot => ({
      face,
      shown: "",
      texture: null,
      loading: "",
      on: new Spring(90, 19),
    });
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
      uniforms: {
        uFront: { value: this.blank },
        uBack: { value: this.blank },
        uFrontFit: { value: new THREE.Vector2(1, 1) },
        uBackFit: { value: new THREE.Vector2(1, 1) },
        uFrontOn: { value: 0 },
        uBackOn: { value: 0 },
        uFrontShimmer: { value: 0 },
        uBackShimmer: { value: 0 },
        uBend: { value: new THREE.Vector3() },
        uTwist: { value: 0 },
        uLeaf: { value: this.book ? 1 : 0 },
        uSpine: { value: 0 },
        uTip: { value: 0 },
        uLift: { value: 0 },
        uTime: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.rotation.order = "ZXY";
    // The shader moves vertices, so the default bounds would cull bent sheets early.
    mesh.frustumCulled = false;
    this.row.add(mesh);

    // The back cover is its own face behind the pages, sharing the cover's uniforms.
    const backMaterial = material.clone();
    backMaterial.uniforms = material.uniforms;
    backMaterial.side = THREE.BackSide;
    const backMesh = new THREE.Mesh(this.geometry, backMaterial);
    backMesh.frustumCulled = false;
    mesh.add(backMesh);
    const depth = 0.004 + (sheet.thickness ?? 0) * 0.02;
    // The edges share the cover's uniforms (its bend and its art, for the spine).
    const edges = new THREE.Mesh(
      this.edgeGeometry,
      new THREE.ShaderMaterial({
        vertexShader: EDGE_VERTEX,
        fragmentShader: EDGE_FRAGMENT,
        side: THREE.DoubleSide,
        uniforms: { ...material.uniforms, uDepth: { value: depth } },
      }),
    );
    edges.frustumCulled = false;
    mesh.add(edges);

    const soft = this.reducedMotion;
    return {
      key: sheet.key,
      mesh,
      front: slot(sheet.front),
      back: slot(sheet.back),
      spin: new Spring(soft ? 160 : 74, soft ? 26 : 11.5),
      turns: 0,
      bendX: new Spring(110, soft ? 21 : 8),
      bendY: new Spring(110, soft ? 21 : 9),
      lag: new Spring(140, soft ? 24 : 11),
      twist: new Spring(120, soft ? 22 : 9),
      tiltYaw: new Spring(60, 15),
      tiltPitch: new Spring(60, 15),
      // The edge leads and the spine follows, so a turning page curls.
      tip: new Spring(soft ? 160 : 95, soft ? 26 : 15),
      spine: new Spring(soft ? 160 : 52, soft ? 26 : 11),
      backMesh,
      edges,
      depth,
      bag: sheet.sealed ? this.makeBag(mesh, depth) : null,
      seal: new Spring(soft ? 200 : 26, soft ? 30 : 9),
      sealReported: false,
    };
  }

  private makeBag(mesh: THREE.Mesh, depth: number): Bag {
    const group = new THREE.Group();
    const sleeve = new THREE.ShaderMaterial({
      vertexShader: SLEEVE_VERTEX,
      fragmentShader: SLEEVE_FRAGMENT,
      uniforms: { uFade: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const w = SHEET_W * 1.07;
    const h = SHEET_H * 1.06;
    const face = new THREE.PlaneGeometry(w, h);
    const front = new THREE.Mesh(face, sleeve);
    front.position.set(0, 0.02, 0.006);
    const back = new THREE.Mesh(face, sleeve);
    back.position.set(0, 0.02, -depth - 0.006);
    // The flap folds over the top of the front, hinged at the bag's top edge, taped down.
    const flapPivot = new THREE.Group();
    flapPivot.position.set(0, 0.02 + h / 2, 0.007);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.16), sleeve);
    flap.position.y = -0.08;
    flapPivot.add(flap);
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(SHEET_W * 0.34, 0.075),
      new THREE.MeshBasicMaterial({ color: 0xf3e7b0, transparent: true, opacity: 0.78, depthWrite: false }),
    );
    tape.position.set(0, 0.02 + h / 2 - 0.15, 0.009);
    tape.rotation.z = -0.03;
    group.add(front, back, flapPivot, tape);
    for (const child of [front, back, flap, tape]) child.renderOrder = 2;
    mesh.add(group);
    return { group, sleeve, flapPivot, tape };
  }

  /** Tear the tape, lift the flap, slide the comic out of its bag. */
  breakSeal(key: string) {
    const item = this.items.find((it) => it.key === key);
    if (!item?.bag) {
      if (item) this.callbacks.onSealBroken?.(key);
      return;
    }
    item.seal.target = 1;
    if (this.reducedMotion) item.seal.snap(1);
    this.dirty = true;
  }

  /** Is this comic still in its bag? */
  isSealed(key: string): boolean {
    return !!this.items.find((it) => it.key === key)?.bag;
  }

  private stepSeal(item: Item, dt: number): boolean {
    const bag = item.bag;
    if (!bag) return false;
    item.seal.step(dt);
    const p = sealPose(Math.min(Math.max(item.seal.value, 0), 1));
    bag.tape.material.opacity = 0.78 * (1 - p.tape);
    bag.tape.position.x = p.tape * 0.28;
    bag.tape.rotation.z = -0.03 - p.tape * 0.5;
    bag.flapPivot.rotation.x = -p.flap * 2.4;
    // The comic stays put while the bag slips away below it.
    bag.group.position.y = -p.slide * (SHEET_H * 1.25);
    bag.sleeve.uniforms.uFade.value = p.bagFade;
    if (item.seal.value > 0.985 && !item.sealReported) {
      item.sealReported = true;
      this.dropBag(item);
      this.callbacks.onSealBroken?.(item.key);
      return true;
    }
    return !item.seal.resting;
  }

  private dropBag(item: Item) {
    const bag = item.bag;
    if (!bag) return;
    item.mesh.remove(bag.group);
    bag.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && mat !== bag.sleeve) mat.dispose();
    });
    bag.sleeve.dispose();
    item.bag = null;
  }

  private destroyItem(item: Item) {
    this.dropBag(item);
    item.backMesh.material.dispose();
    item.edges.material.dispose();
    this.row.remove(item.mesh);
    item.front.texture?.dispose();
    item.back.texture?.dispose();
    item.mesh.material.dispose();
  }

  private restTurns(i: number, currentFace: 0 | 1 = 0): number {
    if (i === this.index) return currentFace;
    return this.turned && i < this.index ? 1 : 0;
  }

  /** Bring every sheet except the current one back to its resting side. */
  private settleNeighbours(currentFace?: 0 | 1) {
    this.items.forEach((item, i) => {
      if (i === this.index) {
        if (currentFace !== undefined) {
          const now = ((item.turns % 2) + 2) % 2;
          if (now !== currentFace) item.turns += currentFace === 1 ? 1 : -1;
        }
      } else {
        const want = this.restTurns(i);
        const now = ((item.turns % 2) + 2) % 2;
        if (now !== want) item.turns += want === 1 ? 1 : -1;
      }
      item.spin.target = item.turns * Math.PI;
    });
  }

  private layout() {
    this.items.forEach((item, i) => {
      // Reading, every leaf hangs off the same spine.
      item.mesh.position.x = this.book ? 0 : i * SPACING;
      item.mesh.material.uniforms.uLeaf.value = this.book ? 1 : 0;
      // Reading, leaves are single sheets; on the shelf each comic is a closed book.
      const side = this.book ? THREE.DoubleSide : THREE.FrontSide;
      if (item.mesh.material.side !== side) {
        item.mesh.material.side = side;
        item.mesh.material.needsUpdate = true;
      }
      item.backMesh.visible = !this.book;
      item.edges.visible = !this.book;
      item.backMesh.position.z = -item.depth;
      if (item.bag) item.bag.group.visible = !this.book;
    });
  }

  // ---- textures ---------------------------------------------------------

  private syncTextures() {
    const centre = Math.round(this.scroll.target);
    const load = this.small ? LOAD_RADIUS_SMALL : LOAD_RADIUS;
    const keep = this.small ? KEEP_RADIUS_SMALL : KEEP_RADIUS;
    this.items.forEach((item, i) => {
      // Reading, the open spread is "here": the leaf on the right and the one on the left.
      const distance = this.book
        ? i >= this.turnedCount
          ? i - this.turnedCount
          : this.turnedCount - 1 - i
        : Math.abs(i - centre);
      // Only the current sheet can be turned over, so its neighbours only
      // need the side they are resting on.
      const resting = (this.book ? i < this.turnedCount : this.restTurns(i) === 1) ? item.back : item.front;
      for (const slot of [item.front, item.back]) {
        const want = faceSource(slot.face);
        const needed = distance === 0 || (distance <= load && slot === resting);
        if (needed) {
          if (slot.shown !== want && slot.loading !== want) this.load(item, slot, want);
        } else if (slot.texture && (distance > keep || (distance > 0 && slot !== resting && this.small))) {
          slot.texture.dispose();
          slot.texture = null;
          slot.shown = "";
          slot.loading = "";
          slot.on.snap(0);
          this.bind(item);
        }
      }
    });
  }

  private load(item: Item, slot: FaceSlot, want: string) {
    slot.loading = want;
    // A face that now holds a different page goes back to bare paper while
    // the new art loads. A redraw of the same page keeps the old art up
    // until its replacement is ready.
    const subject = (source: string) => source.split("?")[0];
    if (slot.shown && subject(slot.shown) !== subject(want)) slot.on.snap(0);
    const accept = (texture: THREE.Texture) => {
      // Ignore results for a face that has changed or left the stage since.
      if (this.disposed || slot.loading !== want || !this.items.includes(item)) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      slot.texture?.dispose();
      slot.texture = texture;
      slot.shown = want;
      slot.loading = "";
      // Fade new art in; swap paper for paper without a flash.
      if (slot.on.value < 0.01) slot.on.target = 1;
      else slot.on.snap(1);
      this.bind(item);
      this.dirty = true;
    };

    if (want.startsWith("img:")) {
      this.loader.load(want.slice(4), accept, undefined, () => {
        if (slot.loading === want) slot.loading = "";
      });
    } else {
      accept(new THREE.CanvasTexture(drawPaper(slot.face, this.fonts)));
    }
  }

  private bind(item: Item) {
    const u = item.mesh.material.uniforms;
    const innerAspect = (SHEET_W - 0.044) / (SHEET_H - 0.044);
    const apply = (slot: FaceSlot, map: string, fit: string) => {
      u[map].value = slot.texture ?? this.blank;
      const image = slot.texture?.image as { width?: number; height?: number } | undefined;
      const aspect = image?.width && image?.height ? image.width / image.height : innerAspect;
      // Fill the face and crop the overflow, like object-fit: cover.
      const v = u[fit].value as THREE.Vector2;
      if (aspect > innerAspect) v.set(innerAspect / aspect, 1);
      else v.set(1, aspect / innerAspect);
    };
    apply(item.front, "uFront", "uFrontFit");
    apply(item.back, "uBack", "uBackFit");
  }

  // ---- sizing -----------------------------------------------------------

  /**
   * Space taken by the page chrome (header above, captions and controls
   * below), in CSS pixels. The sheet is fitted into what is left.
   */
  setInsets(top: number, bottom: number) {
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.resize();
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.small = Math.min(width, height) < 640;

    // Fit the sheet into the band between header and footer, with a little
    // air, and never wider than most of the screen.
    const band = Math.max(height - this.insets.top - this.insets.bottom, height * 0.45);
    const byHeight = (band * 0.94) / SHEET_H;
    this.bookLayout = bookLayoutFor(width, height);
    const across = this.book && this.bookLayout === "spread" ? 2 * SHEET_W : SHEET_W;
    const byWidth = (width * (this.book ? (this.bookLayout === "spread" ? 0.86 : 0.9) : this.small ? 0.8 : 0.62)) / across;
    this.pxPerUnit = Math.min(byHeight, byWidth);

    const worldH = height / this.pxPerUnit;
    const centreY = (this.insets.top - this.insets.bottom) / 2 / this.pxPerUnit;
    this.camera.aspect = width / height;
    this.camera.position.set(0, centreY, worldH / (2 * Math.tan((FOV * Math.PI) / 360)));
    this.camera.lookAt(0, centreY, 0);
    this.camera.updateProjectionMatrix();
    // A phone turned mid-read: frame the same pages for the new layout.
    if (this.book && this.items.length) {
      const frame = bookFrame(this.items.length, { index: this.index, face: this.face }, this.bookLayout);
      this.turnedCount = frame.turned;
      this.camX.target = frame.cameraX;
    }
    this.dirty = true;
  }

  /** A tap on the comic, offered to the visitor's hero power first; true means it was handled. */
  private tapHandler: ((tap: { dir: 1 | -1 }) => boolean) | null = null;
  setTapHandler(handler: ((tap: { dir: 1 | -1 }) => boolean) | null) {
    this.tapHandler = handler;
  }

  /** In a spread, which of the two open pages the reader is working on (for marking up). */
  private focusSide: 0 | 1 = 1;
  setFocusSide(side: 0 | 1) {
    this.focusSide = side;
  }

  // ---- input ------------------------------------------------------------

  private hitTest(event: PointerEvent): { index: number; v: number } {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.items.map((item) => item.mesh),
      false,
    );
    if (!hits.length) return { index: -1, v: 0 };
    const index = this.items.findIndex((item) => item.mesh === hits[0].object);
    return { index, v: (hits[0].uv?.y ?? 0.5) - 0.5 };
  }

  /** Which view the stage is showing: the shelf row, or one spread of the open book. */
  viewKey(): string {
    return this.book ? `spread:${this.turnedCount}` : "shelf";
  }

  /** A screen point as a place on the stage (row space), for showing live heroes on every screen alike. */
  unproject(clientX: number, clientY: number): { view: string; x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) return null;
    return { view: this.viewKey(), x: hit.x - this.row.position.x, y: hit.y };
  }

  /** Where a stage place is on this screen, or null when it is not in the current view. */
  project(view: string, x: number, y: number): { x: number; y: number } | null {
    if (view !== this.viewKey()) return null;
    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(x + this.row.position.x, y, 0).project(this.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  /** Lay the current sheet flat and square to the screen (or let it go again). */
  setEditing(on: boolean) {
    this.editing = on;
    this.flat.target = on ? 1 : 0;
    if (this.reducedMotion) this.flat.snap(this.flat.target);
    this.pointer = null;
    this.hover.inside = false;
    this.dirty = true;
  }

  /** Where the current sheet is on screen, in client pixels: for drawing marks over it. */
  sheetRect(): { left: number; top: number; width: number; height: number } | null {
    const item = this.items[this.index];
    if (!item) return null;
    item.mesh.updateMatrixWorld();
    const box = this.canvas.getBoundingClientRect();
    const xs: number[] = [];
    const ys: number[] = [];
    // Reading, the page in view lies right of the spine (front) or left of it (back).
    const right = this.bookLayout === "spread" ? this.focusSide === 1 && this.turnedCount < this.items.length : this.face === 0;
    const [x0, x1] = this.book ? (right ? [0, SHEET_W] : [-SHEET_W, 0]) : [-SHEET_W / 2, SHEET_W / 2];
    for (const [x, y] of [[x0, -SHEET_H / 2], [x1, -SHEET_H / 2], [x1, SHEET_H / 2], [x0, SHEET_H / 2]]) {
      const v = new THREE.Vector3(x, y, 0).applyMatrix4(item.mesh.matrixWorld).project(this.camera);
      xs.push(box.left + ((v.x + 1) / 2) * box.width);
      ys.push(box.top + ((1 - v.y) / 2) * box.height);
    }
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.editing) return;
    if (event.button !== 0 || this.pointer) return;
    if (this.book) {
      const x = this.bookX(event) ?? 0;
      const dir: 1 | -1 = x >= 0 ? 1 : -1;
      const leaf = dir === 1 ? this.turnedCount : this.turnedCount - 1;
      const can = leaf >= 0 && leaf < this.items.length;
      const rect = this.canvas.getBoundingClientRect();
      const now = performance.now();
      this.pointer = {
        id: event.pointerId,
        mode: can ? "turn" : "pan",
        leaf: can ? leaf : undefined,
        dir,
        hit: -1,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        time: now,
        grabV: 0.5 - (event.clientY - rect.top) / rect.height,
        startSpin: 0,
        startScroll: 0,
        lastX: event.clientX,
        lastTime: now,
        speed: 0,
      };
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone (a very quick tap); nothing to hold.
      }
      this.dirty = true;
      return;
    }
    const hit = this.hitTest(event);
    const item = this.items[this.index];
    const grab = hit.index === this.index && !!item;
    this.pointer = {
      id: event.pointerId,
      mode: grab ? "grab" : "pan",
      hit: hit.index,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      grabV: hit.v,
      startSpin: item ? item.spin.value : 0,
      startScroll: this.scroll.value,
      lastX: event.clientX,
      lastTime: performance.now(),
      speed: 0,
    };
    try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone (a very quick tap); nothing to hold.
      }
    this.canvas.style.cursor = grab ? "grabbing" : "ew-resize";
    this.dirty = true;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.editing) return;
    // The sheet leans toward a mouse; a finger only ever drags it.
    if (event.pointerType === "mouse") {
      const rect = this.canvas.getBoundingClientRect();
      this.hover.x = (event.clientX - rect.left) / rect.width - 0.5;
      this.hover.y = (event.clientY - rect.top) / rect.height - 0.5;
      this.hover.inside = true;
      this.dirty = true;
    }

    const p = this.pointer;
    if (!p || p.id !== event.pointerId) {
      this.canvas.style.cursor = this.hitTest(event).index === this.index ? "grab" : "default";
      return;
    }
    const now = performance.now();
    const dt = Math.max(now - p.lastTime, 1);
    p.speed = p.speed * 0.6 + ((event.clientX - p.lastX) / dt) * 0.4;
    p.lastX = event.clientX;
    p.lastTime = now;
    p.x = event.clientX;
    p.y = event.clientY;

    if (p.mode === "turn" && p.leaf !== undefined) {
      const item = this.items[p.leaf];
      const x = this.bookX(event);
      if (item && x !== null) {
        // The edge follows the finger; the spine side follows the edge.
        const tip = tipAngleFor(x);
        item.tip.target = tip;
        item.spine.target = p.dir === 1 ? tip * 0.55 : Math.PI - (Math.PI - tip) * 0.55;
      }
      return;
    }
    if (this.book) return;

    if (p.mode === "pan") {
      const max = Math.max(this.items.length - 1, 0);
      const raw = p.startScroll - (p.x - p.startX) / (SPACING * this.pxPerUnit);
      this.scroll.target = Math.min(Math.max(raw, -0.3), max + 0.3);
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    const p = this.pointer;
    if (!p || p.id !== event.pointerId) return;
    this.pointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.style.cursor = "default";
    this.dirty = true;

    const moved = Math.hypot(p.x - p.startX, p.y - p.startY);
    const tap = moved < 6 && performance.now() - p.time < 450;
    const item = this.items[this.index];

    if (this.book) {
      const rect = this.canvas.getBoundingClientRect();
      if (tap) {
        const dir = p.x - rect.left > rect.width / 2 ? 1 : -1;
        if (this.tapHandler?.({ dir })) return;
        this.bookStep(dir);
        return;
      }
      const leaf = p.leaf !== undefined ? this.items[p.leaf] : undefined;
      if (p.mode === "turn" && leaf && p.dir) {
        const projected = leaf.tip.value + leaf.tip.velocity * 0.12;
        const done = p.dir === 1 ? projected > Math.PI / 2 : projected < Math.PI / 2;
        if (done) {
          this.bookTurned(p.dir);
          return;
        }
      }
      // A swipe that did not turn a leaf moves the view (one page at a time on a phone).
      const swipe = p.x - p.startX;
      if (Math.abs(swipe) > 40) this.bookStep(swipe < 0 ? 1 : -1);
      return;
    }

    if (tap) {
      if (p.mode === "pan") this.scroll.target = this.index;
      const box = this.canvas.getBoundingClientRect();
      if (p.hit === this.index && this.tapHandler?.({ dir: p.x - box.left > box.width / 2 ? 1 : -1 })) return;
      // A tap on a sealed comic opens its bag; otherwise it flips it over.
      if (p.hit === this.index && item?.bag) this.breakSeal(item.key);
      else if (p.hit === this.index) this.flip();
      else if (p.hit >= 0) this.goTo(p.hit);
      return;
    }

    if (p.mode === "grab" && item) {
      // Let go: fall to whichever side the sheet is heading for.
      const projected = item.spin.value + item.spin.velocity * 0.16;
      item.turns = Math.round(projected / Math.PI);
      item.spin.target = item.turns * Math.PI;
      return;
    }

    const flick = (-p.speed * 1000) / (SPACING * this.pxPerUnit);
    this.goTo(Math.round(this.scroll.target + flick * 0.18));
  };

  private onPointerLeave = () => {
    this.hover.inside = false;
    this.dirty = true;
  };

  private onWheel = (event: WheelEvent) => {
    if (this.editing) return;
    if (event.ctrlKey || !this.items.length) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 600 : 1;
    const delta =
      (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;

    if (!this.wheelTimer) this.wheelFrom = this.scroll.target;
    const max = this.items.length - 1;
    const raw = this.scroll.target + delta / (SPACING * this.pxPerUnit);
    this.scroll.target = Math.min(Math.max(raw, -0.3), max + 0.3);
    this.dirty = true;

    if (this.wheelTimer) clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => {
      this.wheelTimer = null;
      // A single notch of a mouse wheel is far less than one sheet, so any
      // deliberate scroll moves at least one sheet in its direction.
      const travel = this.scroll.target - this.wheelFrom;
      let next = Math.round(this.scroll.target);
      if (next === this.index && Math.abs(travel) > 0.08) next = this.index + Math.sign(travel);
      this.goTo(next);
      this.scroll.target = this.index;
    }, 130);
  };

  // ---- frame ------------------------------------------------------------

  private tick = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    // Catch up after a slow frame (a throttled tab, a busy machine) in small
    // steps, so motion keeps real time and the stiff springs stay stable.
    const elapsed = Math.min((time - this.lastTime) / 1000 || 0.016, 0.25);
    this.lastTime = time;
    this.clock += elapsed;

    let moving = this.dirty || this.pointer !== null;
    this.dirty = false;

    const steps = Math.max(1, Math.ceil(elapsed * 120));
    for (let step = 0; step < steps; step += 1) {
      if (this.step(elapsed / steps)) moving = true;
    }
    if (!moving) return;

    const centre = Math.round(this.scroll.value);
    if (centre !== this.loadedCentre) {
      this.loadedCentre = centre;
      this.syncTextures();
    }

    this.row.position.x = this.book ? -this.camX.value : -this.scroll.value * SPACING;
    this.renderer.render(this.scene, this.camera);
    this.reportFace();
  };
  private loadedCentre = -1;

  private step(dt: number): boolean {
    let moving = false;
    this.flat.step(dt);
    if (!this.flat.resting) moving = true;
    const flat = Math.min(Math.max(this.flat.value, 0), 1);
    this.scroll.step(dt);
    if (!this.scroll.resting) moving = true;
    const drift = Math.max(Math.min(this.scroll.velocity * 0.05, 0.5), -0.5);
    const p = this.pointer;

    if (this.book) {
      this.camX.step(dt);
      if (!this.camX.resting) moving = true;
    }

    this.items.forEach((item, i) => {
      if (this.book) {
        if (this.stepLeaf(item, i, dt, flat)) moving = true;
        return;
      }
      const current = i === this.index;
      const held = current && p?.mode === "grab";

      if (held && p) {
        // Drag one sheet-width to turn it most of the way over.
        const gain = Math.PI / (SHEET_W * this.pxPerUnit * 1.25);
        item.spin.target = p.startSpin - (p.x - p.startX) * -gain;
        item.spin.stiffness = 260;
        item.spin.damping = 27;
      } else {
        item.spin.stiffness = this.reducedMotion ? 160 : 74;
        item.spin.damping = this.reducedMotion ? 26 : 11.5;
      }
      item.spin.step(dt);
      if (this.stepSeal(item, dt)) moving = true;

      const speed = item.spin.velocity;
      const pull = held && p ? Math.min(Math.abs(p.x - p.startX) / 420, 0.55) : 0;
      // Holding a sheet bows it; spinning it leaves the edges trailing.
      item.bendX.target = held ? -(0.32 + pull) : -Math.min(Math.abs(speed) * 0.035, 0.5);
      item.bendY.target = held && p ? Math.max(Math.min((p.y - p.startY) * 0.0032, 0.6), -0.6) : 0;
      item.lag.target = Math.max(Math.min(speed * 0.028 + drift * 0.5, 0.42), -0.42);
      item.twist.target =
        held && p ? Math.max(Math.min(p.grabV * speed * 0.16, 0.45), -0.45) : 0;

      // A fat book bends less than a single.
      const stiff = item.depth > 0.008 ? 0.55 : 0.8;
      item.bendX.target *= stiff;
      item.bendY.target *= stiff;

      const follow = current && this.hover.inside && !held;
      item.tiltYaw.target = follow ? this.hover.x * 0.22 : 0;
      item.tiltPitch.target = follow ? this.hover.y * 0.12 : 0;

      // While marking up, the current sheet eases square to the screen and goes still.
      const loose = current ? 1 - flat : 1;
      if (current && flat > 0) {
        for (const spring of [item.bendX, item.bendY, item.lag, item.twist, item.tiltYaw, item.tiltPitch]) spring.target *= loose;
      }

      const springs = [
        item.bendX,
        item.bendY,
        item.lag,
        item.twist,
        item.tiltYaw,
        item.tiltPitch,
        item.front.on,
        item.back.on,
      ];
      for (const spring of springs) spring.step(dt);
      if (!item.spin.resting || springs.some((s) => !s.resting)) moving = true;

      const u = item.mesh.material.uniforms;
      (u.uBend.value as THREE.Vector3).set(item.bendX.value, item.bendY.value, item.lag.value);
      u.uTwist.value = item.twist.value;
      u.uFrontOn.value = Math.min(Math.max(item.front.on.value, 0), 1);
      u.uBackOn.value = Math.min(Math.max(item.back.on.value, 0), 1);
      const frontPending = item.front.face.state === "pending" ? 1 : 0;
      const backPending = item.back.face.state === "pending" ? 1 : 0;
      u.uFrontShimmer.value = frontPending;
      u.uBackShimmer.value = backPending;
      u.uTime.value = this.clock;
      // Pages still being drawn keep shimmering, so keep rendering near them.
      if ((frontPending || backPending) && Math.abs(i - this.index) <= 2) moving = true;

      item.mesh.rotation.set(
        (REST.pitch + item.tiltPitch.value) * loose,
        item.spin.value + (REST.yaw + item.tiltYaw.value + drift * 0.35) * loose,
        REST.roll * loose,
      );
    });
    return moving;
  }

  /** One leaf of the open book: settle or follow the finger, then lie in its stack. */
  private stepLeaf(item: Item, i: number, dt: number, flat: number): boolean {
    const n = this.items.length;
    const p = this.pointer;
    const dragging = p?.mode === "turn" && p.leaf === i;
    if (!dragging) {
      const rest = i < this.turnedCount ? Math.PI : 0;
      item.tip.target = rest;
      item.spine.target = rest;
    }
    item.twist.target = dragging && p ? p.grabV * 0.9 : 0;
    for (const spring of [item.tip, item.spine, item.twist, item.front.on, item.back.on]) spring.step(dt);

    const tip = Math.min(Math.max(item.tip.value, 0), Math.PI);
    const spine = Math.min(Math.max(item.spine.value, 0), Math.PI);
    const turning = dragging || !item.tip.resting || !item.spine.resting;
    const GAP = 0.0035;
    const onLeft = (tip + spine) / 2 > Math.PI / 2;
    // Leaves in motion ride just above both stacks; resting ones lie in theirs.
    const lift = turning ? (n + 1) * GAP : onLeft ? i * GAP : (n - 1 - i) * GAP;

    const u = item.mesh.material.uniforms;
    u.uLeaf.value = 1;
    u.uSpine.value = spine;
    u.uTip.value = tip;
    u.uLift.value = lift;
    u.uTwist.value = item.twist.value;
    (u.uBend.value as THREE.Vector3).set(0, 0, 0);
    u.uFrontOn.value = Math.min(Math.max(item.front.on.value, 0), 1);
    u.uBackOn.value = Math.min(Math.max(item.back.on.value, 0), 1);
    const frontPending = item.front.face.state === "pending" ? 1 : 0;
    const backPending = item.back.face.state === "pending" ? 1 : 0;
    u.uFrontShimmer.value = frontPending;
    u.uBackShimmer.value = backPending;
    u.uTime.value = this.clock;
    // The whole book leans a little, the same for every leaf so the spine stays straight.
    const loose = 1 - flat;
    item.mesh.rotation.set(REST.pitch * 0.6 * loose, REST.yaw * 0.3 * loose, 0);
    const near = i >= this.turnedCount - 2 && i <= this.turnedCount + 1;
    return turning || !item.front.on.resting || !item.back.on.resting || (!!(frontPending || backPending) && near);
  }

  /** Where the pointer is across the book, in sheet widths from the spine. */
  private bookX(event: PointerEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) return null;
    return (hit.x - this.row.position.x) / SHEET_W;
  }

  private bookStep(dir: 1 | -1) {
    const next = stepBook(this.items.length, { index: this.index, face: this.face }, dir, this.bookLayout);
    if (next) this.goTo(next.index, next.face);
  }

  /** A leaf was turned all the way by hand: land on the view that shows it. */
  private bookTurned(dir: 1 | -1) {
    if (dir === 1) {
      this.goTo(this.turnedCount, 1);
      return;
    }
    const turned = this.turnedCount - 1;
    if (this.bookLayout === "single") this.goTo(turned, 0);
    else if (turned <= 0) this.goTo(0, 0);
    else this.goTo(turned - 1, 1);
  }

  private reportFace() {
    if (this.book) return;
    const item = this.items[this.index];
    if (!item) return;
    const face = (((item.turns % 2) + 2) % 2) as 0 | 1;
    if (face !== this.lastFace || this.index !== this.lastFaceIndex) {
      this.lastFace = face;
      this.lastFaceIndex = this.index;
      this.callbacks.onFace(this.index, face);
    }
  }
}
