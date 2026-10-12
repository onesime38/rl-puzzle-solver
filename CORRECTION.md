# CORRECTION — the second puzzle is a PYRAMINX, not a Megaminx

## What changed
The professor wants a **Rubik's-cube-like puzzle shaped like a tetrahedron: the Pyraminx**, in its
standard **"without tips"** variant (the four small vertex tips are fixed). The previous choice — a
Megaminx (dodecahedron) — is **removed completely** (engine, tests, benchmark, UI texts, pages,
README, results, 3D view). The simulator now offers two puzzles: **Cube 3×3×3** and **Pyraminx**.

Everything else is unchanged: the three imposed algorithms (Q-learning, Double Q-learning, MDP with
value iteration), the curriculum, pessimistic initialisation (−15), retrospective replay, the
French UI, the multi-page layout with header and footer, the buttons (Start, Résoudre, Mélanger,
Remettre résolu, Réinitialiser l'agent), the step-duration slider, the comparison table, the exports.

A **bounded look-ahead planner** ("planification à horizon k") is added on top of the tabular
agents: at solve time the agent performs a depth-limited search over the learned Q-table, which
extends the reach to the full diameter without retraining. It is off for the cube and on by default
for the Pyraminx (k = 4).

## 1. Reference engine (read first)
`reference/pyraminx-engine-reference.js` is a **validated** reference implementation (plain
JavaScript, run with node). It builds the tetrahedron from its four vertices, creates **36
stickers** (4 triangular faces × 9 small triangles), and **derives each move's permutation
geometrically**. Port it to TypeScript in `src/engine/pyraminx.ts`; do not re-invent the geometry.

Required unit tests (all pass in the reference):
- 36 stickers; a vertex layer moves 12 stickers (including its tip).
- Every move has order 3; a move followed by its inverse is the identity; opposite vertices commute.
- Scramble then inverse sequence = solved.
- **Exactly 933 120 states**; sphere sizes d = 0..11:
  `1, 8, 48, 288, 1728, 9896, 51808, 220111, 480467, 166276, 2457, 32` (diameter 11).

Model:
- State: `Uint8Array(36)`, solved state = colour of each sticker is its face index (0..3).
- Actions: **8** (4 vertices × {+120°, −120°}), stored in pairs (a, a^1 = inverse), named
  `U, U', L, L', R, R', B, B'`.
- **State key**: 5 words of 16 bits (packed base-4 over the 36 stickers) — unambiguous despite the
  4 colours, and cheap to hash.
- Reward −1 per move, 0 at the solved state (absorbing), stochastic slip with probability p, γ, ε, α
  as before.

## 2. Honest limits and the full solution (measured)
The Pyraminx is **finite and small**: 933 120 states, diameter 11. Therefore no tabular limit is
reached and the puzzle is solved completely:
- **MDP (full graph + value iteration)**: 933 120 states, ≈ 26 iterations, **100 % success**,
  optimal (mean 7.8 moves on uniform states). Built in the Web Worker with a progress indicator and
  a cancel button; typed arrays only, target < 120 MB.
- **Q-learning and Double Q-learning**: reliable up to **depth 8**. Greedy success 100 % up to 6,
  ≈ 94–95 % at 7, ≈ 91–94 % at 8; about 11–13 s, ~1 M episodes, 500–600 k states.
- **Planning (horizon k = 4)**: with the table trained to depth 8, bounded look-ahead reaches
  100 % at depths 8–12 and on uniform states, in 10–60 ms. Reach = trained depth + k = 12 ≥ 11 →
  "couverture complète".
- Convergence rule: increase the curriculum level when the success rate is ≥ 95 % **measured at the
  current level**; stop at ≥ 95 % on fresh depth-8 scrambles, cap 3 000 000 episodes.
- The UI and the Algorithmes page state clearly that the Pyraminx is solved for all scrambles
  (Q-learning up to N′ moves, then planning), and why. Mention Deep Q-Networks as a perspective
  only.
- Update the benchmark script and `results.json`; every number shown in the UI comes from real
  measurements.

## 3. 3D view of the Pyraminx (Three.js / react-three-fiber)
A **black tetrahedron body** with **36 flat coloured triangular stickers**, thin black gaps, slight
sticker lift, same lighting / orbit controls / theme handling as the cube, loaded with
`dynamic(..., { ssr: false })`.
- Build the body and the stickers from the engine's own data (4 vertices, 4 face normals, ordered
  sticker triangles), so the 3D orientation matches the logical state exactly.
- Shrink each sticker triangle slightly toward its centroid (9 %) and lift it a hair above the face
  to create the gaps; colours red / yellow / green / blue by face.
- Move animation (duration from the step-duration slider, ease in-out): the 12 stickers of the layer
  (plus a black "cap" tetrahedron) are re-parented to a temporary group that rotates by ±120° about
  the origin→vertex axis, then the logical state is applied and the stickers are recoloured. After
  every move the displayed colours must equal the engine state exactly (Vitest test with WebGL
  mocked, for all 8 actions and a random scramble).
- Interaction: orbit with mouse/touch; an optional vertex picker (click near a vertex to turn it
  clockwise, shift/alt-click for the inverse) in addition to the 8 move buttons grouped by vertex.
- Initial camera: slightly above and rotated so that 3 faces are visible.

## 4. Updates elsewhere
- Replace every mention of "Megaminx" by "Pyraminx" (home page cards, simulator choice screen,
  routes `/simulateur/pyraminx`, algorithm pages, results tables, README, footer description).
  Rename engine files, tests and benchmark entries.
- The choice screen shows two cards: "Cube 3×3×3" and "Pyraminx (tétraèdre)", each with a small
  3D-looking preview or illustration (no emojis).
- Start and Résoudre must be clearly shown for both puzzles.
- Results page: add an "Écart à l'optimal" table (pure vs planning mean moves versus the MDP
  optimum) and a pure-vs-planning robustness table.

## 5. Work plan
1. Port and test the Pyraminx engine (all tests above).
2. Adapt the agents (per-puzzle `maxDepth`, `stepMul`, `stepAdd`, word-based keys, planner) and the
   benchmark; report the measured table (depth × algorithm, pure and planning).
3. Build the 3D Pyraminx view and the animations.
4. Update pages, texts, routes, README, results.
5. Run `npm run build`, then start the dev server and report the measured table.
