import { Link } from "react-router-dom";
import { PyraminxGlyph } from "../components/PyraminxGlyph";
import "./home.css";

function CubeGlyph() {
  return (
    <svg viewBox="-60 -60 120 120" className="hero-svg" aria-hidden="true">
      <g stroke="#000000" strokeWidth="1.4" strokeLinejoin="round">
        <polygon points="-40,-52 40,-52 52,-40 -28,-40" fill="#f5f5f5" />
        <polygon points="-40,-52 -52,-40 -40,20 40,20 52,8 -40,-8" fill="#c8102e" />
        <polygon points="52,8 -40,8 -28,20 52,20" fill="#0057b8" />
        <path d="M -40 -8 L -28 -20 -52 -40" fill="none" />
        <path d="M -40 -8 L -28 8" fill="none" />
      </g>
    </svg>
  );
}

export function HomePage() {
  return (
    <div className="container">
      <section className="hero">
        <div className="hero__text">
          <p className="tag">Mini-projet — Processus stochastiques · M2IA</p>
          <h1>
            Un algorithme de renforcement
            <br />
            qui apprend à résoudre des puzzles.
          </h1>
          <p className="hero__lead">
            Trois agents — Q-learning, Double Q-learning et un processus de décision
            markovien — apprennent à redonner son état résolu à un <strong>Rubik's Cube
            3×3×3</strong> et à un <strong>Pyraminx</strong> (tétraèdre). Le tout repose
            sur un modèle markovien explicite : états, actions, récompenses et transitions
            stochastiques.
          </p>
          <div className="hero__cta">
            <Link to="/simulateur/cube" className="btn btn--primary">
              Explorer le cube 3×3×3
            </Link>
            <Link to="/simulateur/pyraminx" className="btn">
              Explorer le Pyraminx
            </Link>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <CubeGlyph />
          <PyraminxGlyph className="hero-svg" />
        </div>
      </section>
    </div>
  );
}
