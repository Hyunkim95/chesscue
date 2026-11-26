export const ranks = [
  { name: "Copper", floor: 0 },
  { name: "Jade", floor: 1150 },
  { name: "Sapphire", floor: 1350 },
  { name: "Amethyst", floor: 1550 },
  { name: "Crown", floor: 1750 },
] as const;
export const rankForElo = (elo: number) =>
  ranks.findLast((rank) => elo >= rank.floor) ?? ranks[0];
