// The single source of design tokens (ENGINEERING.md §17.3 rule 4). CSS custom
// properties are generated from this object at startup, and a future native
// theme can be generated from the same file. Components use the properties,
// never literal colours.
export const tokens = {
  color: {
    canvas: "#071513",
    surface: "#10251e",
    deep: "#182f26",
    ink: "#f9efda",
    muted: "#bacbc0",
    brass: "#dfc397",
    brassDark: "#a88a5a",
    brassInk: "#122119",
    jade: "#8cc6aa",
    jadeStrong: "#5fae8a",
    jadeDark: "#3b7a5f",
    jadeInk: "#0d2a1f",
    coral: "#e5a084",
    coralDark: "#c7664a",
    flame: "#ff9f43",
    gold: "#ffd76a",
    bubble: "#f7efdc",
    bubbleInk: "#1a2520",
    bubbleEmphasis: "#2d6b51",
    sheet: "#14352a",
    sheetInk: "#f9efda",
    line: "#ffffff26",
    shade: "#00000040",
    boardLight: "#e4dcc4",
    boardDark: "#7f9c8c",
    frame: "#a68a5b",
    // Feedback tiers (design §3.2): every tier also has text in the tries chip.
    tierMissed: "#dfc397",
    tierWorse: "#e5a084",
    tierCostly: "#c7664a",
    tierBest: "#8cc6aa",
  },
  font: {
    display: '"Newsreader", Georgia, serif',
    body: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
    chess:
      '"Arial Unicode MS", "Segoe UI Symbol", "Noto Sans Symbols 2", serif',
  },
  radius: {
    control: "14px",
    card: "18px",
    sheet: "22px",
    pill: "999px",
  },
  shadow: {
    press: "0 5px 0",
    card: "0 4px 0 #0003",
    float: "0 10px 24px #0005",
    sheet: "0 -10px 30px #0006",
  },
  motion: {
    fast: "80ms",
    base: "350ms",
    slow: "450ms",
    spring: "cubic-bezier(0.2, 1.3, 0.4, 1)",
  },
  space: {
    gutter: "16px",
    target: "44px",
  },
} as const;

type Group = Record<string, string>;

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

// "--ui-color-brass-dark" and so on.
export function tokenProperties(
  source: Record<string, Group> = tokens,
): ReadonlyMap<string, string> {
  const properties = new Map<string, string>();
  for (const [group, values] of Object.entries(source))
    for (const [name, value] of Object.entries(values))
      properties.set(`--ui-${kebab(group)}-${kebab(name)}`, value);
  return properties;
}
