const tabs = [
  {
    id: "review-home",
    label: "Review",
    icon: "M3 5h6c2 0 3 1 3 2 0-1 1-2 3-2h6v14h-6c-2 0-3 1-3 2 0-1-1-2-3-2H3z M12 7v14",
  },
  {
    id: "training",
    label: "Practice",
    icon: "M12 6v6 M5 16v-4h14v4 M9 2h6v4H9z M2 16h6v5H2z M16 16h6v5h-6z",
  },
  { id: "play", label: "Play", icon: "M7 3.5 20 12 7 20.5z" },
  {
    id: "race",
    label: "Social",
    icon: "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M5 20v-2a7 7 0 0 1 14 0v2 M18 5a3 3 0 0 1 0 6 M20 14a6 6 0 0 1 2 5 M6 5a3 3 0 0 0 0 6 M4 14a6 6 0 0 0-2 5",
  },
] as const;

export type PanelDestination = (typeof tabs)[number]["id"];

export function PanelTabs({
  current,
  onNavigate,
  placement = "bottom",
}: {
  current: string;
  placement?: "header" | "bottom";
  onNavigate: (destination: PanelDestination) => void;
}) {
  return (
    <nav
      aria-label="Primary navigation"
      className={"panel-tabs panel-tabs--" + placement}
    >
      {tabs.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          aria-current={current === id ? "page" : undefined}
          onClick={() => {
            onNavigate(id);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={icon} />
          </svg>
          {label}
        </button>
      ))}
    </nav>
  );
}
