/**
 * Project metadata and team information.
 * Single place to edit everything shown on the "À propos" page and in the footer.
 */
export interface TeamMember {
  name: string;
  role: string;
  formation: string;
  /** Optional path to a photo; when absent a neutral monogram is shown. */
  photo?: string;
}

export interface ProjectInfo {
  name: string;
  tagline: string;
  description: string;
  /** One short paragraph used by the "Le projet" section. */
  summary: string;
  team: TeamMember[];
}

export const PROJECT: ProjectInfo = {
  name: "RL Puzzle Solver",
  tagline: "Q-learning · Double Q-learning · Processus de décision markovien",
  description:
    "Application pédagogique où des agents d'apprentissage par renforcement apprennent à résoudre un Rubik's Cube 3×3×3 et un Pyraminx (tétraèdre).",
  summary:
    "Mini-projet du module Processus stochastiques (sujet Gaming Design) : résolution du cube 3×3×3 et du Pyraminx par Q-learning, Double Q-learning et processus de décision markovien.",
  team: [
    {
      name: "NAHIMANA Onésime",
      role: "Chef de projet",
      formation: "Master Informatique et Intelligence Artificielle (M2IA)",
    },
    {
      name: "Coulibaly Dramane",
      role: "Membre de l'équipe",
      formation: "Master Informatique et Intelligence Artificielle (M2IA)",
    },
    {
      name: "Ahmed Salem Chennan",
      role: "Membre de l'équipe",
      formation: "Master Informatique et Intelligence Artificielle (M2IA)",
    },
  ],
};

export const CONTACT = `© ${new Date().getFullYear()} — Projet pédagogique · ${PROJECT.name}`;
