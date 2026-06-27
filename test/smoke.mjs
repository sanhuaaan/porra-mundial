// Prueba de humo del motor de puntuación. Usa un ESCENARIO FIJO (no el data.js
// real, que cambia con cada actualización) y verifica los puntos contra valores
// calculados a mano. Carga config.js + app.js en un único ámbito global, como
// hace el navegador con <script> clásicos.
import { loadEngine, round1 } from "../lib/engine.mjs";

// Escenario de prueba: Grupo A completo + jornada 1 del resto + 1 ronda de 32.
const FIXTURE = {
  updated: "2026-06-20T12:00:00.000Z",
  groups: {
    A: ["España", "Sudáfrica", "Uzbekistán", "Catar"],
    E: ["Portugal", "Bosnia", "Ghana", "Japón"],
  },
  matches: [
    { phase: "groups", group: "A", matchday: 1, home: "España", away: "Sudáfrica", homeGoals: 3, awayGoals: 0, status: "FINISHED" },
    { phase: "groups", group: "A", matchday: 1, home: "Uzbekistán", away: "Catar", homeGoals: 1, awayGoals: 1, status: "FINISHED" },
    { phase: "groups", group: "A", matchday: 2, home: "España", away: "Uzbekistán", homeGoals: 2, awayGoals: 1, status: "FINISHED" },
    { phase: "groups", group: "A", matchday: 2, home: "Catar", away: "Sudáfrica", homeGoals: 0, awayGoals: 2, status: "FINISHED" },
    { phase: "groups", group: "A", matchday: 3, home: "España", away: "Catar", homeGoals: 1, awayGoals: 1, status: "FINISHED" },
    { phase: "groups", group: "A", matchday: 3, home: "Sudáfrica", away: "Uzbekistán", homeGoals: 2, awayGoals: 2, status: "FINISHED" },
    { phase: "groups", group: "E", matchday: 1, home: "Portugal", away: "Bosnia", homeGoals: 2, awayGoals: 0, status: "FINISHED" },
    { phase: "round_of_32", home: "España", away: "Portugal", homeGoals: 2, awayGoals: 0, status: "FINISHED" },
    { phase: "round_of_32", home: "Sudáfrica", away: "Senegal", homeGoals: null, awayGoals: null, status: "SCHEDULED" },
  ],
};

const { compute, participantPoints, CONFIG, POOL_DATA } = loadEngine({ data: FIXTURE });
const table = compute(POOL_DATA);

let fails = 0;
function check(name, actual, expected) {
  const ok = round1(actual) === round1(expected);
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${name}: ${round1(actual)}${ok ? "" : `  (esperado ${expected})`}`);
}

// España, grupo A:
//  Liguilla: 3-0(W,+3)=3+3 ; 2-1(W,+1)=3+1 ; 1-1(D,0)=1+0  -> 11
//  Bonus: advance +3 ; más goleador (GF6) +6 ; menos goleado (GA2) +6 -> 15
//  Ronda de 32: gana 2-0 -> bono 6 + golaveraje 2 -> 8
//  Total = 11 + 15 + 8 = 34
check("España.groupPoints", table.get("España").groupPoints, 11);
check("España.bonus", table.get("España").bAdvance + table.get("España").bTopScorer + table.get("España").bLeastConceded, 15);
check("España.knockout", table.get("España").knockoutPoints + table.get("España").knockoutGD, 8);
check("España.total", table.get("España").total, 34);

// Portugal, grupo E: solo ha jugado la J1 (gana 2-0 a Bosnia -> 3+2 = 5). Su
// grupo NO está completo, así que NO recibe el +3 de avance aunque sea 1.º de su
// grupo y aparezca en la ronda de 32 (la API a veces lo coloca pronto en el
// cuadro). Total = 5. Cuando el grupo E se cierre, sumará el +3.
check("Portugal.total", table.get("Portugal").total, 5);

// Catar: grupo A completo. 1-1(D)=1 ; 0-2(L)=-2 ; 1-1(D)=1 -> liguilla 0.
//  GF=2 (no es máx), GA=4 (no es mín) -> sin bonus. No clasifica. Total 0.
check("Catar.total", table.get("Catar").total, 0);

// Sudáfrica: 0-3(L,-3)=-3 ; 2-0(W,+3)=3+2=5 ; 2-2(D,0)=1 -> liguilla 3.
//  2.ª del grupo A (que está completo) -> +3 de avance al instante, sin esperar
//  al cuadro de eliminatorias. Total 6.
check("Sudáfrica.total", table.get("Sudáfrica").total, 6);

console.log("\n— Clasificación —");
CONFIG.participants
  .map((p) => ({ n: p.name, pts: participantPoints(p, table) }))
  .sort((a, b) => b.pts - a.pts)
  .forEach((r, i) => console.log(`${i + 1}. ${r.n}: ${round1(r.pts)}`));

process.exit(fails ? 1 : 0);
