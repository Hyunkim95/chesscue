type Point = readonly [x: number, y: number];

interface Constellation {
  readonly label: "start" | "end";
  readonly points: readonly Point[];
  readonly edges: readonly (readonly [number, number])[];
}

// Each shape has its own silhouette in the 288-unit-wide chart.
const shapes = [
  {
    label: "start",
    points: [
      [48, 64],
      [137, 113],
      [154, 45],
      [49, 173],
      [232, 126],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
    ],
  },
  {
    label: "end",
    points: [
      [142, 52],
      [78, 120],
      [226, 131],
      [48, 187],
      [159, 202],
      [235, 53],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [0, 5],
      [1, 3],
      [3, 4],
      [2, 4],
    ],
  },
  {
    label: "start",
    points: [
      [62, 58],
      [150, 91],
      [44, 137],
      [132, 186],
      [238, 152],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 3],
      [3, 4],
      [1, 4],
    ],
  },
  {
    label: "end",
    points: [
      [132, 63],
      [231, 61],
      [170, 132],
      [62, 141],
      [234, 199],
    ],
    edges: [
      [0, 1],
      [0, 2],
      [2, 3],
      [1, 4],
      [2, 4],
    ],
  },
] as const satisfies readonly Constellation[];

const stageShapes: ReadonlyMap<string, Constellation> = new Map<
  string,
  Constellation
>([
  ["play-safely", shapes[0]],
  ["create-and-answer-threats", shapes[1]],
  ["calculate-and-convert", shapes[2]],
  ["make-a-plan", shapes[3]],
]);

export function constellationFor(
  stageId: string,
  index: number,
  unitCount: number,
) {
  const shape =
    stageShapes.get(stageId) ?? shapes[index % shapes.length] ?? shapes[0];
  const points = Array.from({ length: unitCount }, (_, unitIndex): Point => {
    const point = shape.points[unitIndex];
    if (point) return point;

    const extra = unitIndex - shape.points.length;
    return [48 + (extra % 3) * 96, 265 + Math.floor(extra / 3) * 68];
  });
  const edges: (readonly [number, number])[] = [...shape.edges];
  for (let unit = shape.points.length; unit < unitCount; unit += 1) {
    edges.push([unit - 1, unit]);
  }

  return {
    points,
    edges,
    label: shape.label,
    height: Math.max(236, ...points.map(([, y]) => y + 54)),
  };
}
