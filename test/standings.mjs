// Imprime la clasificación actual a partir de data.js (mismo cálculo que la web).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(dir, "..", p), "utf8");
const sandbox = { document: { getElementById: () => null, addEventListener: () => {} }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  [read("dist/config.js"), read("data.js"), read("dist/app.js"),
   "globalThis.__a = { compute, participantPoints, CONFIG };"].join("\n;\n"),
  sandbox
);
const { compute, participantPoints, CONFIG } = sandbox.__a;
const table = compute(sandbox.window.POOL_DATA);
const r1 = (n) => Math.round(n * 10) / 10;

CONFIG.participants
  .map((p) => ({ p, pts: participantPoints(p, table) }))
  .sort((a, b) => b.pts - a.pts)
  .forEach((row, i) => {
    const det = row.p.teams
      .map((e) => `${e} ${r1(table.get(e)?.total ?? 0)}`)
      .join(", ");
    console.log(`${i + 1}. ${row.p.name.padEnd(7)} ${String(r1(row.pts)).padStart(5)}   (${det})`);
  });
