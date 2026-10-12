import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Footer } from "./Footer";
import { Header } from "./Header";
import "./layout.css";

export function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
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