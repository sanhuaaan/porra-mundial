// Genera preview.html: una galería autocontenida para revisar en una PR los
// distintos ESTADOS de la web sin tener que esperar a datos reales. Reutiliza el
// CSS de index.html y el motor compilado (dist/*.js), y embebe varios data.js de
// ejemplo (uno por estado) con un selector para alternar entre ellos.
//
// Uso:  npm run build && node make-preview.mjs   ->  preview.html (doble clic)
// Cada estado se DERIVA del data.js real (grupos en curso), así el preview
// siempre refleja el código y los datos de la rama.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL(".", import.meta.url).pathname;
const read = (p) => readFileSync(ROOT + p, "utf8");
const clone = (o) => JSON.parse(JSON.stringify(o));
const h = (s) => { let x = 2166136261; for (const c of s) x = (x ^ c.charCodeAt(0)) * 16777619 >>> 0; return x; };

// data.js -> objeto POOL_DATA
function loadData(js) {
  const sb = { window: {} }; vm.createContext(sb); vm.runInContext(js, sb);
  return sb.window.POOL_DATA;
}
// Clasificados (1.º, 2.º + 8 mejores terceros) según el propio motor de la app.
function qualifiedOf(data) {
  const sb = { document: { getElementById: () => null, addEventListener: () => {} }, console };
  sb.window = sb; vm.createContext(sb);
  vm.runInContext(
    [read("dist/config.js"), `window.POOL_DATA=${JSON.stringify(data)};`, read("dist/app.js"),
     "globalThis.__q=[...qualifiedTeams(window.POOL_DATA)];"].join("\n;\n"), sb);
  return sb.__q.sort((a, b) => a.localeCompare(b, "es"));
}

// Cierra la fase de grupos: completa los partidos que falten con un resultado
// determinista. No toca las eliminatorias.
function closeGroups(data) {
  for (const m of data.matches) {
    if (m.phase !== "groups") continue;
    if (m.homeGoals == null) m.homeGoals = h(`${m.home}>${m.away}#${m.matchday}`) % 4;
    if (m.awayGoals == null) m.awayGoals = h(`${m.away}<${m.home}#${m.matchday}`) % 3;
    m.status = "FINISHED"; delete m.winner;
  }
  return data;
}

const sim = (home, away, seed) => {
  const a = h(`${home}|${away}|${seed}`);
  const hg = a % 4, ag = (a >> 4) % 4;
  if (hg === ag) return { hg, ag, winner: (a >> 8) & 1 ? home : away, penalties: true };
  return { hg, ag, winner: hg > ag ? home : away, penalties: false };
};

// Simula el cuadro de eliminatorias con el grado de avance que indique `plan`
// (cuántos cruces de cada ronda están jugados, y cuál está «en vivo»).
function simulateKO(data, plan) {
  const order = ["round_of_32", "round_of_16", "quarter_finals", "semi_finals", "final"];
  let feed = qualifiedOf(data).slice(); // 32 -> R32 empareja de a 2
  let semiLosers = [];
  for (const phase of order) {
    const ms = data.matches.filter((m) => m.phase === phase);
    const n = phase === "round_of_32" ? 16 : feed.length / 2;
    const winners = [], losers = [];
    for (let k = 0; k < n; k++) {
      const m = ms[k]; if (!m) continue;
      const home = feed[2 * k] || "", away = feed[2 * k + 1] || "";
      m.home = home; m.away = away; delete m.penalties; delete m.winner;
      const fin = k < (plan[phase] || 0), live = plan.live?.[phase] === k;
      if (fin && home && away) {
        const r = sim(home, away, phase);
        m.homeGoals = r.hg; m.awayGoals = r.ag; m.status = "FINISHED";
        if (r.penalties) m.penalties = true; m.winner = r.winner;
        winners[k] = r.winner; losers[k] = r.winner === home ? away : home;
      } else if (live && home && away) {
        const r = sim(home, away, `${phase}L`);
        m.homeGoals = r.hg; m.awayGoals = r.ag; m.status = "IN_PLAY"; winners[k] = ""; losers[k] = "";
      } else {
        m.homeGoals = null; m.awayGoals = null; m.status = "SCHEDULED"; winners[k] = ""; losers[k] = "";
      }
    }
    if (phase === "semi_finals") semiLosers = losers;
    feed = winners;
  }
  // Tercer puesto: perdedores de semifinales.
  const third = data.matches.find((m) => m.phase === "third_place");
  if (third) {
    const home = semiLosers[0] || "", away = semiLosers[1] || "";
    third.home = home; third.away = away; delete third.penalties; delete third.winner;
    if ((plan.third_place || 0) >= 1 && home && away) {
      const r = sim(home, away, "third");
      third.homeGoals = r.hg; third.awayGoals = r.ag; third.status = "FINISHED";
      if (r.penalties) third.penalties = true; third.winner = r.winner;
    } else { third.homeGoals = null; third.awayGoals = null; third.status = "SCHEDULED"; }
  }
  return data;
}

