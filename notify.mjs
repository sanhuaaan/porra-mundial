#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Publica un mensaje en un espacio de Google Chat con la clasificación de la
// porra CADA VEZ que termina una fase del torneo (las 9 del stepper: J1, J2, J3
// y cada eliminatoria). Pensado para correr DESPUÉS de update.mjs en el deploy.
//
//   GOOGLE_CHAT_WEBHOOK=https://chat.googleapis.com/... node notify.mjs
//
// Idempotencia: las fases ya anunciadas se guardan en notified.json (lo commitea
// el workflow). Así el cron de cada 15 min no repite el mensaje de una fase que
// sigue completa. La primera vez (sin notified.json) SIEMBRA el estado en
// silencio: no postea fases ya jugadas, solo avisa de las que terminen después.
//
// Variables de entorno:
//   GOOGLE_CHAT_WEBHOOK  (obligatoria salvo dry-run)  URL del webhook del espacio
//   NOTIFY_DRY_RUN=1     (opcional)  imprime por stdout, no postea ni escribe
// ───────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEngine, round1 } from "./lib/engine.mjs";
import { randomQuote } from "./quotes.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(dir, "notified.json");
const WEB_URL = "https://sanhuaaan.github.io/porra-mundial/";
const WEBHOOK = process.env.GOOGLE_CHAT_WEBHOOK;
const DRY_RUN = process.env.NOTIFY_DRY_RUN === "1";

// Tolerante a propósito: si no hay webhook (y no es dry-run) se omite la
// notificación SIN romper el deploy. Así el push y la puesta del secret no
// quedan acoplados: el sitio se publica igual aunque el secret aún no exista.
if (!WEBHOOK && !DRY_RUN) {
  console.warn("• Sin GOOGLE_CHAT_WEBHOOK: se omiten las notificaciones (deploy sigue).");
  process.exit(0);
}

// ── Cargar el motor de la web en Node (mismo cálculo que el navegador) ──
// data.js lo acaba de generar update.mjs.
const { compute, participantPoints, phaseProgress, CONFIG, POOL_DATA } = loadEngine();
const data = POOL_DATA;

// ── Clasificación actual (participantes ordenados por puntos) ──
const table = compute(data);
const ranking = CONFIG.participants
  .map((p) => ({ name: p.name, pts: participantPoints(p, table) }))
  .sort((a, b) => b.pts - a.pts);

// ── Fases terminadas ahora (mismo criterio que el stepper de la web) ──
const donePhases = phaseProgress(data)
  .filter((s) => s.total > 0 && s.finished === s.total)
  .map((s) => s.full);

// ── Estado persistido ──
let state = { announced: [], lastRanking: [] };
const firstRun = !existsSync(STATE_PATH);
if (!firstRun) {
  try {
    state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    state.announced = state.announced || [];
    state.lastRanking = state.lastRanking || [];
  } catch (e) {
    console.warn("⚠  notified.json ilegible, se trata como vacío:", e.message);
  }
}

const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");

// Primera vez: sembrar en silencio para no postear fases ya jugadas.
if (firstRun) {
  state.announced = [...donePhases];
  state.lastRanking = ranking.map((r) => r.name);
  if (DRY_RUN) {
    console.log("• Bootstrap (dry-run): sembraría", donePhases.length, "fase(s) sin postear:", donePhases.join(", ") || "—");
  } else {
    save();
    console.log("✓ Bootstrap: sembradas", donePhases.length, "fase(s) sin postear:", donePhases.join(", ") || "—");
  }
  process.exit(0);
}

// Fases terminadas que aún no se han anunciado, en el orden de phaseProgress.
const pending = donePhases.filter((full) => !state.announced.includes(full));
if (pending.length === 0) {
  console.log("• Sin fases nuevas que anunciar.");
  process.exit(0);
}

// Emoji keycap para los puestos sin medalla ni 💩 (4️⃣, 5️⃣… 🔟). Más de 10 no
// tienen keycap: se cae a número en negrita.
const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const numberEmoji = (n) => KEYCAPS[n - 1] || `<b>${n}</b>`;

