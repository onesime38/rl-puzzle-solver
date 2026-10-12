import { PROJECT, type TeamMember } from "../config/project";
import "./apropos.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function Member({ member, lead = false }: { member: TeamMember; lead?: boolean }) {
  return (
    <li className={`member${lead ? " member--lead" : ""}`}>
      <span className="member__avatar" aria-hidden="true">
        {member.photo ? (
          <img src={member.photo} alt="" />
        ) : (
          <span className="member__monogram">{initials(member.name)}</span>
        )}
      </span>
      <span className="member__info">
        <strong className="member__name">{member.name}</strong>
        <span className="member__role">{member.role}</span>
        <span className="member__formation muted">{member.formation}</span>
      </span>
    </li>
  );
}

export function AProposPage() {
  return (
    <div className="container">
      <header className="page-head">
        <h1>À propos</h1>
        <p>Le projet et l'équipe qui l'a mené.</p>
      </header>

      <div className="prose">
        <section>
          <h2>Le projet</h2>
          <h3>{PROJECT.name}</h3>
          <p>{PROJECT.summary}</p>
        </section>

        <section>
          <h2>L'équipe</h2>
          <ul className="team">
            {PROJECT.team.map((member, index) => (
              <Member key={member.name} member={member} lead={index === 0} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
