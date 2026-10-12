import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MegaminxPuzzle } from "../../engine";
import { buildMegaminxScene } from "./minxScene";
import type { PuzzleViewHandle } from "./types";
import "./minxView.css";

interface MegaminxSceneProps {
  puzzle: MegaminxPuzzle;
  /** Fired when the user clicks a face (action is already the inverse-appropriate move). */
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
 * Three.js view of the Megaminx.
 *
 * All transform bookkeeping lives in the framework-free `minxScene` model: the
 * 132 stickers never move permanently, only their colour follows the engine
 * state, and a turn is a temporary pivot rotation that is always rolled back
 * explicitly. This component only owns the WebGL renderer, the camera, the
 * lighting and a **serialized** move queue: at most one layer animates at a
 * time, so animations can never overlap or leave a sticker displaced.
 */
export const MegaminxScene = forwardRef<PuzzleViewHandle, MegaminxSceneProps>(
  function MegaminxScene({ puzzle, onPickFace }, ref) {
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
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(4.9, 3.4, 5.7);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.enablePan = false;
      controls.minDistance = 5;
      controls.maxDistance = 13;
      controls.rotateSpeed = 0.85;
      controls.target.set(0, 0.05, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6472, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(6, 9, 7);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 2;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -5;
      key.shadow.camera.right = 5;
      key.shadow.camera.top = 5;
      key.shadow.camera.bottom = -5;
      key.shadow.bias = -0.002;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.6);
      rim.position.set(-6, -4, -6);
      scene.add(rim);

      // Soft shadow on a ground plane (the puzzle itself does not touch it).
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(4.4, 64).rotateX(-Math.PI / 2),
        new THREE.ShadowMaterial({ opacity: 0.3 }),
      );
      ground.position.y = -2.05;
      ground.receiveShadow = true;
      scene.add(ground);

      // Everything the puzzle is made of is built once, here, and disposed in
      // the cleanup. StrictMode's double effect therefore rebuilds a fresh
      // model and drops the first one — never two overlapping sets of meshes.
      const built = buildMegaminxScene(puzzle);
      scene.add(built.root);

      // --- Serialized move queue: one layer animation at a time. -------------
      const queue: QueuedMove[] = [];
      let running = false;
      // Bumped on reset/unmount so stale animation frames become no-ops without
      // touching the shared state of the move that replaced them.
      let generation = 0;

      function pump(): void {
        if (disposed || running || queue.length === 0) return;
        const job = queue.shift()!;
        running = true;
        const gen = ++generation;
        const duration = reduced ? 0 : apiRef.current?.speed ?? 280;
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
            // Cancelled (reset/unmount): never touch `running`; the reset path
            // has already cleared it and the model has rolled the layer back.
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

      apiRef.current = { animate, reset, speed: 280 };
      if (reduced) apiRef.current.speed = 0;

      // --- Face picker: a plain click turns the clicked face. -----------------
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
        const nrm = (hits[0].normal as THREE.Vector3).clone().normalize();
        let best = -1;
        let bestDot = -Infinity;
        for (let g = 0; g < 12; g++) {
          const d = nrm.dot(built.axes[2 * g]);
          if (d > bestDot) {
            bestDot = d;
            best = g;
          }
        }
        if (best >= 0 && bestDot > 0.95) {
          const inverse = e.shiftKey || e.altKey;
          const action = inverse ? 2 * best : 2 * best + 1;
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
      <div className="minx-view" ref={mountRef} aria-label="Vue 3D du Megaminx" role="img">
        <span className="minx-hint">cliquez une face pour la tourner · Maj ou Alt + clic pour l'inverse</span>
      </div>
    );
  },
);
