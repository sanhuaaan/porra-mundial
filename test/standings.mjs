// Imprime la clasificación actual a partir de data.js (mismo cálculo que la web).
import { loadEngine, round1 as r1 } from "../lib/engine.mjs";

const { compute, participantPoints, CONFIG, POOL_DATA } = loadEngine();
const table = compute(POOL_DATA);

CONFIG.participants
  .map((p) => ({ p, pts: participantPoints(p, table) }))
  .sort((a, b) => b.pts - a.pts)
  .forEach((row, i) => {
    const det = row.p.teams
      .map((e) => `${e} ${r1(table.get(e)?.total ?? 0)}`)
      .join(", ");
    console.log(`${i + 1}. ${row.p.name.padEnd(7)} ${String(r1(row.pts)).padStart(5)}   (${det})`);
  });
