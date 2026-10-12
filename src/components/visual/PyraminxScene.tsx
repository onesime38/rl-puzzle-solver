import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PyraminxPuzzle } from "../../engine";
import { buildPyraminxScene } from "./pyraScene";
import { unit } from "./pyraGeometry";
import type { PuzzleViewHandle } from "./types";
import "./pyraView.css";

interface PyraminxSceneProps {
  puzzle: PyraminxPuzzle;
  /** Fired when the user clicks near a vertex (action already accounts for inverse). */
  onPickFace?: (action: number) => void;
}

interface QueuedMove {
  action: number;
  resolve: () => void;
}

interface SceneApi {
  animate(action: number): Promise<void>;
  reset(): void;
  speed: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Three.js view of the Pyraminx.
 *
 * All transform bookkeeping lives in the framework-free `pyraScene` model: the
 * 36 stickers and 4 caps never move permanently, only their colour follows the
 * engine state, and a turn is a temporary pivot rotation that is always rolled
 * back explicitly. This component only owns the WebGL renderer, the camera, the
 * lighting and a **serialized** move queue: at most one layer animates at a
 * time, so animations can never overlap or leave a sticker displaced.
 */
export const PyraminxScene = forwardRef<PuzzleViewHandle, PyraminxSceneProps>(
  function PyraminxScene({ puzzle, onPickFace }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const onPickFaceRef = useRef(onPickFace);
    onPickFaceRef.current = onPickFace;
    const apiRef = useRef<SceneApi | null>(null);

    useImperativeHandle(ref, () => ({
      animate: (a) => (apiRef.current ? apiRef.current.animate(a) : Promise.resolve()),
      reset: () => apiRef.current?.reset(),
      setSpeed: (ms) => {
        if (apiRef.current) apiRef.current.speed = ms;
      },
    }));

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let disposed = false;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(3.7, 3.1, 4.5);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.enablePan = false;
      controls.minDistance = 3.4;
      controls.maxDistance = 11;
      controls.rotateSpeed = 0.85;
      controls.target.set(0, 0, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6472, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(6, 9, 7);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 2;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -4;
      key.shadow.bias = -0.002;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.6);
      rim.position.set(-6, -4, -6);
      scene.add(rim);

      // Soft shadow on a ground plane (the puzzle itself does not touch it).
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(3.6, 64).rotateX(-Math.PI / 2),
        new THREE.ShadowMaterial({ opacity: 0.3 }),
      );
      ground.position.y = -1.7;
      ground.receiveShadow = true;
      scene.add(ground);

      // Everything the puzzle is made of is built once, here, and disposed in
      // the cleanup. StrictMode's double effect therefore rebuilds a fresh
      // model and drops the first one — never two overlapping sets of meshes.
      const built = buildPyraminxScene(puzzle);
      scene.add(built.root);

      const vertexAxes = puzzle.vertices.map((v) => {
        const u = unit(v);
        return new THREE.Vector3(u[0], u[1], u[2]);
      });

      // --- Serialized move queue: one layer animation at a time. -------------
      const queue: QueuedMove[] = [];
      let running = false;
      let generation = 0;

      function pump(): void {
        if (disposed || running || queue.length === 0) return;
        const job = queue.shift()!;
        running = true;
        const gen = ++generation;
        const duration = reduced ? 0 : apiRef.current?.speed ?? 260;
        built.beginMove(job.action);

        const finishJob = () => {
          running = false;
          job.resolve();
          pump();
        };

        if (duration <= 0) {
          built.commitMove();
          finishJob();
          return;
        }

        const start = performance.now();
        const step = () => {
          if (disposed || gen !== generation) {
            job.resolve();
            return;
          }
          const t = Math.min(1, (performance.now() - start) / duration);
          built.setProgress(easeInOut(t));
          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            built.commitMove();
            finishJob();
          }
        };
        requestAnimationFrame(step);
      }

      function animate(action: number): Promise<void> {
        return new Promise<void>((resolve) => {
          queue.push({ action, resolve });
          pump();
        });
      }

      function reset(): void {
        generation++;
        running = false;
        while (queue.length > 0) queue.shift()!.resolve();
        built.reset();
      }

      apiRef.current = { animate, reset, speed: 260 };
      if (reduced) apiRef.current.speed = 0;

      // --- Vertex picker: a plain click turns the nearest vertex. ------------
      const raycaster = new THREE.Raycaster();
      let downX = 0;
      let downY = 0;
      let downT = 0;

      function handlePointerDown(e: PointerEvent): void {
        if (e.button !== 0) return;
        downX = e.clientX;
        downY = e.clientY;
        downT = performance.now();
      }

      function handlePointerUp(e: PointerEvent): void {
        if (e.button !== 0) return;
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved > 6 || performance.now() - downT > 500) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(built.body, false);
        if (hits.length === 0) return;
        const point = hits[0].point.clone().normalize();
        let best = -1;
        let bestDot = -Infinity;
        for (let v = 0; v < 4; v++) {
          const d = point.dot(vertexAxes[v]);
          if (d > bestDot) {
            bestDot = d;
            best = v;
          }
        }
        if (best >= 0) {
          const inverse = e.shiftKey || e.altKey;
          const action = inverse ? 2 * best + 1 : 2 * best;
          onPickFaceRef.current?.(action);
        }
      }

      const el = renderer.domElement;
      el.addEventListener("pointerdown", handlePointerDown);
      el.addEventListener("pointerup", handlePointerUp);

      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      const resize = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(mount);

      return () => {
        disposed = true;
        generation++;
        running = false;
        while (queue.length > 0) queue.shift()!.resolve();
        cancelAnimationFrame(raf);
        observer.disconnect();
        el.removeEventListener("pointerdown", handlePointerDown);
        el.removeEventListener("pointerup", handlePointerUp);
        controls.dispose();
        built.dispose();
        ground.geometry.dispose();
        (ground.material as THREE.Material).dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        apiRef.current = null;
      };
    }, [puzzle]);

    return (
      <div className="pyra-view" ref={mountRef} aria-label="Vue 3D du Pyraminx" role="img">
        <span className="pyra-hint">
          cliquez près d'un sommet pour tourner · Maj ou Alt + clic pour l'inverse
        </span>
      </div>
    );
  },
);
