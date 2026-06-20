#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Descarga los resultados del Mundial desde football-data.org y reescribe
// data.js. Es la ÚNICA parte que toca la clave de la API (nunca llega al
// navegador). Pensado para lanzarlo a mano o desde cron / GitHub Actions.
//
//   FOOTBALL_DATA_TOKEN=tu_clave node update.mjs
//
// Variables de entorno:
//   FOOTBALL_DATA_TOKEN  (obligatoria)  clave de https://www.football-data.org
//   FD_COMPETITION       (opcional)     código de competición, por defecto "WC"
// ───────────────────────────────────────────────────────────────────────────
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const COMPETITION = process.env.FD_COMPETITION || "WC";
const BASE = "https://api.football-data.org/v4";

if (!TOKEN) {
  console.error("✗ Falta la clave. Usa:  FOOTBALL_DATA_TOKEN=tu_clave node update.mjs");
  process.exit(1);
}

async function api(path) {
  const r = await fetch(BASE + path, { headers: { "X-Auth-Token": TOKEN } });
  if (!r.ok) {
    throw new Error(`football-data ${path} -> ${r.status} ${r.statusText}\n${await r.text()}`);
  }
  return r.json();
}

// football-data devuelve los nombres en inglés; los pasamos al nombre canónico
// (español) que usa la porra. Lo que no esté en la tabla se deja tal cual.
const NAMES = {
  "Spain": "España", "France": "Francia", "Belgium": "Bélgica",
  "Bosnia and Herzegovina": "Bosnia", "Bosnia-Herzegovina": "Bosnia", "Australia": "Australia",
  "Korea Republic": "Corea Sur", "South Korea": "Corea Sur", "Uzbekistan": "Uzbekistán",
  "Egypt": "Egipto", "Czech Republic": "Rep. Checa", "Czechia": "Rep. Checa",
  "Senegal": "Senegal", "Uruguay": "Uruguay", "Croatia": "Croacia",
  "Scotland": "Escocia", "Ghana": "Ghana", "Portugal": "Portugal",
  "Morocco": "Marruecos", "Ecuador": "Ecuador", "Cape Verde": "Cabo Verde",
  "Cape Verde Islands": "Cabo Verde", "Cabo Verde": "Cabo Verde", "Argentina": "Argentina", "Qatar": "Catar",
  "Jordan": "Jordania", "Mexico": "México", "Paraguay": "Paraguay",
  "South Africa": "Sudáfrica", "New Zealand": "Nueva Zelanda", "Japan": "Japón",
  "Congo": "Congo", "Congo DR": "Congo", "DR Congo": "Congo",
  "Iran": "Irán", "IR Iran": "Irán",
};
const tr = (n) => (n ? (NAMES[n] || n) : n);

// Etapas de football-data -> fases de la porra. Se incluyen alias por si el
// nombre exacto del torneo de 48 equipos difiere.
const PHASES = {
  GROUP_STAGE: "groups",
  LAST_32: "round_of_32", ROUND_OF_32: "round_of_32",
  LAST_16: "round_of_16", ROUND_OF_16: "round_of_16",
  QUARTER_FINALS: "quarter_finals", QUARTER_FINAL: "quarter_finals",
  SEMI_FINALS: "semi_finals", SEMI_FINAL: "semi_finals",
  THIRD_PLACE: "third_place", "3RD_PLACE": "third_place",
  FINAL: "final",
};

function groupLetter(g) {
  if (!g) return undefined;
  const m = String(g).match(/GROUP[_\s]?([A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : String(g);
}

function normStatus(s) {
  if (s === "FINISHED") return "FINISHED";
  if (s === "IN_PLAY" || s === "PAUSED") return "IN_PLAY";
  return "SCHEDULED";
}

const data = { updated: new Date().toISOString(), groups: {}, matches: [] };

// ── Grupos (desde la clasificación) ──
try {
  const st = await api(`/competitions/${COMPETITION}/standings`);
  for (const s of st.standings || []) {
    if (s.type && s.type !== "TOTAL") continue;
    const letter = groupLetter(s.group);
    if (!letter) continue;
    data.groups[letter] = (s.table || []).map((row) => tr(row.team?.name)).filter(Boolean);
  }
} catch (e) {
  console.warn("⚠  No se pudieron leer los grupos:", e.message);
}

// ── Partidos ──
const ms = await api(`/competitions/${COMPETITION}/matches`);
for (const m of ms.matches || []) {
  const phase = PHASES[m.stage];
  if (!phase) continue;
  const score = m.score || {};
  const ft = score.fullTime || {};
  const penalties = score.duration === "PENALTY_SHOOTOUT" || (score.penalties && score.penalties.home != null);

  let winner;
  if (score.winner === "HOME_TEAM") winner = tr(m.homeTeam?.name);
  else if (score.winner === "AWAY_TEAM") winner = tr(m.awayTeam?.name);

  const match = {
    phase,
    home: tr(m.homeTeam?.name) || "",
    away: tr(m.awayTeam?.name) || "",
    homeGoals: ft.home ?? null,
    awayGoals: ft.away ?? null,
    status: normStatus(m.status),
  };
  if (phase === "groups") {
    match.group = groupLetter(m.group);
    if (m.matchday != null) match.matchday = m.matchday;
  }
  if (penalties) match.penalties = true;
  if (winner) match.winner = winner;
  data.matches.push(match);
}

const out =
  "// Generado por update.mjs — no editar a mano.\n" +
  "window.POOL_DATA = " + JSON.stringify(data, null, 2) + ";\n";
writeFileSync(join(__dirname, "data.js"), out);

console.log(
  `✓ ${data.matches.length} partidos y ${Object.keys(data.groups).length} grupos -> data.js  (${data.updated})`
);
