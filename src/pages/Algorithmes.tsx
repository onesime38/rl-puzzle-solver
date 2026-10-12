import { Formula } from "../components/ui/Formula";
import "./algorithmes.css";

function Code({ children, title }: { children: string; title?: string }) {
  return (
    <figure>
      {title ? <h4 className="code-title">{title}</h4> : null}
      <pre>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

const DISTANCES = [
  { d: 0, exact: "1", cumul: "1" },
  { d: 1, exact: "12", cumul: "13" },
  { d: 2, exact: "114", cumul: "127" },
  { d: 3, exact: "1 068", cumul: "1 195" },
  { d: 4, exact: "10 011", cumul: "11 206" },
  { d: 5, exact: "93 840", cumul: "105 046" },
  { d: 6, exact: "878 880", cumul: "983 926" },
];

/** Megaminx: exact/cumulative state counts measured by the engine (BFS). */
const MINX_DISTANCES = [
  { d: 0, exact: "1", cumul: "1" },
  { d: 1, exact: "24", cumul: "25" },
  { d: 2, exact: "408", cumul: "433" },
  { d: 3, exact: "6 208", cumul: "6 641" },
  { d: 4, exact: "90 144", cumul: "96 785" },
];

export function AlgorithmesPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>Algorithmes</h1>
        <p>
          Modélisation en processus de décision markovien et présentation des trois algorithmes
          imposés : Q-learning, Double Q-learning et itération de valeur sur le graphe explicite.
        </p>
      </header>

      <div className="prose">
        <section id="mdp">
          <h2>1. Le puzzle comme processus de décision markovien</h2>
          <p>
            Chaque puzzle est formalisé comme un <strong>processus de décision markovien</strong>{" "}
            (MDP) &lt;S, A, P, R, γ&gt; :
          </p>
          <ul>
            <li>
              <strong>États S</strong> : les configurations de couleurs. Cube : 54 étiquettes
              indexées par une chaîne de 54 caractères. Megaminx : 132 étiquettes (12 faces
              pentagonales × 11 pièces), indexées par une chaîne de 132 caractères.
            </li>
            <li>
              <strong>Actions A</strong> : les rotations. Cube : 12 quarts de tour
              (U, U′, D, D′, L, L′, R, R′, F, F′, B, B′) regroupés en paires inverse ; Megaminx :
              24 rotations — chaque face parmi les 12 peut tourner de ±72° (F0, F0′, F1, F1′, …),
              regroupées en paires inverse.
            </li>
            <li>
              <strong>Probabilités de transition P(s′&nbsp;|&nbsp;s, a)</strong> : la rotation est
              déterministe, mais avec une probabilité de glissement <code>p</code> une action
              aléatoire est exécutée à la place. Le processus est donc véritablement markovien et
              stochastique.
            </li>
            <li>
              <strong>Récompense R</strong> : −1 par coup, 0 à l'état résolu, qui est un état
              absorbant. L'agent minimise donc implicitement la longueur de la solution.
            </li>
            <li>
              <strong>Facteur d'actualisation γ</strong> : 0.95, priorité à court terme.
            </li>
          </ul>
          <p>
            L'objectif est la <strong>politique optimale</strong>{" "}
            <Formula tex="\pi^*(s) = \arg\max_a Q^*(s,a)" />, où la fonction de valeur optimale
            vérifie l'équation de Bellman :
          </p>
          <Formula
            block
            tex="V^*(s) = \max_{a \in A} \; \sum_{s' \in S} P(s' \mid s, a) \left[ R(s, a) + \gamma\, V^*(s') \right]"
          />
        </section>

        <section id="qlearning">
          <h2>2. Q-learning</h2>
          <p>
            L'agent (Watkins &amp; Dayan, 1992) maintient une table{" "}
            <Formula tex="Q(s, a)" /> estimée, initialisée <strong>pessimistiquement</strong> à une
            valeur faible (−15) pour que les états inconnus ne paraissent pas plus attractifs que la
            proximité du but. À chaque transition <Formula tex="(s, a, r, s')" />, il applique :
          </p>
          <Formula
            block
            tex="Q(s,a) \leftarrow Q(s,a) + \alpha \left[ r + \gamma \max_{a'} Q(s',a') - Q(s,a) \right]"
          />
          <p>
            La mise à jour pointe vers le maximum des valeurs du successeur, une cible
            « optimiste » qui peut surestimer ; c'est précisément ce que Double Q-learning corrige
            (section 3). L'exploration utilise une politique{" "}
            <strong>ε-greedy</strong> : l'action optimale selon Q avec probabilité 1−ε, une action
            aléatoire avec probabilité ε.
          </p>
          <Code title="Q-learning (par épisode)">
            {`pour chaque épisode :
    s ← mélange aléatoire de d coups (curriculum)
    tant que s ≠ résolu et pas < fin d'épisode :
        a ← ε-greedy(Q, s)
        a_real ← (aleatoire < p) ? action_aleatoire : a     # glissement
        s' ← appliquer(s, a_real)
        Q(s, a) ← Q(s,a) + α·[ r + γ·max_a' Q(s',a') − Q(s,a) ]
        s ← s'`}
          </Code>
        </section>

        <section id="double-q">
          <h2>3. Double Q-learning</h2>
          <p>
            van Hasselt (2010) montre que le <Formula tex="\max_{a'}" /> dans la cible de
            Q-learning introduit un <strong>biais de surestimation</strong> : le maximum de
            plusieurs estimations bruitées dépasse systématiquement la vraie valeur. Double
            Q-learning maintient <strong>deux tables indépendantes</strong>{" "}
            <Formula tex="Q_A" /> et <Formula tex="Q_B" /> et disperse ce biais :
          </p>
          <ul>
            <li>
              une pièce équitable décide quel tableau est <em>mis à jour</em> ;
            </li>
            <li>
              l'action est choisie par la table mise à jour, mais sa valeur est évaluée par
              l'autre table.
            </li>
          </ul>
          <Formula
            block
            tex="Q_A(s,a) \leftarrow Q_A(s,a) + \alpha\left[ r + \gamma\, Q_B\!\left(s',\, \arg\max_{a'} Q_A(s',a')\right) - Q_A(s,a)\right]"
          />
          <p>
            (mise à jour symétrique pour <Formula tex="Q_B" />, choisie avec probabilité 1/2). La
            politique d'action reste celle de la somme{" "}
            <Formula tex="Q_A + Q_B" />. Avec des tables initialisées à −15, la surestimation
            introduite par le max sur des états jamais vus est fortement réduite, ce qui stabilise
            la sélection d'actions près de l'objectif.
          </p>
        </section>

        <section id="mdp-value">
          <h2>4. Processus de Markov : graphe explicite et itération de valeur</h2>
          <p>
            Plutôt que d'échantillonner par épisodes, l'agent « MDP » <strong>construit
            explicitement le graphe d'états</strong> par un parcours en largeur depuis l'état
            résolu, jusqu'à la profondeur demandée. Il calcule ensuite la fonction de valeur par{" "}
            <strong>itération de valeur</strong>, en tenant compte du glissement : avec probabilité{" "}
            <Formula tex="p" /> la transition devient une action uniforme. La mise à jour s'écrit,
            <Formula tex="\bar{V} = \tfrac{1}{|A|}\sum_{a'} V(s'')" /> :
          </p>
          <Formula
            block
            tex="V_{k+1}(s) = \max_{a} \left[ -1 + \gamma\bigl((1-p)\, V_k(s') + p\, \bar{V} \bigr) \right]"
          />
          <p>
            L'algorithme s'arrête lorsque la variation maximale est inférieure à{" "}
            <code>10⁻⁶</code> ; la page Résultats affiche la courbe de convergence.
          </p>
          <Code title="Itération de valeur (MDP explicite)">
            {`construire le graphe    # BFS depuis l'état résolu, profondeur D
V ← 0
répéter jusqu'à max |ΔV| < 10⁻⁶ :
    V' ← V
    pour chaque état s :
        V'(s) ← max_a [ −1 + γ·((1−p)·V(suivant(s,a)) + p·moyenne) ]
    ΔV ← V' − V ; V ← V'`}
          </Code>
        </section>

        <section id="curriculum">
          <h2>5. Apprentissage par curriculum et rejeu rétrospectif</h2>
          <p>
            Un Q-learning naïf « s'enlise » dès la profondeur 3 : les valeurs mettent trop de temps
            à se propager depuis l'état résolu, et les états lointains semblent meilleurs que les
            proches. Trois mécanismes y remédient :
          </p>
          <ol>
            <li>
              <strong>Initialisation pessimiste</strong> des valeurs (−15) : les états inconnus
              sont nettement moins attractifs que ceux proches du but.
            </li>
            <li>
              <strong>Rejeu rétrospectif</strong> : à chaque épisode, on rejoue la trajectoire de
              mélange <em>à l'envers</em> (transitions réelles{" "}
              <Formula tex="s_i \to s_{i-1}" /> avec l'action inverse), ce qui propage rapidement
              les valeurs positives du résolu vers ses voisins.
            </li>
            <li>
              <strong>Curriculum</strong> : le niveau (profondeur de mélange) n'augmente que
              lorsque le taux de réussite dépasse 95 % sur 100 essais de test au niveau courant.
            </li>
          </ol>
        </section>

        <section id="limites">
          <h2>6. Taille de l'espace d'états et limites du tabulaire</h2>
          <p>
            Le cube 3×3×3 compte ≈ 4,33·10¹⁹ états : une table Q complète est impossible. Le
            curriculum restreint l'agent aux configurations proches du résolu. En métrique des
            quarts de tour, le nombre d'états à distance exacte <Formula tex="d" /> croît vite :
          </p>
          <div className="table-wrap">
            <table className="data">
              <caption>
                Nombre d'états du cube 3×3×3 à distance exacte <Formula tex="d" /> (métrique
                quarters de tour, source : littérature « God's number »).
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <Formula tex="d" />
                  </th>
                  <th scope="col">états exacts</th>
                  <th scope="col">cumul</th>
                </tr>
              </thead>
              <tbody>
                {DISTANCES.map((row) => (
                  <tr key={row.d}>
                    <td>{row.d}</td>
                    <td className="num">{row.exact}</td>
                    <td className="num">{row.cumul}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Le <strong>Megaminx</strong> possède environ 10<sup>68</sup> états : la même limite
            s'applique, encore plus tôt. En métrique des rotations d'une face (×72°), le nombre
            d'états atteignables croît ainsi (mesuré par le moteur, parcours en largeur) :
          </p>
          <div className="table-wrap">
            <table className="data">
              <caption>
                Nombre d'états du Megaminx à distance exacte <Formula tex="d" /> (mesuré par le
                moteur, référence de test).
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <Formula tex="d" />
                  </th>
                  <th scope="col">états exacts</th>
                  <th scope="col">cumul</th>
                </tr>
              </thead>
              <tbody>
                {MINX_DISTANCES.map((row) => (
                  <tr key={row.d}>
                    <td>{row.d}</td>
                    <td className="num">{row.exact}</td>
                    <td className="num">{row.cumul}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Jusqu'à 4 coups le graphe complet ne compte que <strong>96 785 états</strong>, que le
            MDP énumère et résout exactement (17 itérations d'itération de valeur). En revanche, le
            Q-learning tabulaire y devient vite trop coûteux en mémoire et en temps : il est fiable
            jusqu'à <strong>3 coups</strong> (96 % / 95 % pour Q / Double Q en ≈ 40 000–55 000
            épisodes) et ne converge plus raisonnablement au-delà.
          </p>
          <p>
            Même à profondeur 6 on approche déjà le million d'états : la mémoire est bornée (une
            grande <code>Float32Array</code> + une table d'index), et l'entraînement s'arrête
            proprement à la limite. C'est pourquoi l'application déclare clairement :
          </p>
          <p className="note note--warn">
            « Le cube est résolu pour des mélanges jusqu'à N coups, le Megaminx jusqu'à N′ coups
            (limite du Q-learning tabulaire) », N et N′ étant définis par les mesures du benchmark
            (page Résultats). Au-delà, une <em>perspective</em> est le Q-network profond (Deep
            Q-Network), cité comme prolongement dans la page À propos — jamais implémenté ici.
          </p>
        </section>
      </div>
    </div>
  );
}