import type { CarbAmpelPhase } from "../types";

const dotClass: Record<string, string> = {
  red: "ampel-red",
  yellow: "ampel-yellow",
  green: "ampel-green"
};

export default function CarbAmpel({ phases }: { phases: CarbAmpelPhase[] }) {
  return (
    <div className="ampel">
      {phases.map((p) => (
        <div key={p.key} className="ampel-item">
          <span className={"ampel-dot " + (dotClass[p.color] || "ampel-green")}>
            ●
          </span>
          <div>
            <span className="ampel-label">
              {p.label} · <strong>{p.carbsG} g KH</strong>
            </span>
            <p className="ampel-explain">{p.explanation}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