// ── Estados a previsualizar ───────────────────────────────────────────────────
const base = loadData(read("data.js")); // grupos en curso (ejemplo real)
const PROGRESS = { round_of_32: 16, round_of_16: 8, quarter_finals: 2, semi_finals: 0, final: 0, third_place: 0, live: { quarter_finals: 2 } };
const FULL = { round_of_32: 16, round_of_16: 8, quarter_finals: 4, semi_finals: 2, final: 1, third_place: 1, live: {} };

const scenarios = [
  { key: "groups-live", label: "Grupos en curso",
    desc: "Fase de grupos a medias: clasificación en directo, sin cuadro de eliminatorias.",
    data: base },
  { key: "groups-closed", label: "Grupos cerrados",
    desc: "Fase de grupos terminada: clasificados marcados en verde y cuadro vacío («Por definir»), a la espera del sorteo.",
    data: closeGroups(clone(base)) },
  { key: "ko-progress", label: "Bracket en progreso",
    desc: "Eliminatorias en marcha: 16avos y octavos cerrados, un cuarto en vivo, semis/final por definir.",
    data: simulateKO(closeGroups(clone(base)), PROGRESS) },
  { key: "champion", label: "Campeón",
    desc: "Torneo completo: todas las rondas jugadas y campeón decidido.",
    data: simulateKO(closeGroups(clone(base)), FULL) },
];

// ── Componer preview.html (autocontenido) ─────────────────────────────────────
const css = read("index.html").split("<style>")[1].split("</style>")[0];
const configJs = read("dist/config.js");
const appJs = read("dist/app.js");

const extraCss = `
    /* Barra de selección de estado (sólo del preview). */
    .pv-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
    .pv-btn { font: inherit; font-size: 13px; cursor: pointer; padding: 7px 13px; border-radius: 999px;
      border: 1px solid var(--line); background: var(--card); color: var(--ink); }
    .pv-btn:hover { background: #f7f3ec; }
    .pv-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .pv-desc { color: var(--muted); font-size: 13.5px; margin: 4px 0 8px; min-height: 20px; }
    .pv-note { background: #fdf3e7; border: 1px solid #e8c9a0; color: #8a5a1f; border-radius: 10px;
      padding: 8px 12px; font-size: 12.5px; margin-bottom: 8px; }`;

const buttons = scenarios
  .map((s) => `<button class="pv-btn" type="button" data-scn="${s.key}">${s.label}</button>`)
  .join("");
const scnJson = JSON.stringify(
  Object.fromEntries(scenarios.map((s) => [s.key, { data: s.data, desc: s.desc }])),
);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Porra Mundial — Previsualización de estados</title>
  <style>${css}${extraCss}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="header-row">
        <h1>Porra Mundial 2026 · preview</h1>
        <div class="header-actions">
          <button class="teams-open" type="button" aria-haspopup="dialog"><svg class="ti" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.2" y="3" width="11.6" height="10" rx="1.6"/><line x1="2.2" y1="6.6" x2="13.8" y2="6.6"/><line x1="7" y1="6.6" x2="7" y2="13"/></svg><span class="rules-label">Puntos por selección</span></button>
          <button class="rules-open" type="button" aria-haspopup="dialog"><span class="ri">i</span><span class="rules-label">Reglas de puntuación</span></button>
        </div>
      </div>
      <div class="sub">Estados de la web para revisión · Actualizado: <span id="updated">—</span></div>
      <div class="pv-note">Previsualización con datos de ejemplo (no reales). Cada botón muestra un estado distinto de la página.</div>
      <div class="pv-bar">${buttons}</div>
      <div class="pv-desc" id="pv-desc"></div>
    </header>
    <main id="app"></main>
  </div>

  <script>${configJs}</script>
  <script>window.__SCENARIOS = ${scnJson}; window.POOL_DATA = window.__SCENARIOS["${scenarios[0].key}"].data;</script>
  <script>${appJs}</script>
  <script>
    (function () {
      var btns = document.querySelectorAll(".pv-btn");
      var desc = document.getElementById("pv-desc");
      function show(key) {
        var s = window.__SCENARIOS[key];
        window.POOL_DATA = s.data;
        if (desc) desc.textContent = s.desc;
        btns.forEach(function (b) { b.classList.toggle("active", b.dataset.scn === key); });
        render();
      }
      btns.forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.scn); }); });
      show("${scenarios[0].key}");
    })();
  </script>
</body>
</html>
`;

writeFileSync(ROOT + "preview.html", html);
console.log(`✓ preview.html generado (${scenarios.length} estados: ${scenarios.map((s) => s.key).join(", ")})`);
