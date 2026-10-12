import { Link } from "react-router-dom";
import { CONTACT, PROJECT } from "../../config/project";
import "./footer.css";

const ROUTES = [
  { to: "/", label: "Accueil" },
  { to: "/simulateur/cube", label: "Simulateur — Cube" },
  { to: "/simulateur/megaminx", label: "Simulateur — Megaminx" },
  { to: "/algorithmes", label: "Algorithmes" },
  { to: "/resultats", label: "Résultats" },
  { to: "/a-propos", label: "À propos" },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div>
            <h3 className="site-footer__title">{PROJECT.name}</h3>
            <p className="small muted">{PROJECT.description}</p>
          </div>
          <nav aria-label="Navigation du pied de page">
            <h4>Navigation</h4>
            <ul>
              {ROUTES.map((route) => (
                <li key={route.to}>
                  <Link to={route.to}>{route.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h4>Informations académiques</h4>
            <ul className="site-footer__academic">
              <li>{PROJECT.degree}</li>
              <li>{PROJECT.institution}</li>
              <li>Module : {PROJECT.module}</li>
              <li>Année universitaire : {PROJECT.academicYear}</li>
            </ul>
            <h4>Équipe</h4>
            <ul>
              {PROJECT.team.map((member) => (
                <li key={member}>{member}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="site-footer__bar">
          <span>{CONTACT}</span>
          <span>
            <a href={PROJECT.repository} target="_blank" rel="noreferrer">
              Dépôt du projet
            </a>
            <span aria-hidden="true"> · </span>
            <a href="#top">Haut de page</a>
          </span>
        </div>
      </div>
    </footer>
  );
}