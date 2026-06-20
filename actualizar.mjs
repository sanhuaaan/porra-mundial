#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Descarga los resultados del Mundial desde football-data.org y reescribe
// datos.js. Es la ÚNICA parte que toca la clave de la API (nunca llega al
// navegador). Pensado para lanzarlo a mano o desde cron.
//
//   FOOTBALL_DATA_TOKEN=tu_clave node actualizar.mjs
//
// Variables de entorno:
//   FOOTBALL_DATA_TOKEN  (obligatoria)  clave de https://www.football-data.org
//   FD_COMPETICION       (opcional)     código de competición, por defecto "WC"
// ───────────────────────────────────────────────────────────────────────────
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const COMPETICION = process.env.FD_COMPETICION || "WC";
const BASE = "https://api.football-data.org/v4";

if (!TOKEN) {
  console.error("✗ Falta la clave. Usa:  FOOTBALL_DATA_TOKEN=tu_clave node actualizar.mjs");
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
const NOMBRES = {
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
const tr = (n) => (n ? (NOMBRES[n] || n) : n);

// Etapas de football-data -> fases de la porra. Se incluyen alias por si el
// nombre exacto del torneo de 48 equipos difiere.
const FASES = {
  GROUP_STAGE: "grupos",
  LAST_32: "dieciseisavos", ROUND_OF_32: "dieciseisavos",
  LAST_16: "octavos", ROUND_OF_16: "octavos",
  QUARTER_FINALS: "cuartos", QUARTER_FINAL: "cuartos",
  SEMI_FINALS: "semis", SEMI_FINAL: "semis",
  THIRD_PLACE: "tercer_puesto", "3RD_PLACE": "tercer_puesto",
  FINAL: "final",
};

function grupoLetra(g) {
  if (!g) return undefined;
  const m = String(g).match(/GROUP[_\s]?([A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : String(g);
}

function estadoNorm(s) {
  if (s === "FINISHED") return "FINISHED";
  if (s === "IN_PLAY" || s === "PAUSED") return "IN_PLAY";
  return "SCHEDULED";
}

const datos = { actualizado: new Date().toISOString(), grupos: {}, partidos: [] };

// ── Grupos (desde la clasificación) ──
try {
  const st = await api(`/competitions/${COMPETICION}/standings`);
  for (const s of st.standings || []) {
    if (s.type && s.type !== "TOTAL") continue;
    const letra = grupoLetra(s.group);
    if (!letra) continue;
    datos.grupos[letra] = (s.table || []).map((t) => tr(t.team?.name)).filter(Boolean);
  }
} catch (e) {
  console.warn("⚠  No se pudieron leer los grupos:", e.message);
}

// ── Partidos ──
const ms = await api(`/competitions/${COMPETICION}/matches`);
for (const m of ms.matches || []) {
  const fase = FASES[m.stage];
  if (!fase) continue;
  const score = m.score || {};
  const ft = score.fullTime || {};
  const penaltis = score.duration === "PENALTY_SHOOTOUT" || (score.penalties && score.penalties.home != null);

  let ganador;
  if (score.winner === "HOME_TEAM") ganador = tr(m.homeTeam?.name);
  else if (score.winner === "AWAY_TEAM") ganador = tr(m.awayTeam?.name);

  const partido = {
    fase,
    local: tr(m.homeTeam?.name) || "",
    visitante: tr(m.awayTeam?.name) || "",
    gl: ft.home ?? null,
    gv: ft.away ?? null,
    estado: estadoNorm(m.status),
  };
  if (fase === "grupos") {
    partido.grupo = grupoLetra(m.group);
    if (m.matchday != null) partido.jornada = m.matchday;
  }
  if (penaltis) partido.penaltis = true;
  if (ganador) partido.ganador = ganador;
  datos.partidos.push(partido);
}

const salida =
  "// Generado por actualizar.mjs — no editar a mano.\n" +
  "window.PORRA_DATOS = " + JSON.stringify(datos, null, 2) + ";\n";
writeFileSync(join(__dirname, "datos.js"), salida);

console.log(
  `✓ ${datos.partidos.length} partidos y ${Object.keys(datos.grupos).length} grupos -> datos.js  (${datos.actualizado})`
);
