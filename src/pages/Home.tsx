import { Link } from "react-router-dom";
import { rateFor } from "../data/results";
import { MegaminxGlyph } from "../components/MegaminxGlyph";
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

const STEPS = [
  {
    title: "Choisir un puzzle et un algorithme",
    body: "Cube 3×3×3 ou Megaminx, puis Q-learning, Double Q-learning ou l'agent markovien exact (MDP par itération de valeur).",
  },
  {
    title: "Lancer l'entraînement",
    body: "L'apprentissage se déroule hors du fil d'exécution principal (Web Worker). L'agent progresse par curriculum : il maîtrise les mélanges courts, puis les plus profonds, grâce au rejeu rétrospectif.",
  },
  {
    title: "Résoudre",
    body: "Une fois l'agent entraîné, « Résoudre » suit la politique apprise et rejoue la solution sur la vue 3D, coup par coup.",
  },
];

function cell(value: number | null): string {
  return value !== null ? `${value} %` : "—";
}

export function HomePage() {
  const cubeQ4 = rateFor("cube", "q", 4);
  const cubeDQ4 = rateFor("cube", "dq", 4);
  const cubeMDP5 = rateFor("cube", "mdp", 5);
  const minxMDP4 = rateFor("megaminx", "mdp", 4);

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
            3×3×3</strong> et à un <strong>Megaminx</strong> (dodécaèdre régulier). Le tout repose
            sur un modèle markovien explicite : états, actions, récompenses et transitions
            stochastiques.
          </p>
          <div className="hero__cta">
            <Link to="/simulateur/cube" className="btn btn--primary">
              Explorer le cube 3×3×3
            </Link>
            <Link to="/simulateur/megaminx" className="btn">
              Explorer le Megaminx
            </Link>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <CubeGlyph />
          <MegaminxGlyph className="hero-svg" />
        </div>
      </section>

      <section className="approach">
        <h2>Comment le problème est-il modélisé ?</h2>
        <div className="grid grid--4">
          <article className="card">
            <h3>Agent</h3>
            <p>Le programme d'apprentissage choisit, à chaque instant, une rotation à exécuter.</p>
          </article>
          <article className="card">
            <h3>États</h3>
            <p>Chaque configuration de couleurs est un état. Le cube compte 54 étiquettes, le Megaminx 132.</p>
          </article>
          <article className="card">
            <h3>Actions</h3>
            <p>
              Cube : 12 quartiers de tour (U, U', D, D', …). Megaminx : 24 rotations des 12 faces
              pentagonales (F0, F0', …).
            </p>
          </article>
          <article className="card">
            <h3>Récompense</h3>
            <p>−1 par coup, 0 à l'état résolu (état absorbant), actualisation à la fin de l'épisode.</p>
          </article>
        </div>
      </section>

      <section className="howto">
        <h2>Comment ça marche</h2>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="steps__num">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="results-teaser">
        <h2>Résultats mesurés</h2>
        <p>
          Chiffres réels, générés par le benchmark intégré au projet (fichier{" "}
          <code>src/data/results.json</code>) — rien n'est inventé ni précalculé.
        </p>
        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">
              Taux de résolution mesurés par le benchmark.
            </caption>
            <thead>
              <tr>
                <th scope="col">Puzzle</th>
                <th scope="col">Profondeur testée</th>
                <th scope="col">Q-learning</th>
                <th scope="col">Double Q-learning</th>
                <th scope="col">MDP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowSpan={2}>Cube 3×3×3</td>
                <td>4 coups</td>
                <td>{cell(cubeQ4)}</td>
                <td>{cell(cubeDQ4)}</td>
                <td>{cell(rateFor("cube", "mdp", 4))}</td>
              </tr>
              <tr>
                <td>5 coups</td>
                <td className="muted">{cell(rateFor("cube", "q", 5))}*</td>
                <td className="muted">{cell(rateFor("cube", "dq", 5))}*</td>
                <td>{cell(cubeMDP5)}</td>
              </tr>
              <tr>
                <td rowSpan={2}>Megaminx</td>
                <td>3 coups</td>
                <td>{cell(rateFor("megaminx", "q", 3))}</td>
                <td>{cell(rateFor("megaminx", "dq", 3))}</td>
                <td>{cell(rateFor("megaminx", "mdp", 3))}</td>
              </tr>
              <tr>
                <td>4 coups</td>
                <td className="muted">—</td>
                <td className="muted">—</td>
                <td>{cell(minxMDP4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">
          * Le tableau Q du 3×3×3 est limité par la mémoire (environ 1 million d'états à 6 coups) ;
          nous le présentons ici honnêtement. Détail complet sur la page{" "}
          <Link to="/resultats">Résultats</Link>.
        </p>
        <p className="note note--warn">
          Table Q quantitative : le cube 3×3×3 compte environ 4,3·10¹⁹ états. L'apprentissage
          tabulaire est donc restreint à des mélanges courts — la limite exacte est expliquée sur
          la page Algorithmes.
        </p>
      </section>
    </div>
  );
}