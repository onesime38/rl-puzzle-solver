import { Link } from "react-router-dom";
import { CONTACT, PROJECT } from "../../config/project";
import "./footer.css";

const ROUTES = [
  { to: "/", label: "Accueil" },
  { to: "/simulateur", label: "Simulateur" },
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
        </div>
        <div className="site-footer__bar">
          <span>{CONTACT}</span>
          <span>
            <a href="#top">Haut de page</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
