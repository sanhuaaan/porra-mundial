// ───────────────────────────────────────────────────────────────────────────
// Configuración de la porra: participantes, selecciones y reglas de puntuación.
// Este fichero se compila a un <script> clásico (ámbito global compartido con
// porra.ts), así que NO usa import/export.
// ───────────────────────────────────────────────────────────────────────────

type Fase =
  | "grupos"
  | "dieciseisavos"
  | "octavos"
  | "cuartos"
  | "semis"
  | "tercer_puesto"
  | "final";

interface Partido {
  fase: Fase;
  grupo?: string;        // sólo en fase de grupos: "A", "B", ...
  jornada?: number;      // sólo en fase de grupos: 1, 2, 3
  local: string;
  visitante: string;
  gl: number | null;     // goles local (null si aún no jugado)
  gv: number | null;     // goles visitante
  estado: "FINISHED" | "IN_PLAY" | "SCHEDULED";
  penaltis?: boolean;    // eliminatoria decidida en penaltis (golaveraje = 0)
  ganador?: string;      // necesario si el partido acabó empatado (penaltis)
}

interface Datos {
  actualizado: string;                    // ISO 8601
  grupos: Record<string, string[]>;       // "A" -> ["España", ...]
  partidos: Partido[];
}

interface Participante {
  nombre: string;
  equipos: string[];     // nombres canónicos (en español), ver tabla de NOMBRES
}

interface Config {
  participantes: Participante[];
  puntos: {
    grupo: { victoria: number; empate: number; derrota: number };
    bonusGrupo: { pasaRonda: number; masGoleador: number; menosGoleado: number };
    eliminatoria: {
      dieciseisavos: number;
      octavos: number;
      cuartos: number;
      semis: number;
      final: number;       // campeón
      subcampeon: number;  // perdedor de la final
      tercer_puesto: number;
    };
  };
}

const CONFIG: Config = {
  participantes: [
    { nombre: "Elena",  equipos: ["España", "Francia", "Bélgica", "Bosnia", "Australia", "Corea Sur", "Uzbekistán"] },
    { nombre: "Sanju",  equipos: ["Egipto", "Corea Sur", "Rep. Checa", "Senegal", "Uruguay", "Croacia", "Escocia", "Ghana"] },
    { nombre: "Iñaki",  equipos: ["Francia", "Portugal", "Marruecos", "Ecuador", "Bosnia", "Corea Sur", "Cabo Verde"] },
    { nombre: "Samu",   equipos: ["España", "Argentina", "Croacia", "Ecuador", "Corea Sur", "Nueva Zelanda", "Catar"] },
    { nombre: "Unai",   equipos: ["España", "Francia", "Argentina", "Corea Sur", "Egipto", "Jordania", "Nueva Zelanda"] },
    { nombre: "Jon",    equipos: ["España", "Argentina", "México", "Paraguay", "Corea Sur", "Sudáfrica", "Nueva Zelanda"] },
    { nombre: "Martín", equipos: ["España", "Portugal", "Japón", "Uruguay", "Congo", "Nueva Zelanda", "Cabo Verde"] },
  ],

  puntos: {
    grupo: { victoria: 3, empate: 1, derrota: 0 },
    bonusGrupo: { pasaRonda: 3, masGoleador: 6, menosGoleado: 6 },
    eliminatoria: {
      dieciseisavos: 6,
      octavos: 9,
      cuartos: 12,
      semis: 15,
      final: 18,        // +18 al campeón
      subcampeon: 6,    // +6 al subcampeón
      tercer_puesto: 3, // +3 al tercero
    },
  },
};

// Nombre canónico (español) -> código de bandera para https://flagcdn.com
// (ISO 3166-1 alfa-2, con subdivisiones gb-sct/gb-eng para selecciones británicas).
const BANDERAS: Record<string, string> = {
  "España": "es", "Francia": "fr", "Bélgica": "be", "Bosnia": "ba", "Australia": "au",
  "Corea Sur": "kr", "Uzbekistán": "uz", "Egipto": "eg", "Rep. Checa": "cz", "Senegal": "sn",
  "Uruguay": "uy", "Croacia": "hr", "Escocia": "gb-sct", "Ghana": "gh", "Portugal": "pt",
  "Marruecos": "ma", "Ecuador": "ec", "Cabo Verde": "cv", "Argentina": "ar", "Catar": "qa",
  "Jordania": "jo", "México": "mx", "Paraguay": "py", "Sudáfrica": "za", "Nueva Zelanda": "nz",
  "Japón": "jp", "Congo": "cg",
};
