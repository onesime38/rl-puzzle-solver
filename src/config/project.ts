/**
 * Project metadata and team information.
 * Edit the placeholder constants below before submission.
 */
export const PROJECT = {
  name: "RL Puzzle Solver",
  tagline: "Q-learning · Double Q-learning · Processus de décision markovien",
  description:
    "Application pédagogique où des agents d'apprentissage par renforcement apprennent à résoudre un Rubik's Cube 3×3×3 et un Megaminx (dodécaèdre).",
  repository: "https://github.com/anomalyco/rl-puzzle-solver",
  academicYear: "2025 – 2026",
  institution: "Université Ibn Tofaïl, Kénitra",
  degree: "Master Informatique et Intelligence Artificielle (M2IA)",
  module: "Processus stochastiques",
  professor: "À compléter", // TODO: name of the supervising professor
  team: [
    "Nahimana Onesime",
    "Coulibaly Dramane",
    "Ahmed Salem Chennan",
  ],
} as const;

export const CONTACT = `© ${new Date().getFullYear()} — Projet pédagogique · ${PROJECT.name}`;