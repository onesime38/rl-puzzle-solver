# CORRECTION — the second puzzle is a MEGAMINX, not a "hexagon of rings"

## What went wrong
The professor wants a **Rubik's-cube-like puzzle in the shape of a polyhedron with hexagon-looking silhouette: the Megaminx** (dodecahedron, 12 pentagonal faces, 12 colours; each face has 1 centre piece, 5 edge pieces, 5 corner pieces). The "two rings of 6 cells" puzzle from the earlier specification was a wrong guess and must be **removed completely** (engine, tests, benchmark, UI texts, pages, README, results). The simulator now offers two puzzles: **Cube 3×3×3** and **Megaminx**.

Keep everything else unchanged: the three algorithms (Q-learning, Double Q-learning, MDP with value iteration), the curriculum, pessimistic initialisation (−15), retrospective replay, the French UI, the multi-page layout with header and footer, the buttons (Start, Résoudre, Mélanger, Remettre résolu, Réinitialiser l'agent), the step-duration slider, the comparison table, the exports.

Also fix the layout bug seen earlier: the puzzle view must live in a container with fixed aspect ratio, `position: relative`, `overflow: hidden`, and the controls must sit below it in normal flow, never overlapping.

## 1. Reference engine (read first)
I attach `megaminx-engine-reference.js`, a **validated** reference implementation (plain JavaScript, run with node). Port it to TypeScript in `src/engine/megaminx.ts`; do not re-invent the geometry. It builds the dodecahedron from golden-ratio coordinates, creates 132 stickers, and **derives each move's permutation geometrically**: a face turn rotates by ±72° about the face normal the 26 stickers of that layer (11 on the face + 15 on the five neighbouring faces) and each sticker is matched to the nearest sticker of the same type. Required unit tests (all pass in the reference): 132 stickers; 26 stickers per layer (25 move, the centre stays); every move has order 5; a move followed by its inverse is the identity; opposite faces commute; adjacent faces do not commute; scramble then inverse sequence = solved.

Model:
- State: `Uint8Array(132)`, solved state = colour of each sticker is its face index (0..11).
- Actions: **24** (12 faces × {+72°, −72°}), stored in pairs (a, a^1 = inverse).
- **State key**: because there are 12 colours, `array.join('')` is ambiguous. Build the key with `String.fromCharCode(65 + colour)` per sticker (132 characters). Add a test.
- Reward −1 per move, 0 at the solved state (absorbing), stochastic slip with probability p, γ, ε, α as before.

## 2. Honest limits for the Megaminx (measured)
The Megaminx has about 10^68 states, so tabular learning only works on a **bounded curriculum**. Measured with the reference engine:
- Exact number of states at distance d (d = 0..4): 1, 24, 408, 6208, 90144 (cumulative 96,785 up to d = 4).
- **MDP (BFS graph + value iteration)**: depth 3 → 6,641 states, 14 iterations, 100 % success, about 1 s; depth 4 → 96,785 states, 17 iterations, 100 % success, about 20 s in node (run it in the Web Worker with a progress indicator).
- **Q-learning and Double Q-learning at depth 3**: 89–96 % success after about 40,000–55,000 episodes (4–7 s), using ε = 0.2–0.3.
- **At depth 4** they do not converge in a reasonable time: about 72 % after 400,000 episodes (about 45 s) with roughly 800,000 visited states (heavy memory).
- Therefore: default `maxDepth` for the Megaminx = **3** for Q-learning and Double Q-learning (slider allows 4 with a visible memory/time warning); MDP allowed up to depth 4. For the cube keep `maxDepth` 5 as specified earlier. Make `maxDepth` a per-puzzle setting.
- To reduce visited states, exploration episodes should be short: use episode length `1·d + 3` steps (instead of `3·d + 6`) and ε = 0.2 for the Megaminx. Expose `stepMul` and `stepAdd` as agent options.
- Convergence rule: increase the curriculum level when the success rate is ≥ 95 % **measured at the current level**; declare convergence only from a measurement made at `maxDepth` (not from the stale rate of the previous level).
- The UI and the Algorithmes page must say clearly that the Megaminx is solved for scrambles up to N moves, and why (state-space size, tabular method). Mention Deep Q-Networks as a perspective only.
- Update the benchmark script and `results.json` with these puzzles; every number shown in the UI must come from real measurements.

## 3. 3D view of the Megaminx (Three.js / react-three-fiber)
It must look like the photo I will paste next to this file (a real black Megaminx with coloured stickers): a **dodecahedron body in black** with **132 flat coloured stickers**, thin black gaps, slight sticker thickness, glossy plastic look, soft shadow on a ground plane, same lighting/orbit controls/theme handling as the cube, loaded with `dynamic(..., { ssr: false })`.

- Build the body and the faces from the engine's own data (20 vertices, 12 face normals, face vertices ordered around each pentagon), so the 3D orientation matches the logical state exactly. Do not use `DodecahedronGeometry` with its own orientation.
- Sticker shapes on each pentagonal face (circumradius R, vertices V_0..V_4 in order): a **centre pentagon** (inner pentagon P_0..P_4 of radius 0.38 R, aligned with the vertices); **corner stickers** (quad V_i, point on edge V_iV_{i+1} at fraction 0.38, P_i, point on edge V_{i−1}V_i at fraction 0.62); **edge stickers** (quad between the two points at fractions 0.38 and 0.62 on edge V_iV_{i+1}, then P_{i+1} and P_i). Shrink each sticker polygon slightly toward its centroid to create the black gaps. Sticker index must follow the engine convention (face*11 + k).
- 12 distinct colours: white, light grey, yellow, beige, red, pink, blue, light blue, green, lime, purple, orange. Opposite faces should get contrasting pairs.
- Move animation (duration from the step-duration slider, ease in-out): the 26 stickers of the layer (plus a black pentagonal cap mesh that gives the layer its volume) are re-parented to a temporary group that rotates by ±72° about the face normal, then the logical state is applied and the stickers are recoloured. After every move the displayed colours must equal the engine state exactly (Vitest test with WebGL mocked, for all 24 actions and a random scramble).
- Interaction: orbit with mouse/touch; an optional face picker (click a face to turn it clockwise, shift/alt-click for the inverse) in addition to the 24 move buttons grouped by face.
- Initial camera: slightly above and rotated so that 3 faces are visible, like the photo.

## 4. Updates elsewhere
- Replace every mention of "hexagone" by "Megaminx" (home page cards, simulator choice screen, routes `/simulateur/megaminx`, algorithm pages, results tables, README, footer description). Rename engine files, tests and benchmark entries.
- The choice screen shows two cards: "Cube 3×3×3" and "Megaminx (dodécaèdre)", each with a small 3D-looking preview or illustration (no emojis).
- Start and Résoudre must be clearly shown for both puzzles.

## 5. Work plan
1. Port and test the Megaminx engine (all tests above).
2. Adapt the agents (per-puzzle `maxDepth`, `stepMul`, `stepAdd`, unambiguous keys) and the benchmark; report the measured table (depth × algorithm).
3. Build the 3D Megaminx view and the animations.
4. Update pages, texts, routes, README, results.
5. Fix the overlap layout bug, run `npm run build`, then start the dev server and tell me when ready.
