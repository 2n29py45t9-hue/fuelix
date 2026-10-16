/* Mobile-Shell (DUO-32): Bottom-Navigation mit zentralem Log-FAB.
 * Der FAB ist die prominenteste Aktion - Logging in max. 3 Sekunden erreichbar.
 */
export default function BottomNav({
  active,
  onTab,
  onFab
}: {
  active: string;
  onTab: (t: "plan" | "trends" | "more") => void;
  onFab: () => void;
}) {
  const item = (tab: "plan" | "trends" | "more", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      className={"navitem" + (active === tab ? " active" : "")}
      onClick={() => onTab(tab)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        {item("plan", "Plan", (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 11h18" />
          </svg>
        ))}
        {item("trends", "Trends", (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </svg>
        ))}
        <button type="button" className="navfab" onClick={onFab} aria-label="Mahlzeit loggen">
          +
        </button>
        {item("more", "Mehr", (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        ))}
      </div>
    </nav>
  );
}
