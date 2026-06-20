// ───────────────────────────────────────────────────────────────────────────
// Configuración de la porra: participantes, selecciones y reglas de puntuación.
// Este fichero se compila a un <script> clásico (ámbito global compartido con
// app.ts), así que NO usa import/export.
// ───────────────────────────────────────────────────────────────────────────

type Phase =
  | "groups"
  | "round_of_32"
  | "round_of_16"
  | "quarter_finals"
  | "semi_finals"
  | "third_place"
  | "final";

interface Match {
  phase: Phase;
  group?: string;        // sólo en fase de grupos: "A", "B", ...
  matchday?: number;     // sólo en fase de grupos: 1, 2, 3
  home: string;
  away: string;
  homeGoals: number | null; // null si aún no jugado
  awayGoals: number | null;
  status: "FINISHED" | "IN_PLAY" | "SCHEDULED";
  penalties?: boolean;   // eliminatoria decidida en penaltis (golaveraje = 0)
  winner?: string;       // necesario si el partido acabó empatado (penaltis)
}

interface Data {
  updated: string;                     // ISO 8601
  groups: Record<string, string[]>;    // "A" -> ["España", ...]
  matches: Match[];
}

interface Participant {
  name: string;
  teams: string[];       // nombres canónicos (en español), ver tabla NAMES de update.mjs
}

interface Config {
  participants: Participant[];
  points: {
    group: { win: number; draw: number; loss: number };
    groupBonus: { advance: number; topScorer: number; leastConceded: number };
    knockout: {
      roundOf32: number;
      roundOf16: number;
      quarterFinals: number;
      semiFinals: number;
      final: number;     // campeón
      runnerUp: number;  // perdedor de la final
      thirdPlace: number;
    };
  };
}

const CONFIG: Config = {
  participants: [
    { name: "Elena",  teams: ["España", "Francia", "Bélgica", "Bosnia", "Australia", "Corea Sur", "Uzbekistán"] },
    { name: "Sanju",  teams: ["Egipto", "Corea Sur", "Rep. Checa", "Senegal", "Uruguay", "Croacia", "Escocia", "Ghana"] },
    { name: "Iñaki",  teams: ["Francia", "Portugal", "Marruecos", "Ecuador", "Bosnia", "Corea Sur", "Cabo Verde"] },
    { name: "Samu",   teams: ["España", "Argentina", "Croacia", "Ecuador", "Corea Sur", "Nueva Zelanda", "Catar"] },
    { name: "Unai",   teams: ["España", "Francia", "Argentina", "Corea Sur", "Egipto", "Jordania", "Nueva Zelanda"] },
    { name: "Jon",    teams: ["España", "Argentina", "México", "Paraguay", "Corea Sur", "Sudáfrica", "Nueva Zelanda"] },
    { name: "Martín", teams: ["España", "Portugal", "Japón", "Uruguay", "Congo", "Nueva Zelanda", "Cabo Verde"] },
  ],

  points: {
    group: { win: 3, draw: 1, loss: 0 },
    groupBonus: { advance: 3, topScorer: 6, leastConceded: 6 },
    knockout: {
      roundOf32: 6,
      roundOf16: 9,
      quarterFinals: 12,
      semiFinals: 15,
      final: 18,       // +18 al campeón
      runnerUp: 6,     // +6 al subcampeón
      thirdPlace: 3,   // +3 al tercero
    },
  },
};

// Nombre canónico (español) -> código de bandera para https://flagcdn.com
// (ISO 3166-1 alfa-2, con subdivisiones gb-sct/gb-eng para selecciones británicas).
const FLAGS: Record<string, string> = {
  "España": "es", "Francia": "fr", "Bélgica": "be", "Bosnia": "ba", "Australia": "au",
  "Corea Sur": "kr", "Uzbekistán": "uz", "Egipto": "eg", "Rep. Checa": "cz", "Senegal": "sn",
  "Uruguay": "uy", "Croacia": "hr", "Escocia": "gb-sct", "Ghana": "gh", "Portugal": "pt",
  "Marruecos": "ma", "Ecuador": "ec", "Cabo Verde": "cv", "Argentina": "ar", "Catar": "qa",
  "Jordania": "jo", "México": "mx", "Paraguay": "py", "Sudáfrica": "za", "Nueva Zelanda": "nz",
  "Japón": "jp", "Congo": "cg",
};
