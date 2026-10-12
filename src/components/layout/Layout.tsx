import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PROJECT } from "../../config/project";
import { Footer } from "./Footer";
import { Header } from "./Header";
import "./layout.css";

const PAGE_TITLES: { path: string; label: string }[] = [
  { path: "/a-propos", label: "À propos" },
  { path: "/simulateur", label: "Simulateur" },
  { path: "/", label: "Accueil" },
];

function titleFor(pathname: string): string {
  const match = PAGE_TITLES.find((entry) =>
    entry.path === "/" ? pathname === "/" : pathname.startsWith(entry.path),
  );
  return match ? `${match.label} — ${PROJECT.name}` : PROJECT.name;
}

export function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleFor(pathname);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div id="top" className="app-shell">
      <a className="skip-link" href="#main">
        Aller au contenu principal
      </a>
      <Header />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}