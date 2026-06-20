// Imprime la clasificación actual a partir de datos.js (mismo cálculo que la web).
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
  [read("dist/config.js"), read("datos.js"), read("dist/porra.js"),
   "globalThis.__a = { calcular, puntosParticipante, CONFIG };"].join("\n;\n"),
  sandbox
);
const { calcular, puntosParticipante, CONFIG } = sandbox.__a;
const tabla = calcular(sandbox.window.PORRA_DATOS);
const r1 = (n) => Math.round(n * 10) / 10;

CONFIG.participantes
  .map((p) => ({ p, pts: puntosParticipante(p, tabla) }))
  .sort((a, b) => b.pts - a.pts)
  .forEach((row, i) => {
    const det = row.p.equipos
      .map((e) => `${e} ${r1(tabla.get(e)?.total ?? 0)}`)
      .join(", ");
    console.log(`${i + 1}. ${row.p.nombre.padEnd(7)} ${String(r1(row.pts)).padStart(5)}   (${det})`);
  });
