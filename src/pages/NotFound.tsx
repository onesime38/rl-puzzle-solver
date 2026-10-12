import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="container notfound">
      <p className="notfound__code" aria-hidden="true">
        404
      </p>
      <h1>Page introuvable</h1>
      <p className="muted">
        La page demandée n'existe pas. Revenez à l'accueil ou ouvrez directement le simulateur.
      </p>
      <div className="hero__cta">
        <Link to="/" className="btn btn--primary">
          Retour à l'accueil
        </Link>
        <Link to="/simulateur" className="btn">
          Ouvrir le simulateur
        </Link>
      </div>
    </div>
  );
}