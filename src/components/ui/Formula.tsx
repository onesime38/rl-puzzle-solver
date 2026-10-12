import katex from "katex";

interface FormulaProps {
  /** LaTeX source, e.g. `Q(s,a) \\leftarrow Q(s,a) + \\alpha [r + \\gamma \\max_{a'} Q(s',a') - Q(s,a)]`. */
  tex: string;
  /** Renders a display (block) formula. */
  block?: boolean;
}

/** Renders LaTeX via KaTeX with a stable computed aria-label. */
export function Formula({ tex, block = false }: FormulaProps) {
  const html = katex.renderToString(tex, { displayMode: block, throwOnError: false });
  const label = tex.replace(/[\\{}]/g, "");
  if (block) {
    return (
      <p
        className="formula"
        role="math"
        aria-label={label}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <span className="formula" role="math" aria-label={label} dangerouslySetInnerHTML={{ __html: html }} />;
}

import "./formula.css";