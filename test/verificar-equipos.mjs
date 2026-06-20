// Comprueba que toda selección elegida por algún participante aparece en los
// datos descargados (si no, es que el nombre canónico de config.ts no coincide
// con el que devuelve la API y hay que añadir la entrada a NOMBRES).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(dir, "..", p), "utf8");

const sandbox = { window: undefined, document: { getElementById: () => null, addEventListener: () => {} }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  [read("dist/config.js"), read("datos.js"), "globalThis.__o = { CONFIG, PORRA_DATOS: window.PORRA_DATOS };"].join("\n;\n"),
  sandbox
);
const { CONFIG, PORRA_DATOS } = sandbox.__o;

const existentes = new Set();
for (const eqs of Object.values(PORRA_DATOS.grupos)) for (const e of eqs) existentes.add(e);
for (const p of PORRA_DATOS.partidos) { existentes.add(p.local); existentes.add(p.visitante); }

const elegidas = new Set(CONFIG.participantes.flatMap((p) => p.equipos));
const faltan = [...elegidas].filter((e) => !existentes.has(e)).sort();

if (faltan.length) {
  console.log("✗ Selecciones elegidas que NO aparecen en los datos:");
  for (const e of faltan) console.log("   -", e);
  process.exit(1);
}
console.log(`✓ Las ${elegidas.size} selecciones elegidas aparecen en los datos.`);
