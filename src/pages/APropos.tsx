import { Link } from "react-router-dom";
import { PROJECT } from "../config/project";
import "./apropos.css";

export function AProposPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>À propos</h1>
        <p>{PROJECT.description}</p>
      </header>

      <div className="prose">
        <section>
          <h2>Objectif pédagogique</h2>
          <p>
            Ce mini-projet illustre concrètement les notions du module{" "}
            <strong>{PROJECT.module}</strong> : un <strong>processus de décision markovien</strong>{" "}
            (états, actions, transitions stochastiques, récompense, actualisation) résolu par trois
            familles d'algorithmes — apprentissage tabulaire par différence temporelle
            (Q-learning), sa variante corrigeant le biais de surestimation (Double Q-learning), et
            la résolution exacte par itération de valeur sur le graphe explicite du processus.
          </p>
          <p>
            L'application est entièrement interactive et reproductible : les mêmes semences
            produisent les mêmes mesures, exposées sur la page <Link to="/resultats">Résultats</Link>{" "}
            et expliquées sur la page <Link to="/algorithmes">Algorithmes</Link>.
          </p>
        </section>

        <section>
          <h2>Ce que le projet démontre</h2>
          <ul>
            <li>Modélisation rigoureuse d'un puzzle comme MDP stochastique.</li>
            <li>
              Apprentissage par curriculum avec rejeu rétrospectif pour stabiliser le Q-learning.
            </li>
            <li>
              Comparaison entre apprentissage échantillonné (Q-learning, Double Q-learning) et
              résolution exacte (MDP par itération de valeur).
            </li>
            <li>
              Mise en évidence honnête de la limite du Q-learning tabulaire sur un espace d'états
              de taille 4,3·10¹⁹.
            </li>
          </ul>
        </section>

        <section>
          <h2>Perspectives</h2>
          <p>
            Le prolongement naturel est le <strong>Deep Q-Network</strong> (DQN), qui remplace la
            table Q par un réseau de neurones et permet de généraliser au cube complet. Le DQN
            n'est <em>pas</em> implémenté ici : il est mentionné comme ouverture, sans prétendre
            résoudre le cube en entier.
          </p>
        </section>

        <section>
          <h2>Équipe et encadrement</h2>
          <dl className="meta">
            <div>
              <dt>Établissement</dt>
              <dd>{PROJECT.institution}</dd>
            </div>
            <div>
              <dt>Filière</dt>
              <dd>{PROJECT.degree}</dd>
            </div>
            <div>
              <dt>Module</dt>
              <dd>{PROJECT.module}</dd>
            </div>
            <div>
              <dt>Année universitaire</dt>
              <dd>{PROJECT.academicYear}</dd>
            </div>
            <div>
              <dt>Enseignant responsable</dt>
              <dd>{PROJECT.professor}</dd>
            </div>
            <div>
              <dt>Équipe</dt>
              <dd>
                <ul className="team">
                  {PROJECT.team.map((member) => (
                    <li key={member}>{member}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2>Technologies</h2>
          <p>
            TypeScript, React et Vite pour l'interface ; Three.js pour la vue 3D du cube ; KaTeX
            pour les formules ; uPlot pour les courbes ; Web Workers pour l'entraînement hors du
            fil principal ; Vitest pour les tests du moteur et des agents.
          </p>
        </section>
      </div>
    </div>
  );
}