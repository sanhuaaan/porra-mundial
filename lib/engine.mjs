// ───────────────────────────────────────────────────────────────────────────
// Cargador compartido del motor de la web para los scripts Node (notify.mjs y
// los de test/). Ejecuta los <script> clásicos (config + data + app) en un
// sandbox `vm` que imita el navegador (window/document) y devuelve sus globals.
// Así el cálculo de puntos en Node es EXACTAMENTE el mismo que ve el navegador.
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

// Raíz del repo (este fichero vive en lib/), para resolver rutas igual sea quien
// sea el que llame (raíz o test/).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Carga el motor y devuelve { CONFIG, POOL_DATA, compute, participantPoints,
// phaseProgress }. Opciones:
//   data    : objeto a inyectar como window.POOL_DATA; si se omite, lee data.js.
//   withApp : si false NO carga dist/app.js (solo CONFIG + datos), para usos que
//             únicamente necesitan la config y los datos (p. ej. verify-teams).
export function loadEngine({ data, withApp = true } = {}) {
  const sandbox = { document: { getElementById: () => null, addEventListener: () => {} }, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const dataJs = data !== undefined
    ? `window.POOL_DATA = ${JSON.stringify(data)};`
    : read("data.js");

  const parts = [read("dist/config.js"), dataJs];
  if (withApp) parts.push(read("dist/app.js"));
  // Expone los globals tras ejecutar los scripts. compute/participantPoints/
  // phaseProgress solo existen si se cargó app.js.
  parts.push(
    "globalThis.__engine = { CONFIG, POOL_DATA: window.POOL_DATA" +
      (withApp ? ", compute, participantPoints, phaseProgress" : "") + " };"
  );
  vm.runInContext(parts.join("\n;\n"), sandbox);

  return sandbox.__engine;
}

// Redondeo a 1 decimal, usado al imprimir puntuaciones.
export const round1 = (n) => Math.round(n * 10) / 10;
