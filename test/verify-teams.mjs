// Comprueba que toda selección elegida por algún participante aparece en los
// datos descargados (si no, es que el nombre canónico de config.ts no coincide
// con el que devuelve la API y hay que añadir la entrada a NAMES de update.mjs).
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
  [read("dist/config.js"), read("data.js"), "globalThis.__o = { CONFIG, POOL_DATA: window.POOL_DATA };"].join("\n;\n"),
  sandbox
);
const { CONFIG, POOL_DATA } = sandbox.__o;

const existing = new Set();
for (const teams of Object.values(POOL_DATA.groups)) for (const e of teams) existing.add(e);
for (const m of POOL_DATA.matches) { existing.add(m.home); existing.add(m.away); }

const chosen = new Set(CONFIG.participants.flatMap((p) => p.teams));
const missing = [...chosen].filter((e) => !existing.has(e)).sort();

if (missing.length) {
  console.log("✗ Selecciones elegidas que NO aparecen en los datos:");
  for (const e of missing) console.log("   -", e);
  process.exit(1);
}
console.log(`✓ Las ${chosen.size} selecciones elegidas aparecen en los datos.`);
