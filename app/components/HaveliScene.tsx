"use client";
/* cspell:ignore cutscene WASD اندر نہیں Haveli DARWAZA KAMRA TEHKHANA Qafas gameover Tasbeeh Aabis Djinn Djinn-E-Qafas */

import { useRef, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface GameEvent {
  type: "item_found" | "zone_entered" | "caught" | "near_item" | "ritual_complete" | "hiding_changed" | "tasbeeh_recited" | "fear_pulsed" | "mini_event" | "light_failure" | "cinematic_jumpscare";
  payload?: {
    zone?: number;
    item?: string;
    intensity?: number;
    stage?: number;
    hiding?: boolean;
    itemsFound?: number;
    message?: string;
    eventId?: string;
  };
}

interface Props {
  zoneRef: React.MutableRefObject<number>;
  sanityRef: React.MutableRefObject<number>;
  onEvent: (e: GameEvent) => void;
  onLockChange: (locked: boolean) => void;
  isCursed?: boolean;
  difficulty?: "easy" | "medium" | "hard" | "impossible";
}

// ── Layout ────────────────────────────────────────────────────────────────────
// Rooms along -Z axis, corridors between them
const SECTIONS = [
  // type, zCenter, width, height, depth, key, wallColor, floorColor, yPos
  { type: "room", z: 0, w: 12, h: 6.5, d: 30, key: "darwaza", wC: 0xffddaa, fC: 0xddbb88, y: 0 },
  { type: "room", z: 5, w: 8, h: 6.0, d: 18, key: "kamra", wC: 0xccaa80, fC: 0xaa8866, y: 6.8 }, // BALA KHANA (Reverted to 18m)
  { type: "corr", z: -22, w: 6, h: 6.5, d: 14, key: "darwaza", wC: 0xeecca0, fC: 0xccaa80, y: 0 },
  { type: "room", z: -42, w: 14, h: 6.5, d: 28, key: "kamra", wC: 0xdddcbb, fC: 0xbbbb88, y: 0 },
  { type: "corr", z: -63, w: 6, h: 6.5, d: 14, key: "kamra", wC: 0xccccaa, fC: 0xaabb88, y: 0 },
  { type: "room", z: -84, w: 12, h: 5.5, d: 34, key: "tehkhana", wC: 0xddaadd, fC: 0x998899, y: 0 },
  { type: "room", z: -112, w: 8, h: 5.0, d: 22, key: "tehkhana", wC: 0xcc88cc, fC: 0x887788, y: 0 },
];

// Player total Z bounds
const Z_MIN = -112 - 11 + 1; // back of last room
const Z_MAX = 0 + 15 - 1; // front of first room

// ── Items ─────────────────────────────────────────────────────────────────────
const ITEM_DEFS = [
  { pos: new THREE.Vector3(4, -3.0 + 0.3, -8), type: "matchbox", label: "MATCHBOX", zone: 1 },
  { pos: new THREE.Vector3(-5, -3.5 + 0.3, -38), type: "torn_tasbeeh", label: "TORN TASBEEH", zone: 2 },
  { pos: new THREE.Vector3(5, -3.5 + 0.3, -54), type: "old_key", label: "OLD KEY", zone: 2 },
  { pos: new THREE.Vector3(-4, -2.75 + 0.3, -90), type: "diya", label: "DIYA", zone: 3 },
  { pos: new THREE.Vector3(2.0, 3.8 + 0.3, 5), type: "ink_pot", label: "INK POT", zone: 1 },
  { pos: new THREE.Vector3(-2.3, 0.85, -84), type: "silver_amulet", label: "SILVER AMULET", zone: 3 },
];

// ── Furniture ─────────────────────────────────────────────────────────────────
// Each: position, size (halfextents), can hide behind it
const FURNITURE = [
  { pos: new THREE.Vector3(-4.5, -3.5 + 0.35, -5), sz: new THREE.Vector3(1.5, 0.35, 0.6), color: 0x553322, hide: true }, // charpai R1
  { pos: new THREE.Vector3(4.5, -3.5 + 0.8, -14), sz: new THREE.Vector3(0.3, 0.8, 0.3), color: 0x332211, hide: false }, // column R1
  { pos: new THREE.Vector3(-5, -3.5 + 0.5, -35), sz: new THREE.Vector3(2.0, 0.5, 0.8), color: 0x664433, hide: true }, // sofa R2
  { pos: new THREE.Vector3(5, -3.5 + 0.5, -44), sz: new THREE.Vector3(0.6, 0.5, 1.2), color: 0x443322, hide: false }, // cabinet R2
  { pos: new THREE.Vector3(-3, -3.5 + 0.4, -50), sz: new THREE.Vector3(1.2, 0.4, 0.7), color: 0x553322, hide: true }, // table R2
  { pos: new THREE.Vector3(3.5, -2.75 + 0.4, -80), sz: new THREE.Vector3(1.0, 0.4, 0.8), color: 0x332244, hide: true }, // crate R3
  { pos: new THREE.Vector3(-4, -2.75 + 0.6, -96), sz: new THREE.Vector3(0.5, 0.6, 0.5), color: 0x221133, hide: false }, // barrel R3
  // Upper Room Furniture
  { pos: new THREE.Vector3(0, 1.8 + 0.45, 12), sz: new THREE.Vector3(0.8, 0.45, 0.8), color: 0x4a3a2a, hide: true }, // trunk U1
  { pos: new THREE.Vector3(-3.2, 1.8 + 0.5, 2), sz: new THREE.Vector3(0.3, 0.5, 0.3), color: 0x3d2f23, hide: false }, // chair U1
];

const STAIRCASES = [
  // Main staircase in Darwaza room leading to Bala Khana
  // Rise: (6.8 - 3.0) - (-3.25) = 3.8 + 3.25 = 7.05 total rise.
  // 24 steps * 0.295 = 7.08m rise.
  { base: new THREE.Vector3(-4.2, -3.25, 10), steps: 24, dir: -1 as const, rise: 0.295, run: 0.45 },
];

const UPPER_STAIR_HOLE = { minX: -5.75, maxX: -2.7, minZ: 3.3, maxZ: 9.8 };

export default function HaveliScene({ zoneRef, sanityRef, onEvent, onLockChange, isCursed = false, difficulty = "medium" }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const difficultyMultiplier = difficulty === "easy" ? 0.75 : difficulty === "medium" ? 1 : difficulty === "hard" ? 1.65 : 2.8;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const VW = mount.clientWidth, VH = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(VW, VH);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x010100);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040200, 0.035);

    const camera = new THREE.PerspectiveCamera(72, VW / VH, 0.1, 140);
    camera.rotation.order = "YXZ"; // Prevents axis inversion when swaying
    camera.position.set(0, -7 / 2 + 1.7, Z_MAX - 1);

    const loader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();
    const loadTex = (p: string) => { const t = loader.load(p); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

    const texCache: Record<string, THREE.Texture> = {};
    const getTex = (key: string, suffix: string) => {
      const k = `${key}_${suffix}`;
      if (!texCache[k]) texCache[k] = loadTex(`/zones/${key}_${suffix}.png`);
      return texCache[k];
    };

    // ── Build walls ──────────────────────────────────────────────────────────
    const mkMat = (tex: THREE.Texture, color: number) =>
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.28, color, roughness: 0.9, metalness: 0.06 });
    const addWall = (w: number, h: number, px: number, py: number, pz: number, rx: number, ry: number, mat: THREE.Material) => {
      const geometry = new THREE.PlaneGeometry(w, h);
      // PERFORMANCE-STABLE TILING: Scale UVs of the geometry
      const uvAttr = geometry.attributes.uv;
      const t = 4.0; // Tile every 4 meters
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * (w / t), uvAttr.getY(i) * (h / t));
      }
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(px, py, pz); m.rotation.x = rx; m.rotation.y = ry;
      m.receiveShadow = true; scene.add(m);
    };

    const addFloorBox = (w: number, d: number, px: number, py: number, pz: number, mat: THREE.Material) => {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), mat);
      floor.position.set(px, py, pz);
      floor.receiveShadow = true;
      scene.add(floor);
    };

    // Doorway helper: wall with opening
    const DOOR_W = 2.8, DOOR_H = 4.2;
    const addDoorwall = (sectionW: number, sectionH: number, pz: number, py: number, ry: number, midMat: THREE.Material) => {
      const sw = (sectionW - DOOR_W) / 2;
      const addSeg = (w: number, h: number, offX: number, offY: number) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), midMat);
        m.position.set(offX, py + offY, pz); m.rotation.y = ry; scene.add(m);
      };
      addSeg(sw, sectionH, -(sectionW / 2 - sw / 2) * Math.cos(ry), 0);
      addSeg(sw, sectionH, (sectionW / 2 - sw / 2) * Math.cos(ry), 0);
      const topH = sectionH - DOOR_H;
      if (topH > 0) addSeg(DOOR_W, topH, 0, sectionH / 2 - topH / 2);
    };

    SECTIONS.forEach((s, si) => {
      const bgT = getTex(s.key, "bg");
      const midT = getTex(s.key, "mid");
      const fgT = getTex(s.key, "fg");

      const backZ = s.z - s.d / 2;
      const frontZ = s.z + s.d / 2;
      const midMat = mkMat(midT, s.wC);
      const bgMat = mkMat(bgT, s.wC);
      const fgMat = mkMat(fgT, s.fC);

      const y = s.y || 0;

      // Back wall
      const nextS = SECTIONS.find((os, osi) => osi > si && os.y === s.y);
      if (!nextS) {
        addWall(s.w, s.h, 0, y, backZ, 0, 0, bgMat); // solid final wall
      } else {
        addDoorwall(s.w, s.h, backZ, y, 0, midMat);
      }

      // Front wall
      const prevS = SECTIONS.find((os, osi) => osi < si && os.y === s.y);
      if (!prevS) {
        addWall(s.w, s.h, 0, y, frontZ, 0, Math.PI, bgMat); // entry wall
      } else {
        addDoorwall(s.w, s.h, frontZ, y, Math.PI, midMat);
      }

      // Side walls
      addWall(s.d, s.h, -s.w / 2, y, s.z, 0, Math.PI / 2, midMat);
      addWall(s.d, s.h, s.w / 2, y, s.z, 0, -Math.PI / 2, midMat);

      // Structural corner beams to add geometric depth to each room.
      const beamMat = new THREE.MeshStandardMaterial({ color: 0x2a1b12, roughness: 0.8, metalness: 0.2 });
      const beamH = s.h;
      const beamW = 0.16;
      const beamD = 0.16;
      const beamY = y;
      const bx = s.w / 2 - beamW / 2;
      const bz = s.d / 2 - beamD / 2;
      [
        [-bx, beamY, s.z - bz],
        [bx, beamY, s.z - bz],
        [-bx, beamY, s.z + bz],
        [bx, beamY, s.z + bz],
      ].forEach(([x, by, zPos]) => {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, beamH, beamD), beamMat);
        beam.position.set(x, by, zPos);
        beam.castShadow = true;
        beam.receiveShadow = true;
        scene.add(beam);
      });
      // Ceiling - USING BOX for thickness
      const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.4, s.d), mkMat(midT, 0x060402));
      ceilMesh.position.set(0, y + s.h / 2 + 0.2, s.z);
      ceilMesh.castShadow = true; ceilMesh.receiveShadow = true;
      scene.add(ceilMesh);

      // Floor - carve a stairwell opening instead of removing half the upper floor
      if (s.y > 0) {
        const roomMinX = -s.w / 2;
        const roomMaxX = s.w / 2;
        const roomMinZ = s.z - s.d / 2;
        const roomMaxZ = s.z + s.d / 2;
        const holeMinX = Math.max(roomMinX, UPPER_STAIR_HOLE.minX);
        const holeMaxX = Math.min(roomMaxX, UPPER_STAIR_HOLE.maxX);
        const holeMinZ = Math.max(roomMinZ, UPPER_STAIR_HOLE.minZ);
        const holeMaxZ = Math.min(roomMaxZ, UPPER_STAIR_HOLE.maxZ);
        const floorY = y - s.h / 2 - 0.2;

        if (holeMinX > roomMinX) {
          const w = holeMinX - roomMinX;
          addFloorBox(w, s.d, roomMinX + w / 2, floorY, s.z, fgMat);
        }
        if (roomMaxX > holeMaxX) {
          const w = roomMaxX - holeMaxX;
          addFloorBox(w, s.d, holeMaxX + w / 2, floorY, s.z, fgMat);
        }
        const centerW = Math.max(0, holeMaxX - holeMinX);
        if (centerW > 0 && holeMinZ > roomMinZ) {
          const d = holeMinZ - roomMinZ;
          addFloorBox(centerW, d, (holeMinX + holeMaxX) / 2, floorY, roomMinZ + d / 2, fgMat);
        }
        if (centerW > 0 && roomMaxZ > holeMaxZ) {
          const d = roomMaxZ - holeMaxZ;
          addFloorBox(centerW, d, (holeMinX + holeMaxX) / 2, floorY, holeMaxZ + d / 2, fgMat);
        }

        // Visible border around the stairwell so the opening reads clearly from above.
        const lipMat = new THREE.MeshStandardMaterial({ color: 0x3f2a1f, roughness: 0.95, metalness: 0.02 });
        const lipH = 0.15;
        const lipY = floorY + 0.05;
        const lipX = (holeMinX + holeMaxX) / 2;
        const lipZ = (holeMinZ + holeMaxZ) / 2;
        const lipW = holeMaxX - holeMinX;
        addFloorBox(lipW + 0.25, lipH, lipX, lipY, holeMinZ - 0.12, lipMat);
        addFloorBox(lipW + 0.25, lipH, lipX, lipY, holeMaxZ + 0.12, lipMat);
        addFloorBox(0.18, lipH, holeMinX - 0.12, lipY, lipZ, lipMat);
        addFloorBox(0.18, lipH, holeMaxX + 0.12, lipY, lipZ, lipMat);
      } else {
        addFloorBox(s.w, s.d, 0, y - s.h / 2 - 0.2, s.z, fgMat);
      }

    });

    // ── Flashlight ───────────────────────────────────────────────────────────
    const flashlight = new THREE.SpotLight(0xfff5d8, 28, 35, Math.PI / 6, 0.4, 1.2);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    flashlight.shadow.camera.near = 0.5;
    flashlight.shadow.camera.far = 40;
    camera.add(flashlight);
    // SpotLight target must be in the scene to influence orientation
    scene.add(flashlight.target);
    flashlight.target.position.set(0, 0, -15);
    scene.add(camera);
    const ambient = new THREE.AmbientLight(0x4a3a2a, 3.0);
    scene.add(ambient);

    // ── Furniture meshes ─────────────────────────────────────────────────────
    const furnitureMeshes = FURNITURE.map(f => {
      const geo = new THREE.BoxGeometry(f.sz.x * 2, f.sz.y * 2, f.sz.z * 2);
      const mat = new THREE.MeshLambertMaterial({ color: f.color, transparent: false, opacity: 1 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(f.pos);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      return m;
    });

    // ── Stair props (Realistic construction) ────────────────────────────────
    const stairMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4634 });
    const stringerMaterial = new THREE.MeshLambertMaterial({ color: 0x3d2f23 });

    STAIRCASES.forEach((stair) => {
      // Widened steps (3.6)
      const stepGeo = new THREE.BoxGeometry(3.6, 0.22, 0.52);
      for (let i = 0; i < stair.steps; i++) {
        const step = new THREE.Mesh(stepGeo, stairMaterial);
        step.position.set(
          stair.base.x,
          stair.base.y + stair.rise * i + 0.11,
          stair.base.z + stair.run * i * stair.dir,
        );
        step.castShadow = true; step.receiveShadow = true;
        scene.add(step);
      }

      // Thin side rails keep depth cues while leaving the climb face visually open.
      const guideMat = new THREE.MeshStandardMaterial({ color: 0x23160f, roughness: 0.95, metalness: 0.01 });
      const railLen = stair.steps * stair.run + 0.5;
      const railGeo = new THREE.BoxGeometry(0.06, 0.06, railLen);
      const railY = stair.base.y + stair.steps * stair.rise + 0.2;
      const railZ = stair.base.z + (stair.steps * stair.run * stair.dir) / 2;

      const railL = new THREE.Mesh(railGeo, guideMat);
      railL.position.set(stair.base.x - 1.6, railY, railZ);
      scene.add(railL);

      const railR = new THREE.Mesh(railGeo, guideMat);
      railR.position.set(stair.base.x + 1.6, railY, railZ);
      scene.add(railR);

      // Replace monolith with thin side supports (stringers)
      const stringerGeo = new THREE.BoxGeometry(0.12, stair.steps * stair.rise + 0.5, stair.steps * stair.run + 0.5);
      const stringerL = new THREE.Mesh(stringerGeo, stringerMaterial);
      const stringerR = new THREE.Mesh(stringerGeo, stringerMaterial);

      const beamY = stair.base.y + (stair.steps * stair.rise) / 2;
      const beamZ = stair.base.z + (stair.steps * stair.run * stair.dir) / 2;

      stringerL.position.set(stair.base.x - 1.85, beamY, beamZ);
      stringerR.position.set(stair.base.x + 1.85, beamY, beamZ);
      scene.add(stringerL); scene.add(stringerR);
    });

    // ── Items ────────────────────────────────────────────────────────────────
    const itemState = ITEM_DEFS.map(d => ({ ...d, found: false }));
    // ── Items (Unique 3D Models) ─────────────────────────────────────────────
    const itemMeshes = ITEM_DEFS.map(d => {
      const grp = new THREE.Group();
      grp.position.copy(d.pos);

      // Create unique geometry per item type
      let mainMesh: THREE.Mesh;
      if (d.type === "matchbox") {
        mainMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.5), new THREE.MeshLambertMaterial({ color: 0x8b4513 }));
      } else if (d.type === "torn_tasbeeh") {
        const tGrp = new THREE.Group();
        for (let i = 0; i < 8; i++) {
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshLambertMaterial({ color: 0x3a5a40 }));
          bead.position.set(Math.cos(i) * 0.25, 0, Math.sin(i) * 0.25);
          tGrp.add(bead);
        }
        mainMesh = tGrp as unknown as THREE.Mesh;
      } else if (d.type === "old_key") {
        const kGrp = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), new THREE.MeshLambertMaterial({ color: 0xc8963e }));
        shaft.rotation.z = Math.PI / 2;
        const head = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03), new THREE.MeshLambertMaterial({ color: 0xa8761e }));
        head.position.x = -0.3;
        kGrp.add(shaft); kGrp.add(head);
        mainMesh = kGrp as unknown as THREE.Mesh;
      } else if (d.type === "diya") {
        mainMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.15, 0.18, 16), new THREE.MeshLambertMaterial({ color: 0x8b4513 }));
      } else if (d.type === "ink_pot") {
        mainMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.45, 12), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
      } else { // silver_amulet
        mainMesh = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshLambertMaterial({ color: 0xc0c0c0, side: THREE.DoubleSide }));
      }

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.25 })
      );

      grp.add(mainMesh); grp.add(glow);
      scene.add(grp);
      return { grp, mainMesh, glow };
    });

    // ── Ritual circle in last room ───────────────────────────────────────────
    const ritualZ = SECTIONS[SECTIONS.length - 1].z;
    const ritualPos = new THREE.Vector3(0, SECTIONS[SECTIONS.length - 1].h / -2 + 0.1, ritualZ);

    const ritualCircleMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, transparent: true, opacity: 0, roughness: 0.4, emissive: 0xff3300, emissiveIntensity: 2 });
    const ritualCircle = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), ritualCircleMat);
    ritualCircle.rotation.x = -Math.PI / 2;
    ritualCircle.position.copy(ritualPos);
    scene.add(ritualCircle);

    const ritualRingMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0 });
    const ritualRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 48), ritualRingMat);
    ritualRing.rotation.x = -Math.PI / 2;
    ritualRing.position.copy(ritualPos).add(new THREE.Vector3(0, 0.08, 0));
    scene.add(ritualRing);

    const ritualHolyLight = new THREE.PointLight(0xffaa00, 0, 20);
    ritualHolyLight.position.copy(ritualPos).setY(ritualPos.y + 1.5);
    scene.add(ritualHolyLight);

    // ── FIX 1: Ritual cinematic camera targets (were undefined) ───────────────
    const ritualTargetCamPos = new THREE.Vector3(2.5, ritualPos.y + 3.5, ritualPos.z + 6);
    const ritualTargetCamLook = ritualPos.clone().add(new THREE.Vector3(0, 1, 0));

    let ritualDone = false;
    let ritualAnimTime = 0;

    // ── Predatory 3D Jinn (Puppet) ──────────────────────────────────────────
    const jinnGroup = new THREE.Group();
    const jinnTex = loader.load("/zones/aabis.png.jpg");
    const jPartMat = new THREE.MeshStandardMaterial({
      map: jinnTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    });

    // Predatory Scaling: 1.5x Human Height
    const jH = 7.5, jW = 3.6;
    const torso = new THREE.Mesh(new THREE.PlaneGeometry(jW, jH * 0.6), jPartMat.clone());
    const head = new THREE.Mesh(new THREE.PlaneGeometry(jW * 0.4, jH * 0.3), jPartMat.clone());
    const lArm = new THREE.Mesh(new THREE.PlaneGeometry(jW * 0.3, jH * 0.5), jPartMat.clone());
    const rArm = new THREE.Mesh(new THREE.PlaneGeometry(jW * 0.3, jH * 0.5), jPartMat.clone());

    // Layered veil meshes fake volume so the jinn reads less like a single flat card.
    const bodyLayers: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const layerMat = jPartMat.clone();
      layerMat.opacity = 0.24 - i * 0.02;
      const layer = new THREE.Mesh(
        new THREE.PlaneGeometry(jW * (1 + i * 0.065), jH * (0.62 + i * 0.035)),
        layerMat,
      );
      layer.position.set(0, jH * 0.06 - i * 0.03, -0.08 - i * 0.09);
      bodyLayers.push(layer);
      jinnGroup.add(layer);
    }
    const sideSilhouette = new THREE.Mesh(
      new THREE.PlaneGeometry(jW * 0.75, jH * 0.82),
      jPartMat.clone(),
    );
    sideSilhouette.rotation.y = Math.PI / 2;
    sideSilhouette.position.set(0, jH * 0.06, -0.12);
    jinnGroup.add(sideSilhouette);

    head.position.y = jH * 0.45;
    lArm.position.set(-jW * 0.5, jH * 0.2, 0.4);
    rArm.position.set(jW * 0.5, jH * 0.2, 0.4);

    jinnGroup.add(torso, head, lArm, rArm);
    jinnGroup.position.set(0, -0.5, SECTIONS[SECTIONS.length - 2].z);
    scene.add(jinnGroup);

    const jinnLight = new THREE.PointLight(0xaa1133, 0, 15, 2);
    scene.add(jinnLight);
    const jinnShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    jinnShadow.rotation.x = -Math.PI / 2;
    scene.add(jinnShadow);

    // AI logic state
    let jinnActive = false;
    const jinnCaught = false;
    let jinnBaseSpeed = 0; // escalates with each item
    let itemsFound = 0;

    // Horror Body Enhancement: Spirit Echoes
    const echoes = [0, 1].map(() => {
      const g = jinnGroup.clone();
      g.children.forEach(c => (c as THREE.Mesh).material = jPartMat.clone());
      scene.add(g);
      return g;
    });
    const jinn = jinnGroup; // Alias for movement logic
    const jinnMat = torso.material as THREE.MeshStandardMaterial;
    // Jinn wander when player hiding
    const jinnWanderDir = new THREE.Vector3(0, 0, -1);
    let jinnWanderTimer = 0;
    let hideSafetyFrames = 0;
    let jinnRepelFrames = 0;
    let jinnEntryFrames = 0;
    let ambushCooldown = 140;
    let ambushFrames = 0;
    const ambushDir = new THREE.Vector3();
    let surpriseWarpCooldown = 260;
    let lightFailFrames = 0;
    let cinematicFrames = 0;
    let cinematicCooldown = 400;
    let replayEventCooldown = 340;
    const seenReplayEvents = new Set<string>();
    let jinnModel: THREE.Group | null = null;
    let jinnMixer: THREE.AnimationMixer | null = null;
    let has3DJinn = false;
    const jinnClock = new THREE.Clock();

    const fallbackParts: THREE.Object3D[] = [torso, head, lArm, rArm, sideSilhouette, ...bodyLayers];

    gltfLoader.load(
      "/zones/aabis.glb",
      (gltf) => {
        const model = gltf.scene;
        model.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => {
            const std = mat as THREE.MeshStandardMaterial;
            std.transparent = true;
            std.depthWrite = false;
            std.emissive = new THREE.Color(0x22050f);
            std.emissiveIntensity = 0.55;
          });
        });

        model.scale.setScalar(2.1);
        model.position.set(0, -1.0, -0.08);
        jinnGroup.add(model);
        jinnModel = model;

        if (gltf.animations.length > 0) {
          jinnMixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => {
            const action = jinnMixer!.clipAction(clip);
            action.setEffectiveWeight(1);
            action.play();
          });
        }

        fallbackParts.forEach((part) => { part.visible = false; });
        echoes.forEach((e) => { e.visible = false; });
        has3DJinn = true;
      },
      undefined,
      () => {
        // Keep spectral fallback when no model exists.
      },
    );

    // ── Dust Particles ───────────────────────────────────────────────────────
    const dustCount = 1500; // Increased for more atmosphere
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPos[i] = (Math.random() - 0.5) * 15;
      dustPos[i + 1] = (Math.random() - 0.5) * 8;
      dustPos[i + 2] = (Math.random() - 0.5) * 120;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0x887755, size: 0.035, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    const placeJinnBehindPlayer = (distance: number) => {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();
      const side = new THREE.Vector3(-forward.z, 0, forward.x).multiplyScalar((Math.random() > 0.5 ? 1 : -1) * 1.8);
      jinn.position.copy(camera.position).addScaledVector(forward, -distance).add(side);
      jinn.position.z = Math.max(Z_MIN + 1, Math.min(Z_MAX - 1, jinn.position.z));
      const jxb = getXBound(jinn.position.z, jinn.position.y) - 0.6;
      jinn.position.x = Math.max(-jxb, Math.min(jxb, jinn.position.x));
      jinn.position.y = -0.45;
    };

    // ── Input ─────────────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    let pointerLocked = false;
    let pointerRelockBlockedUntil = 0;
    let hiding = false;
    let hideTimer = 0;
    const HIDE_DURATION = 300; // frames player stays hidden

    const canvas = renderer.domElement;
    const onCanvasClick = () => {
      const now = performance.now();
      if (document.pointerLockElement === canvas || now < pointerRelockBlockedUntil) return;
      try {
        const maybePromise = canvas.requestPointerLock();
        if (maybePromise && typeof (maybePromise as Promise<void>).catch === "function") {
          (maybePromise as Promise<void>).catch(() => {
            pointerRelockBlockedUntil = performance.now() + 320;
          });
        }
      } catch {
        pointerRelockBlockedUntil = performance.now() + 320;
      }
    };

    const onPointerLockChangeDoc = () => {
      pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked) pointerRelockBlockedUntil = performance.now() + 260;
      onLockChange(pointerLocked);
    };

    const onPointerLockError = () => {
      pointerLocked = false;
      pointerRelockBlockedUntil = performance.now() + 360;
      onLockChange(false);
    };

    const onMouseMoveDoc = (e: MouseEvent) => {
      if (!pointerLocked || hiding) return;
      euler.y -= e.movementX * 0.002;
      euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.x - e.movementY * 0.002));
      camera.quaternion.setFromEuler(euler);
    };

    const onKeyDownDoc = (e: KeyboardEvent) => {
      keys[e.code] = true;
      // Toggle hide near furniture
      if (e.code === "KeyH" || e.code === "KeyC") {
        const nearFurniture = FURNITURE.some((f, fi) => f.hide && camera.position.distanceTo(furnitureMeshes[fi].position) < 2.2);
        if (nearFurniture && !hiding) {
          hiding = true; hideTimer = HIDE_DURATION;
          camera.position.y -= 0.7; // crouch
          hideSafetyFrames = 120;
          onEvent({ type: "hiding_changed", payload: { hiding: true } });
        } else if (hiding) {
          hiding = false;
          camera.position.y += 0.7;
          hideSafetyFrames = 80;
          onEvent({ type: "hiding_changed", payload: { hiding: false } });
        }
      }

      // Recite tasbeeh while hiding to repel Aabis briefly.
      if (e.code === "KeyT" && hiding) {
        const hasTasbeeh = itemState.some((i) => i.type === "torn_tasbeeh" && i.found);
        if (hasTasbeeh) {
          jinnRepelFrames = 190;
          hideSafetyFrames = Math.max(hideSafetyFrames, 150);
          jinnLight.intensity = 3.4;
          onEvent({ type: "tasbeeh_recited" });
        }
      }
    };

    const onKeyUpDoc = (e: KeyboardEvent) => { keys[e.code] = false; };

    canvas.addEventListener("click", onCanvasClick);
    document.addEventListener("pointerlockchange", onPointerLockChangeDoc);
    document.addEventListener("pointerlockerror", onPointerLockError);
    document.addEventListener("mousemove", onMouseMoveDoc);
    document.addEventListener("keydown", onKeyDownDoc);
    document.addEventListener("keyup", onKeyUpDoc);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const BASE_EYE_HEIGHT = 1.7;
    const getFloorY = (x: number, z: number, eyeY = camera.position.y) => {
      let floorY = -3.5 + BASE_EYE_HEIGHT;
      let stairFloorY: number | null = null;

      // FIRST: Check staircase - do this BEFORE room floors so stairs take absolute priority
      STAIRCASES.forEach((stair) => {
        const minZ = stair.base.z - 1.0;
        const maxZ = stair.base.z + stair.dir * stair.run * (stair.steps - 1) + 1.0;
        const zLo = Math.min(minZ, maxZ);
        const zHi = Math.max(minZ, maxZ);
        
        // Wider X and Z detection zone for stairs
        if (Math.abs(x - stair.base.x) <= 2.8 && z >= zLo - 1.0 && z <= zHi + 1.0) {
          const along = ((z - stair.base.z) / (stair.run * stair.dir));
          const clampedAlong = Math.max(0, Math.min(stair.steps - 1, along));
          const stepTopY = stair.base.y + clampedAlong * stair.rise + 0.24;
          stairFloorY = stepTopY + BASE_EYE_HEIGHT;
        }
      });

      // SECOND: Check room floors ONLY if not on stairs
      if (stairFloorY === null) {
        SECTIONS.forEach((s) => {
          const inX = Math.abs(x) < s.w / 2 + 0.1;
          const inZ = Math.abs(z - s.z) < s.d / 2 + 0.1;
          if (inX && inZ) {
            const y = (s.y || 0) - s.h / 2 + BASE_EYE_HEIGHT;
            if (s.y > 0) {
              // Upper floor with hole - only use if NOT above the hole
              const roomMinX = -s.w / 2;
              const roomMaxX = s.w / 2;
              const roomMinZ = s.z - s.d / 2;
              const roomMaxZ = s.z + s.d / 2;
              const holeMinX = Math.max(roomMinX, UPPER_STAIR_HOLE.minX);
              const holeMaxX = Math.min(roomMaxX, UPPER_STAIR_HOLE.maxX);
              const holeMinZ = Math.max(roomMinZ, UPPER_STAIR_HOLE.minZ);
              const holeMaxZ = Math.min(roomMaxZ, UPPER_STAIR_HOLE.maxZ);
              const insideHole = x >= holeMinX && x <= holeMaxX && z >= holeMinZ && z <= holeMaxZ;

              if (!insideHole) {
                const diff = eyeY - (y - 0.2);
                if (diff > -1.0 && diff < 4.0) {
                  floorY = y;
                }
              }
              return;
            }
            // Normal floor
            const diff = eyeY - (y - 0.2);
            if (diff > -1.0 && diff < 4.0) {
              floorY = y;
            }
          }
        });
      }

      // THIRD: If on stairs, use stair floor (sticky floor)
      if (stairFloorY !== null) {
        floorY = stairFloorY;
      }

      return floorY;
    };
    const getXBound = (z: number, y: number) => {
      const sec = SECTIONS.find(s => {
        const inZ = Math.abs(s.z - z) <= s.d / 2 + 2;
        const currentY = y - BASE_EYE_HEIGHT;
        const sectionFloorY = (s.y || 0) - s.h / 2;
        // Significant vertical tolerance for bound detection (6.0)
        const inY = Math.abs(sectionFloorY - currentY) < 6.0;
        return inZ && inY;
      }) || SECTIONS[0];
      return sec.w / 2 - 0.55;
    };

    // ── Furniture collision ────────────────────────────────────────────────────
    const resolvePlayerFurniture = (pos: THREE.Vector3) => {
      FURNITURE.forEach((f) => {
        // Floor-aware furniture collision: Only collide if we are on the same vertical level as the prop
        if (Math.abs(pos.y - (f.pos.y + 0.8)) > 2.0) return;
        const dx = pos.x - f.pos.x;
        const dz = pos.z - f.pos.z;
        const overlapX = f.sz.x + 0.35 - Math.abs(dx);
        const overlapZ = f.sz.z + 0.35 - Math.abs(dz);
        if (overlapX > 0 && overlapZ > 0) {
          if (overlapX < overlapZ) pos.x += Math.sign(dx) * overlapX;
          else pos.z += Math.sign(dz) * overlapZ;
        }
      });
    };

    // ── Animation ─────────────────────────────────────────────────────────────
    const velocity = new THREE.Vector3();
    const fwd = new THREE.Vector3(), side = new THREE.Vector3();
    let frame = 0, footTimer = 0;
    let lastZone = 1;
    let nearItemLabel = "";
    let nearHideable = false;
    let sanityHorrorCooldown = 0;
    let reqId: number;

    const animate = () => {
      reqId = requestAnimationFrame(animate);
      frame++;
      const dt = Math.min(0.05, jinnClock.getDelta());

      const sanity = sanityRef.current;
      const running = (keys["ShiftLeft"] || keys["ShiftRight"]) && !hiding;
      const spd = running ? 0.065 : 0.036;
      const intensity = itemsFound > 0 ? itemsFound * 0.08 : 0;
      if (sanityHorrorCooldown > 0) sanityHorrorCooldown--;

      // ── Player movement ──────────────────────────────────────────────────
      if (pointerLocked && !jinnCaught && !hiding && !ritualDone) {
        camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        side.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        if (keys["KeyW"] || keys["ArrowUp"]) velocity.addScaledVector(fwd, spd);
        if (keys["KeyS"] || keys["ArrowDown"]) velocity.addScaledVector(fwd, -spd * 0.7);
        if (keys["KeyA"] || keys["ArrowLeft"]) velocity.addScaledVector(side, -spd * 0.8);
        if (keys["KeyD"] || keys["ArrowRight"]) velocity.addScaledVector(side, spd * 0.8);

        // Extreme Dizziness & Shake Logic
        const jinnDist = camera.position.distanceTo(jinn.position);
        const fearFactor = Math.max(0, 1.0 - jinnDist / 12);

        // Vigorous Positional Screen Shake
        const totalShake = (intensity * 0.02) + (fearFactor * 0.15);
        if (totalShake > 0.005) {
          camera.position.x += (Math.random() - 0.5) * totalShake;
          camera.position.y += (Math.random() - 0.5) * totalShake;
        }

        const sanityPressure = Math.max(0, 1 - sanity / 100);
        if (sanityPressure > 0) {
          const sanityShake = sanityPressure * (difficulty === "impossible" ? 0.08 : difficulty === "hard" ? 0.06 : 0.04);
          camera.position.x += (Math.random() - 0.5) * sanityShake;
          camera.position.y += (Math.random() - 0.5) * sanityShake * 0.5;

          if (sanityHorrorCooldown <= 0) {
            const terrorChance = difficulty === "easy" ? 0.002 : difficulty === "medium" ? 0.005 : difficulty === "hard" ? 0.012 : 0.02;
            const collapseChance = sanity < 30 ? terrorChance * 2.5 : terrorChance;
            if (Math.random() < collapseChance) {
              sanityHorrorCooldown = difficulty === "impossible" ? 110 : difficulty === "hard" ? 150 : 220;
              if (sanity < 30 || difficulty === "impossible") {
                onEvent({ type: "cinematic_jumpscare", payload: { intensity: Math.max(0.45, 1 - sanity / 100) } });
              } else {
                onEvent({ type: "mini_event", payload: { eventId: "sanity_crack", message: "Your thoughts crack. Something stands just behind your eyes." } });
              }
            }
          }
        }

      }

      velocity.multiplyScalar(0.72);
      camera.position.add(velocity);

      // ── Bounds ───────────────────────────────────────────────────────────
      const xb = getXBound(camera.position.z, camera.position.y);
      camera.position.x = Math.max(-xb, Math.min(xb, camera.position.x));
      camera.position.z = Math.max(Z_MIN, Math.min(Z_MAX, camera.position.z));
      resolvePlayerFurniture(camera.position);

      if (pointerLocked && !jinnCaught && !hiding && !ritualDone) {
        const isMoving = velocity.lengthSq() > 0.0001;
        if (isMoving) {
          footTimer++;
          const targetY = getFloorY(camera.position.x, camera.position.z, camera.position.y) + Math.sin(footTimer * 0.15) * 0.03 * intensity;
          camera.position.y += (targetY - camera.position.y) * 0.5;
          camera.rotation.z = Math.sin(frame * 0.04) * 0.01 * intensity;
        } else {
          camera.position.y += (getFloorY(camera.position.x, camera.position.z, camera.position.y) - camera.position.y) * 0.2;
          camera.rotation.z *= 0.85;
          if (Math.abs(camera.rotation.z) < 0.001) camera.rotation.z = 0;
        }
      }

      // ── Zone detection ────────────────────────────────────────────────────
      const pz = camera.position.z;
      const currentZone = pz > -29 ? 1 : pz > -60 ? 2 : pz > -100 ? 3 : 4;
      if (currentZone !== lastZone) {
        lastZone = currentZone;
        zoneRef.current = currentZone;
        onEvent({ type: "zone_entered", payload: { zone: currentZone } });
      }

      // ── Hide timer ────────────────────────────────────────────────────────
      if (hiding) {
        hideTimer--;
        if (hideTimer <= 0) {
          hiding = false;
          camera.position.y += 0.7;
          hideSafetyFrames = 80;
          onEvent({ type: "hiding_changed", payload: { hiding: false } });
        }
      }
      if (hideSafetyFrames > 0) hideSafetyFrames--;

      // ── Near hideable furniture ───────────────────────────────────────────
      const nowNearHide = FURNITURE.some((f, fi) => f.hide && camera.position.distanceTo(furnitureMeshes[fi].position) < 2.2);
      if (nowNearHide !== nearHideable) {
        nearHideable = nowNearHide;
        onEvent({ type: "near_item", payload: { item: nowNearHide ? (hiding ? "__unhide__" : "__hide__") : "" } });
      }

      // ── Items ─────────────────────────────────────────────────────────────
      let curNear = "";
      const allFound = itemState.every(i => i.found);
      itemState.forEach((item, i) => {
        if (item.found) { itemMeshes[i].grp.visible = false; return; }
        itemMeshes[i].grp.rotation.y += 0.02;
        const pulse = 0.2 + Math.sin(frame * 0.07 + i) * 0.1;
        (itemMeshes[i].glow.material as THREE.MeshBasicMaterial).opacity = pulse;
        const dist = camera.position.distanceTo(item.pos);
        if (dist < 2.0) {
          curNear = item.type;
          if (keys["KeyE"]) {
            item.found = true;
            itemMeshes[i].grp.visible = false;
            itemsFound++;
            // Escalate Jinn speed per item
            if (itemsFound === 1) {
              jinnActive = true;
              jinnBaseSpeed = 0.009;
              jinnMat.opacity = 0.7;
              placeJinnBehindPlayer(difficulty === "impossible" ? 9 : 14);
              jinnEntryFrames = 130;
            } else if (itemsFound === 2) { jinnBaseSpeed = 0.015; }
            else if (itemsFound === 3) { jinnBaseSpeed = 0.021; }
            else if (itemsFound === 4) { jinnBaseSpeed = 0.030; }
            else if (itemsFound === 5) { jinnBaseSpeed = 0.040; }
            else if (itemsFound >= 6) { jinnBaseSpeed = 0.055; }

            jinnBaseSpeed *= difficultyMultiplier;
            if (isCursed && difficulty === "medium") jinnBaseSpeed *= 1.8; // legacy cursed mode fallback
            onEvent({ type: "item_found", payload: { item: item.type, zone: item.zone, itemsFound } });
          }
        }
      });
      if (curNear !== nearItemLabel && !nearHideable) {
        nearItemLabel = curNear;
        if (!nearHideable) onEvent({ type: "near_item", payload: { item: curNear } });
      }

      // ── Ritual circle ─────────────────────────────────────────────────────
      if (allFound) {
        const pulse = 0.35 + Math.sin(frame * 0.08) * 0.25;
        ritualCircleMat.opacity = pulse;
        ritualRingMat.opacity = pulse + 0.1;
        ritualRing.rotation.z += 0.015;
        if (!ritualDone) {
          const distToRitual = camera.position.distanceTo(ritualPos);
          if (keys["KeyE"] && allFound && distToRitual < 2.5) {
            ritualDone = true;
            onEvent({ type: "ritual_complete", payload: { stage: 0 } });
          }
          if (!curNear && distToRitual < 3) {
            onEvent({ type: "near_item", payload: { item: "__ritual__" } });
          }
        }
      }

      // ── Cinematic Ritual Animation ────────────────────────────────────────
      if (ritualDone) {
        ritualAnimTime += 0.012;

        // Dynamic Holy Lighting (Fixes Black Screen)
        const lightBoost = Math.min(45, ritualAnimTime * 12); // Much faster and brighter boost
        ritualHolyLight.intensity = lightBoost;
        flashlight.intensity *= 0.992; // Much slower fade to keep visibility
        ambient.intensity *= 0.995;

        if (ritualAnimTime < 4) {
          // Camera transition: lerp to dramatic high-angle
          camera.position.lerp(ritualTargetCamPos, 0.03);
          camera.lookAt(ritualTargetCamLook);
          jinn.position.lerp(ritualPos, 0.05);
        }

        if (ritualAnimTime > 2) {
          const rustColor = new THREE.Color(0x8b4513); // Deep copper rust
          jinnMat.color.lerp(rustColor, 0.03);
          jinnMat.opacity = Math.max(0, 0.96 - (ritualAnimTime - 2) * 0.15);

          // FIX 2: iterate children, not group.material
          echoes.forEach((e) => {
            e.children.forEach((c) => {
              const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
              if (mat) { mat.color.lerp(rustColor, 0.06); mat.opacity *= 0.94; }
            });
          });
        }
        if (ritualAnimTime > 3.2) {
          onEvent({ type: "ritual_complete", payload: { stage: 1 } });
        }
      }

      // ── Jinn AI ───────────────────────────────────────────────────────────
      if (jinnActive && !jinnCaught) {
        // Increase opacity faster and add alphaTest for visibility
        jinnMat.opacity = Math.min(0.96, Math.max(0.55, jinnMat.opacity + 0.008));
        jinnMat.alphaTest = 0.05;

        const toPlayer = camera.position.clone().sub(jinn.position);
        const dist = toPlayer.length();

        if (ambushCooldown > 0) ambushCooldown--;
        if (surpriseWarpCooldown > 0) surpriseWarpCooldown--;
        if (cinematicCooldown > 0) cinematicCooldown--;
        if (replayEventCooldown > 0) replayEventCooldown--;

        // Keep pressure by respawning behind player when too far.
        if (dist > 40) placeJinnBehindPlayer(11);

        if (dist < 11 && Math.random() < 0.02) {
          lightFailFrames = Math.max(lightFailFrames, 8 + Math.floor(Math.random() * 8));
          onEvent({ type: "light_failure", payload: { intensity: Math.max(0.2, 1 - dist / 12) } });
        }

        const cinematicChance = difficulty === "easy" ? 0.016 : difficulty === "medium" ? 0.028 : difficulty === "hard" ? 0.04 : 0.055;
        const cinematicGap = difficulty === "easy" ? 700 : difficulty === "medium" ? 520 : difficulty === "hard" ? 420 : 300;

        if (!hiding && cinematicCooldown <= 0 && dist < 5.3 && Math.random() < cinematicChance) {
          cinematicFrames = 22;
          cinematicCooldown = cinematicGap;
          onEvent({ type: "cinematic_jumpscare", payload: { intensity: Math.max(0.4, 1 - dist / 8) } });
        }

        const replayChance = difficulty === "easy" ? 0.018 : difficulty === "medium" ? 0.03 : difficulty === "hard" ? 0.046 : 0.065;
        if (!hiding && replayEventCooldown <= 0 && Math.random() < replayChance) {
          const pool = ["echo_laugh", "door_chain", "cold_breath"].filter((id) => !seenReplayEvents.has(id));
          const pick = (pool.length ? pool : ["echo_laugh", "door_chain", "cold_breath"])[Math.floor(Math.random() * (pool.length ? pool.length : 3))];
          seenReplayEvents.add(pick);
          replayEventCooldown = difficulty === "impossible" ? 120 + Math.floor(Math.random() * 120) : 280 + Math.floor(Math.random() * 220);

          if (pick === "echo_laugh") {
            onEvent({ type: "mini_event", payload: { eventId: pick, message: "A child-like laugh echoes from an empty corridor." } });
          } else if (pick === "door_chain") {
            onEvent({ type: "mini_event", payload: { eventId: pick, message: "Iron chains scrape the floor behind you." } });
            lightFailFrames = Math.max(lightFailFrames, 6);
          } else {
            onEvent({ type: "mini_event", payload: { eventId: pick, message: "Your breath fogs. Something cold passes through you." } });
          }
        }

        const surpriseChance = difficulty === "easy" ? 0.003 : difficulty === "medium" ? 0.006 : difficulty === "hard" ? 0.010 : 0.016;
        if (!hiding && surpriseWarpCooldown <= 0 && dist > 10 && dist < 30 && Math.random() < surpriseChance) {
          const around = new THREE.Vector3();
          camera.getWorldDirection(around);
          around.y = 0;
          if (around.lengthSq() < 0.001) around.set(0, 0, -1);
          around.normalize();
          const side = new THREE.Vector3(-around.z, 0, around.x).multiplyScalar((Math.random() > 0.5 ? 1 : -1) * (2.0 + Math.random() * 2.2));
          const rear = around.clone().multiplyScalar(-(2.4 + Math.random() * 2.6));
          jinn.position.copy(camera.position).add(rear).add(side);
          surpriseWarpCooldown = difficulty === "impossible" ? 120 + Math.floor(Math.random() * 80) : 240 + Math.floor(Math.random() * 150);
          ambushFrames = 10 + Math.floor(Math.random() * 12);
          ambushDir.copy(camera.position).sub(jinn.position).setY(0);
          if (ambushDir.lengthSq() < 0.001) ambushDir.set(0, 0, -1);
          ambushDir.normalize();
          onEvent({ type: "mini_event", payload: { eventId: "echo_laugh", message: "Something shifts in the dark behind you." } });
        }

        const ambushChance = difficulty === "easy" ? 0.01 : difficulty === "medium" ? 0.02 : difficulty === "hard" ? 0.032 : 0.055;
        if (
          !hiding &&
          jinnRepelFrames <= 0 &&
          jinnEntryFrames <= 0 &&
          ambushFrames <= 0 &&
          ambushCooldown <= 0 &&
          dist > 6 &&
          dist < 16 &&
          Math.random() < ambushChance
        ) {
          const forwardFlat = new THREE.Vector3();
          camera.getWorldDirection(forwardFlat);
          forwardFlat.y = 0;
          if (forwardFlat.lengthSq() < 0.001) forwardFlat.set(0, 0, -1);
          forwardFlat.normalize();

          const flank = new THREE.Vector3(-forwardFlat.z, 0, forwardFlat.x).multiplyScalar((Math.random() > 0.5 ? 1 : -1) * (2.5 + Math.random() * 1.2));
          const rearOffset = forwardFlat.clone().multiplyScalar(-(2.8 + Math.random() * 1.2));
          jinn.position.copy(camera.position).add(rearOffset).add(flank);

          ambushDir.copy(camera.position).sub(jinn.position).setY(0);
          if (ambushDir.lengthSq() < 0.001) ambushDir.set(0, 0, -1);
          ambushDir.normalize();
          ambushFrames = 16 + Math.floor(Math.random() * 10);
          ambushCooldown = difficulty === "impossible" ? 90 + Math.floor(Math.random() * 80) : 220 + Math.floor(Math.random() * 120);
          jinnLight.intensity = 3.6;
          flashlight.intensity = Math.max(7, flashlight.intensity * 0.55);
        }

        if (jinnRepelFrames > 0) {
          jinnRepelFrames--;
          const away = jinn.position.clone().sub(camera.position).setY(0);
          if (away.lengthSq() < 0.001) away.set(0, 0, -1);
          away.normalize();
          jinn.position.addScaledVector(away, jinnBaseSpeed * 2.2);
          jinn.position.addScaledVector(jinnWanderDir, jinnBaseSpeed * 0.35);
          jinnLight.intensity = 2.2;
        } else if (jinnEntryFrames > 0) {
          // Dramatic first reveal: Aabis emerges from behind, surges, then settles.
          jinnEntryFrames--;
          const entryDir = toPlayer.clone().normalize();
          jinn.position.addScaledVector(entryDir, Math.min(jinnBaseSpeed * 2.8, dist));
          jinnMat.opacity = Math.min(1.0, 0.75 + Math.sin(frame * 0.4) * 0.25);
          jinnLight.intensity = 2.6 + Math.sin(frame * 0.3) * 0.8;
          flashlight.intensity = 9 + Math.random() * 15;
        } else if (hiding) {
          // While hidden, push Aabis away from the player's last known location.
          if (dist < 6) {
            const away = jinn.position.clone().sub(camera.position).setY(0);
            if (away.lengthSq() < 0.001) away.set((Math.random() - 0.5) * 2, 0, -1);
            away.normalize();
            jinn.position.addScaledVector(away, jinnBaseSpeed * 1.05);
          }
          jinnWanderTimer++;
          if (jinnWanderTimer % 100 === 0) {
            jinnWanderDir.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2).normalize();
          }
          // Move even slower while player is hiding
          jinn.position.addScaledVector(jinnWanderDir, jinnBaseSpeed * 0.3);
        } else {
          // Chase player aggressively
          const playerUpper = camera.position.y > 2.6;
          const jinnUpper = jinn.position.y > 2.6;
          const stair = STAIRCASES[0];
          const stairTopZ = stair.base.z + stair.dir * stair.run * (stair.steps - 1);
          const chaseTarget = camera.position.clone();

          if (playerUpper !== jinnUpper) {
            if (!jinnUpper) {
              if (Math.abs(jinn.position.x - stair.base.x) > 0.9) {
                jinn.position.x += Math.sign(stair.base.x - jinn.position.x) * Math.min(0.45, Math.abs(stair.base.x - jinn.position.x));
              }
              chaseTarget.set(stair.base.x, jinn.position.y, jinn.position.z < stair.base.z - 0.4 ? stair.base.z : stairTopZ);
            } else {
              if (Math.abs(jinn.position.x - stair.base.x) > 0.9) {
                jinn.position.x += Math.sign(stair.base.x - jinn.position.x) * Math.min(0.45, Math.abs(stair.base.x - jinn.position.x));
              }
              chaseTarget.set(stair.base.x, jinn.position.y, stairTopZ + 0.2);
            }
          }

          const chaseDir = chaseTarget.sub(jinn.position).normalize();
          jinn.position.addScaledVector(chaseDir, Math.min(jinnBaseSpeed, dist));
        }

        if (ambushFrames > 0) {
          ambushFrames--;
          jinn.position.addScaledVector(ambushDir, jinnBaseSpeed * 3.5);
          head.rotation.z += (Math.random() - 0.5) * 0.25;
        }

        if (cinematicFrames > 0) {
          cinematicFrames--;
          const lookTarget = jinn.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          camera.lookAt(lookTarget);
          camera.rotation.z += (Math.random() - 0.5) * 0.04;
          flashlight.intensity = Math.max(4.5, flashlight.intensity * 0.78);
        }

        // Spectral glow effect: Keep white to see the texture clearly
        jinnMat.color.setRGB(1, 1, 1);

        // Keep jinn pinned to floor height accurately
        // JINN MULTI-FLOOR NAVIGATION: She now seeks the player's true floor
        const currentJinnFloor = getFloorY(jinn.position.x, jinn.position.z, jinn.position.y) + 0.55;
        jinn.position.y = currentJinnFloor + Math.sin(frame * 0.08) * 0.15;
        jinnLight.position.copy(jinn.position);
        jinnLight.position.y += 1.2;
        jinn.lookAt(camera.position.x, jinn.position.y, camera.position.z);
        jinnShadow.position.set(jinn.position.x, currentJinnFloor - BASE_EYE_HEIGHT + 0.03, jinn.position.z);
        const threat = Math.max(0.2, Math.min(1, 1 - dist / 18));
        (jinnShadow.material as THREE.MeshBasicMaterial).opacity = 0.08 + threat * 0.28;
        jinnShadow.scale.setScalar(1.05 + (1 - threat) * 0.85 + Math.sin(frame * 0.08) * 0.04);

        bodyLayers.forEach((layer, li) => {
          layer.rotation.y = Math.sin(frame * 0.035 + li * 0.9) * 0.18;
          layer.position.x = Math.sin(frame * 0.022 + li) * 0.08;
          (layer.material as THREE.MeshStandardMaterial).opacity = Math.max(
            0.06,
            jinnMat.opacity * (0.34 - li * 0.045) * (0.86 + Math.sin(frame * 0.06 + li) * 0.22),
          );
        });
        (sideSilhouette.material as THREE.MeshStandardMaterial).opacity = jinnMat.opacity * 0.26;

        if (has3DJinn && jinnModel) {
          const threatSway = Math.max(0.25, Math.min(1, 1 - dist / 20));
          jinnModel.rotation.y = Math.sin(frame * 0.025) * 0.06 * threatSway;
          jinnModel.rotation.z = Math.sin(frame * 0.08) * 0.05 * threatSway;
          const pulse = 1 + Math.sin(frame * 0.14) * 0.03;
          jinnModel.scale.setScalar(2.1 * pulse);
        }

        // Animate echoes: Spectral blur effect
        // FIX 3: closing }); is here so bounds/flicker/puppet run outside the loop
        echoes.forEach((echo, ei) => {
          echo.position.copy(jinn.position).add(new THREE.Vector3(
            Math.sin(frame * 0.12 + ei) * 0.22,
            Math.cos(frame * 0.1 + ei) * 0.12,
            Math.sin(frame * 0.18 + ei) * 0.12
          ));
          echo.lookAt(camera.position.x, echo.position.y, camera.position.z);
          echo.children.forEach((c) => {
            const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
            if (mat) mat.opacity = jinnMat.opacity * 0.4;
          });
        }); // ← correctly closed

        // Clamp jinn to bounds
        jinn.position.z = Math.max(Z_MIN + 1, Math.min(Z_MAX - 1, jinn.position.z));
        jinn.position.x = Math.max(-5.5, Math.min(5.5, jinn.position.x));

        // Flashlight flicker and DIMMING logic on Jinn approach
        const flickerBase = 0.05 + itemsFound * 0.025;
        const isFlickering = Math.random() < flickerBase;

        // Emit Fear Pulses for the Audio Engine
        if (frame % Math.floor(60 / (0.5 + (1 - dist / 12))) === 0 && dist < 12) {
          onEvent({ type: "fear_pulsed", payload: { intensity: Math.max(0, 1 - dist / 12) } });
        }

        if (dist < 12) {
          // Dynamic dimming: flashlight gets weaker as Jinn approaches
          const dimFactor = Math.max(0.1, dist / 12);
          const currentMaxIntensity = Math.max(12, 32 - itemsFound * 2.5);
          const baseIntensity = currentMaxIntensity * dimFactor;

          if (frame % (Math.floor(dist) + 2) === 0 || isFlickering) {
            flashlight.intensity = baseIntensity * (0.4 + Math.random() * 0.8);
          } else {
            flashlight.intensity = baseIntensity;
          }
          jinnLight.intensity = 1.4 + (8 - dist) * 0.2;
        } else {
          // Normal intensity degrades as items are found
          const currentMaxIntensity = Math.max(12, 32 - itemsFound * 2.5);
          flashlight.intensity = isFlickering ? currentMaxIntensity * 0.3 : currentMaxIntensity;
          jinnLight.intensity = 0.8;
        }

        // ── Predatory Puppet Animation (Twitchy/Jerky) ─────────────────────
        head.rotation.z = Math.sin(frame * 0.22) * 0.18;
        lArm.rotation.z = Math.sin(frame * 0.15) * 0.5 + (Math.random() - 0.5) * 0.15;
        rArm.rotation.z = Math.cos(frame * 0.18) * 0.5 + (Math.random() - 0.5) * 0.15;
        lArm.position.z = 0.4 + Math.sin(frame * 0.1) * 0.6; // Reaching arms
        rArm.position.z = 0.4 + Math.cos(frame * 0.1) * 0.6;
        torso.rotation.x = Math.sin(frame * 0.05) * 0.05;
      }
      else {
        (jinnShadow.material as THREE.MeshBasicMaterial).opacity *= 0.9;
      }

      if (lightFailFrames > 0) {
        lightFailFrames--;
        flashlight.intensity = Math.min(flashlight.intensity, 2 + Math.random() * 2.5);
        ambient.intensity = Math.min(ambient.intensity, 0.8 + Math.random() * 0.25);
      }

      if (jinnMixer) {
        const speedFactor = jinnActive ? 1.25 + Math.min(0.8, itemsFound * 0.08) : 0.3;
        jinnMixer.update(dt * speedFactor);
      }
      // ── Flashlight Lock-on Fix (Always active) ─────────────────────────
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      flashlight.target.position.copy(camera.position).add(camDir.multiplyScalar(15));
      flashlight.target.updateMatrixWorld();

      // ── Realism+ Volumetrics (Dust Particles) ───────────────────────────
      const dpos = dustGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < dustCount * 3; i += 3) {
        dpos[i + 1] -= 0.0035; // Fine-tuned fall speed
        if (dpos[i + 1] < -4.5) dpos[i + 1] = 4.5;
        dpos[i] += Math.sin(frame * 0.01 + i) * 0.0015;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dust.position.copy(camera.position).addScaledVector(camDir, 5);

      (scene.fog as THREE.FogExp2).density = 0.035 + (100 - sanity) * 0.0004;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("click", onCanvasClick);
      document.removeEventListener("pointerlockchange", onPointerLockChangeDoc);
      document.removeEventListener("pointerlockerror", onPointerLockError);
      document.removeEventListener("mousemove", onMouseMoveDoc);
      document.removeEventListener("keydown", onKeyDownDoc);
      document.removeEventListener("keyup", onKeyUpDoc);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}