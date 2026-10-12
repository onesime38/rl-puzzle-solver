import { Link } from "react-router-dom";
import { buildCube, CUBE_COLORS } from "../engine";
import { MegaminxGlyph } from "../components/MegaminxGlyph";
import "./simulateur.css";

const cube = buildCube();

function CubePreview() {
  /* Slightly stylised flat projection of the solved cube: front, top and left bands. */
  const c = (face: number) => CUBE_COLORS[face];
  const solved = cube.solved;
  return (
    <svg viewBox="-120 -105 240 210" className="preview" aria-hidden="true">
      {/* Front face (z=+1) */}
      {[-1, 0, 1].map((r, ri) =>
        [-1, 0, 1].map((col, ci) => {
          const y = -r;
          const x = col;
          const idx = cube.stickers.findIndex(
            (s) => s.pos[0] === x && s.pos[1] === y && s.pos[2] === 1 && s.nrm[0] === 0 && s.nrm[1] === 0 && s.nrm[2] === 1,
          );
          return (
            <rect
              key={`f${ri}-${ci}`}
              x={col * 52 - 78}
              y={r * 52 - 78}
              width={50}
              height={50}
              fill={c(solved[idx])}
              stroke="#000000"
              strokeWidth="1.5"
            />
          );
        }),
      )}
      {/* Top face (y = +1) upper band */}
      {[-1, 0, 1].map((col, ci) => {
        const idx = cube.stickers.findIndex(
          (s) => s.pos[0] === col && s.pos[1] === 1 && s.pos[2] === 1 && s.nrm[0] === 0 && s.nrm[1] === 1 && s.nrm[2] === 0,
        );
        return (
          <rect
            key={`t${ci}`}
            x={(col + 1) * 52 - 78 + 26}
            y={-78 - 26}
            width={50}
            height={26}
            fill={c(solved[idx])}
            stroke="#000000"
            strokeWidth="1.5"
          />
        );
      })}
      {/* Left face (x = -1) side band */}
      {[-1, 0, 1].map((r, ri) => {
        const idx = cube.stickers.findIndex(
          (s) => s.pos[0] === -1 && s.pos[1] === r && s.pos[2] === 1 && s.nrm[0] === -1 && s.nrm[1] === 0 && s.nrm[2] === 0,
        );
        return (
          <rect
            key={`l${ri}`}
            x={-78 - 26}
            y={r * 52 - 78}
            width={26}
            height={50}
            fill={c(solved[idx])}
            stroke="#000000"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

export function SimulateurPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Simulateur</h1>
        <p>Choisissez un puzzle, puis lancez l'entraînement de l'agent de votre choix.</p>
      </header>

      <div className="puzzle-choice">
        <Link to="/simulateur/cube" className="puzzle-card">
          <CubePreview />
          <div>
            <h2>Cube 3×3×3</h2>
            <p>
              54 étiquettes, 12 quartiers de tour (U, U′, D, D′, L, L′, R, R′, F, F′, B, B′).
              Vue 3D animée.
            </p>
            <span className="btn btn--primary btn--sm">Ouvrir l'espace de travail</span>
          </div>
        </Link>

        <Link to="/simulateur/megaminx" className="puzzle-card">
          <MegaminxGlyph className="preview" />
          <div>
            <h2>Megaminx</h2>
            <p>
              132 étiquettes, 12 faces pentagonales, 24 rotations (F0, F0′, F1, F1′, …). Vue 3D
              animée, coups à la souris.
            </p>
            <span className="btn btn--primary btn--sm">Ouvrir l'espace de travail</span>
          </div>
        </Link>
      </div>

      <p className="small muted">
        Précédent : <Link to="/">Accueil</Link>. Explications théoriques :{" "}
        <Link to="/algorithmes">Algorithmes</Link>.
      </p>
    </div>
  );
}