import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { PROJECT } from "../../config/project";
import { useTheme } from "../../lib/theme";
import "./header.css";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/simulateur", label: "Simulateur" },
  { to: "/a-propos", label: "À propos" },
];

function ThemeIcon({ theme }: { theme: "light" | "dark" }) {
  if (theme === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <line x1="8" y1="1" x2="8" y2="2.4" />
          <line x1="8" y1="13.6" x2="8" y2="15" />
          <line x1="1" y1="8" x2="2.4" y2="8" />
          <line x1="13.6" y1="8" x2="15" y2="8" />
          <line x1="3.1" y1="3.1" x2="4.1" y2="4.1" />
          <line x1="11.9" y1="11.9" x2="12.9" y2="12.9" />
          <line x1="3.1" y1="12.9" x2="4.1" y2="11.9" />
          <line x1="11.9" y1="4.1" x2="12.9" y2="3.1" />
        </g>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5A5.3 5.3 0 0 1 8 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Header() {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <NavLink to="/" className="wordmark" aria-label={`${PROJECT.name} — accueil`}>
          <span className="wordmark__cube" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>{PROJECT.name}</strong>
            <small>cube 3×3×3 · pyraminx</small>
          </span>
        </NavLink>

        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
          title={theme === "dark" ? "Thème clair" : "Thème sombre"}
        >
          <ThemeIcon theme={theme} />
        </button>

        <button
          type="button"
          className={`burger ${open ? "is-open" : ""}`}
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id="site-nav" className={`site-nav ${open ? "is-open" : ""}`} ref={menuRef}>
          <ul>
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => (isActive ? "is-active" : undefined)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}