// ── Construir la card de Google Chat ──
// El ▲/▼ se calcula contra el ranking del ÚLTIMO anuncio, fijado ANTES del bucle:
// si varias fases terminan en la misma corrida muestran todas el mismo delta y
// lastRanking se reescribe una sola vez al final.
const prevRanking = state.lastRanking;
const MEDALS = ["🥇", "🥈", "🥉"];

// Marca de puesto: medalla (top 3), 💩 (último) o número en emoji keycap.
const rankMark = (i, last) => (i < 3 ? MEDALS[i] : i === last ? "💩" : numberEmoji(i + 1));

// Variación de puesto vs el anuncio anterior: entero (>0 sube, <0 baja) o null si
// no estaba en el ranking previo.
const rankDelta = (name, idx) => {
  const prev = prevRanking.indexOf(name);
  return prev === -1 ? null : prev - idx;
};
// Texto plano del delta: ▲n / ▼n / — (para el dry-run).
const deltaArrow = (d) => (!d ? "—" : d > 0 ? `▲${d}` : `▼${-d}`);
// Variante con color para la card de Chat (verde sube / rojo baja / gris igual).
function deltaText(name, idx) {
  const d = rankDelta(name, idx);
  const color = d > 0 ? "#1a7f37" : d < 0 ? "#d1242f" : "#6b7280";
  return `<font color="${color}">${deltaArrow(d)}</font>`;
}

function card(phaseFull, quote) {
  const last = ranking.length - 1;
  const widgets = ranking.map((row, i) => ({
    decoratedText: {
      text: `${rankMark(i, last)}  <b>${row.name}</b>  ·  ${round1(row.pts)} pts  ${deltaText(row.name, i)}`,
    },
  }));
  // Remate al estilo García: una de sus frases, atribuida. El <br> inicial deja
  // un poco de aire respecto a la clasificación.
  widgets.push({ textParagraph: { text: `<br><i>«${quote}»</i><br>— José María García` } });
  widgets.push({
    buttonList: {
      buttons: [{ text: "Ver clasificación", onClick: { openLink: { url: WEB_URL } } }],
    },
  });
  return {
    cardsV2: [{
      cardId: "porra-fase",
      card: {
        header: { title: "Minuto y resultado", subtitle: `Terminó: ${phaseFull}` },
        sections: [{ widgets }],
      },
    }],
  };
}

async function post(payload) {
  const r = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Google Chat -> ${r.status} ${r.statusText}\n${await r.text()}`);
}

// ── Anunciar cada fase pendiente ──
// Solo se marca como anunciada y se actualiza lastRanking si el POST tuvo éxito;
// si falla, se reintenta en la próxima corrida. Nunca rompe el deploy.
let posted = 0;
for (const phaseFull of pending) {
  const quote = randomQuote();
  const payload = card(phaseFull, quote);
  if (DRY_RUN) {
    console.log(`\n── ${phaseFull} ──`);
    console.log("Minuto y resultado — Terminó: " + phaseFull);
    const last = ranking.length - 1;
    ranking.forEach((row, i) => {
      const d = deltaArrow(rankDelta(row.name, i));
      console.log(`  ${rankMark(i, last)} ${row.name.padEnd(8)} ${String(round1(row.pts)).padStart(5)}  ${d}`);
    });
    console.log(`  «${quote}» — José María García`);
    console.log("  [Ver clasificación] " + WEB_URL);
  } else {
    try {
      await post(payload);
    } catch (e) {
      console.warn(`⚠  No se pudo anunciar «${phaseFull}»:`, e.message);
      continue; // no marcar; se reintentará
    }
  }
  state.announced.push(phaseFull);
  posted++;
}

// Una sola actualización de la base de ▲/▼, tras anunciar lo que se haya podido.
if (posted > 0) state.lastRanking = ranking.map((r) => r.name);
if (!DRY_RUN && posted > 0) save();
console.log(`✓ ${posted} fase(s) ${DRY_RUN ? "se anunciarían" : "anunciadas"}.`);
