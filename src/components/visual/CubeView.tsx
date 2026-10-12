import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CUBE_COLORS, type CubePuzzle } from "../../engine";
import type { PuzzleViewHandle } from "./types";
import "./cubeView.css";

interface Cubie {
  group: THREE.Group;
  stickers: THREE.Mesh[];
}

/**
 * Three.js view of the 3×3×3 cube. Quarter turns are animated by temporarily
 * attaching the affected layer to a pivot group, rotating it, then baking the
 * transform back into the cubies (the standard mechanical-cube technique).
 */
export const CubeView = forwardRef<PuzzleViewHandle, { puzzle: CubePuzzle }>(
  function CubeView({ puzzle }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<{ animate(a: number): Promise<void>; reset(): void; speed: number } | null>(null);

    useImperativeHandle(ref, () => ({
      animate: (a) => apiRef.current!.animate(a),
      reset: () => apiRef.current!.reset(),
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
      camera.position.set(4.4, 3.9, 5.6);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      mount.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.09;
      controls.enablePan = false;
      controls.minDistance = 4.4;
      controls.maxDistance = 12;
      controls.rotateSpeed = 0.85;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6472, 1.05));
      const key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(6, 9, 7);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.6);
      rim.position.set(-6, -4, -6);
      scene.add(rim);

      const root = new THREE.Group();
      scene.add(root);

      const plastic = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.72, metalness: 0.05 });
      const boxGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
      const planeGeo = new THREE.PlaneGeometry(0.82, 0.82);
      const forward = new THREE.Vector3(0, 0, 1);

      let cubies: Cubie[] = [];

      function buildCubies(): void {
        const byPos = new Map<string, Cubie>();
        for (const sticker of puzzle.stickers) {
          const [x, y, z] = sticker.pos;
          const keyId = `${x},${y},${z}`;
          let cubie = byPos.get(keyId);
          if (!cubie) {
            const group = new THREE.Group();
            group.position.set(x, y, z);
            group.add(new THREE.Mesh(boxGeo, plastic));
            root.add(group);
            cubie = { group, stickers: [] };
            byPos.set(keyId, cubie);
          }
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(CUBE_COLORS[sticker.face]),
            roughness: 0.42,
            metalness: 0.02,
          });
          const mesh = new THREE.Mesh(planeGeo, material);
          const nrm = new THREE.Vector3(...sticker.nrm);
          mesh.quaternion.setFromUnitVectors(forward, nrm);
          mesh.position.copy(nrm).multiplyScalar(0.5);
          cubie.group.add(mesh);
          cubie.stickers.push(mesh);
        }
        cubies = [...byPos.values()];
      }

      buildCubies();

      function easeInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      function setAngle(pivot: THREE.Group, axis: number, value: number): void {
        if (axis === 0) pivot.rotation.x = value;
        else if (axis === 1) pivot.rotation.y = value;
        else pivot.rotation.z = value;
      }

      function component(vec: THREE.Vector3, axis: number): number {
        return axis === 0 ? vec.x : axis === 1 ? vec.y : vec.z;
      }

      function animate(action: number): Promise<void> {
        const move = puzzle.moves[action];
        const target = move.angle * (Math.PI / 2);
        const layer = cubies.filter((c) => Math.round(component(c.group.position, move.axis)) === move.layer);
        const pivot = new THREE.Group();
        root.add(pivot);
        for (const cubie of layer) pivot.attach(cubie.group);

        const duration = reduced ? 0 : apiRef.current?.speed ?? 320;
        const start = performance.now();

        return new Promise((resolve) => {
          const step = () => {
            if (disposed) return;
            const t = duration <= 0 ? 1 : Math.min(1, (performance.now() - start) / duration);
            setAngle(pivot, move.axis, target * easeInOut(t));
            if (t < 1) {
              requestAnimationFrame(step);
            } else {
              setAngle(pivot, move.axis, target);
              pivot.updateMatrixWorld(true);
              for (const cubie of layer) {
                root.attach(cubie.group);
                cubie.group.position.set(
                  Math.round(cubie.group.position.x),
                  Math.round(cubie.group.position.y),
                  Math.round(cubie.group.position.z),
                );
                cubie.group.updateMatrixWorld(true);
              }
              root.remove(pivot);
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      }

      function reset(): void {
        for (const cubie of cubies) {
          root.remove(cubie.group);
          for (const sticker of cubie.stickers) {
            (sticker.material as THREE.Material).dispose();
          }
        }
        cubies = [];
        buildCubies();
      }

      apiRef.current = { animate, reset, speed: 320 };
      if (reduced) apiRef.current.speed = 0;

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
        cancelAnimationFrame(raf);
        observer.disconnect();
        controls.dispose();
        for (const cubie of cubies) {
          for (const sticker of cubie.stickers) (sticker.material as THREE.Material).dispose();
        }
        boxGeo.dispose();
        planeGeo.dispose();
        plastic.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
        apiRef.current = null;
      };
    }, [puzzle]);

    return <div className="cube-view" ref={mountRef} aria-label="Vue 3D du cube" role="img" />;
  },
);