// Prueba de humo del motor de puntuación. Usa un ESCENARIO FIJO (no el datos.js
// real, que cambia con cada actualización) y verifica los puntos contra valores
// calculados a mano. Carga config.js + porra.js en un único ámbito global, como
// hace el navegador con <script> clásicos.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(dir, "..", p), "utf8");

// Escenario de prueba: Grupo A completo + jornada 1 del resto + 1 dieciseisavos.
const FIXTURE = {
  actualizado: "2026-06-20T12:00:00.000Z",
  grupos: {
    A: ["España", "Sudáfrica", "Uzbekistán", "Catar"],
    E: ["Portugal", "Bosnia", "Ghana", "Japón"],
  },
  partidos: [
    { fase: "grupos", grupo: "A", jornada: 1, local: "España", visitante: "Sudáfrica", gl: 3, gv: 0, estado: "FINISHED" },
    { fase: "grupos", grupo: "A", jornada: 1, local: "Uzbekistán", visitante: "Catar", gl: 1, gv: 1, estado: "FINISHED" },
    { fase: "grupos", grupo: "A", jornada: 2, local: "España", visitante: "Uzbekistán", gl: 2, gv: 1, estado: "FINISHED" },
    { fase: "grupos", grupo: "A", jornada: 2, local: "Catar", visitante: "Sudáfrica", gl: 0, gv: 2, estado: "FINISHED" },
    { fase: "grupos", grupo: "A", jornada: 3, local: "España", visitante: "Catar", gl: 1, gv: 1, estado: "FINISHED" },
    { fase: "grupos", grupo: "A", jornada: 3, local: "Sudáfrica", visitante: "Uzbekistán", gl: 2, gv: 2, estado: "FINISHED" },
    { fase: "grupos", grupo: "E", jornada: 1, local: "Portugal", visitante: "Bosnia", gl: 2, gv: 0, estado: "FINISHED" },
    { fase: "dieciseisavos", local: "España", visitante: "Portugal", gl: 2, gv: 0, estado: "FINISHED" },
    { fase: "dieciseisavos", local: "Sudáfrica", visitante: "Senegal", gl: null, gv: null, estado: "SCHEDULED" },
  ],
};

const sandbox = {};
sandbox.window = sandbox;
sandbox.document = { getElementById: () => null, addEventListener: () => {} };
sandbox.console = console;
vm.createContext(sandbox);

const code = [
  read("dist/config.js"),
  `window.PORRA_DATOS = ${JSON.stringify(FIXTURE)};`,
  read("dist/porra.js"),
  "globalThis.__api = { calcular, puntosParticipante, CONFIG };",
].join("\n;\n");
vm.runInContext(code, sandbox);

const { calcular, puntosParticipante, CONFIG } = sandbox.__api;
const tabla = calcular(sandbox.window.PORRA_DATOS);

let fallos = 0;
const round1 = (n) => Math.round(n * 10) / 10;
function check(nombre, real, esperado) {
  const ok = round1(real) === round1(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}: ${round1(real)}${ok ? "" : `  (esperado ${esperado})`}`);
}

// España, grupo A:
//  Liguilla: 3-0(W,+3)=3+3 ; 2-1(W,+1)=3+1 ; 1-1(D,0)=1+0  -> 11
//  Bonus: pasaRonda +3 ; más goleador (GF6) +6 ; menos goleado (GA2) +6 -> 15
//  Dieciseisavos: gana 2-0 -> bono 6 + golaveraje 2 -> 8
//  Total = 11 + 15 + 8 = 34
check("España.ptsLiguilla", tabla.get("España").ptsLiguilla, 11);
check("España.bonus", tabla.get("España").bPasaRonda + tabla.get("España").bMasGoleador + tabla.get("España").bMenosGoleado, 15);
check("España.eliminatoria", tabla.get("España").ptsEliminatoria + tabla.get("España").golavEliminatoria, 8);
check("España.total", tabla.get("España").total, 34);

// Portugal: J1 gana 2-0 a Bosnia -> 3+2 = 5 ; pierde dieciseisavos pero clasificó -> +3 ; total 8
check("Portugal.total", tabla.get("Portugal").total, 8);

// Catar: grupo A completo. 1-1(D)=1 ; 0-2(L)=-2 ; 1-1(D)=1 -> liguilla 0.
//  GF=2 (no es máx), GA=4 (no es mín) -> sin bonus. No clasifica. Total 0.
check("Catar.total", tabla.get("Catar").total, 0);

// Sudáfrica: 0-3(L,-3)=-3 ; 2-0(W,+3)=3+2=5 ; 2-2(D,0)=1 -> liguilla 3.
//  Clasifica (aparece en dieciseisavos programado) -> +3. Total 6.
check("Sudáfrica.total", tabla.get("Sudáfrica").total, 6);

console.log("\n— Clasificación —");
CONFIG.participantes
  .map((p) => ({ n: p.nombre, pts: puntosParticipante(p, tabla) }))
  .sort((a, b) => b.pts - a.pts)
  .forEach((r, i) => console.log(`${i + 1}. ${r.n}: ${round1(r.pts)}`));

process.exit(fallos ? 1 : 0);
