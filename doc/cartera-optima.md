# Cartera óptima de la porra

> Análisis privado (no se publica en la web: el deploy solo sirve `index.html`,
> `data.js` y `dist/*.js`).

**Datos:** puntuación acumulada por selección del propio motor de la porra
(`compute(POOL_DATA)`), snapshot del **2026-07-16** — jugado todo el torneo salvo
**3.er puesto** y **final**.

## Reglas del ejercicio

- Presupuesto: **36 M€** por participante.
- **Prohibido** elegir selecciones de coste **9 M€** (España, Francia, Inglaterra, Argentina).
- Mínimo **7 selecciones**.
- Objetivo: maximizar los puntos acumulados hasta este punto.

## Resultado óptimo (≥7 selecciones)

| Selección | Coste | Puntos |
|---|---:|---:|
| Bélgica | 7 M | 43 |
| México | 6 M | 38 |
| Suiza | 6 M | 35 |
| Marruecos | 6 M | 32 |
| Canadá | 5 M | 28 |
| Australia | 3 M | 13 |
| Sudáfrica | 2 M | 6 |
| Cabo Verde | 1 M | 6 |
| **Total** | **36 M** | **201** |

**201 puntos**, presupuesto clavado (36/36), 8 selecciones. Óptimo exacto
(programación dinámica 0/1 sobre nº de equipos × coste).

## Notas

- El DP elige **8** selecciones, no 7: gastar las migajas del presupuesto en
  baratas rentables (Australia + Sudáfrica + Cabo Verde = 25 pts por 6 M) rinde
  más que quedarse en 7 y dejar euros sin usar.
- Sin el mínimo de 7, el óptimo serían **6 selecciones y 203 pts** (misma base +
  Estados Unidos 27 pts en lugar de las tres baratas). El límite de 7 cuesta 2 pts.
- **Bélgica (7 M, 43 pts)** es la mejor relación calidad-precio del torneo entre
  las permitidas: ninguna de 8 M (Brasil 35, Portugal 29, Alemania 21) la supera
  por M€, y las de 9 M están excluidas.

### Top selecciones por puntos (referencia)

| Selección | Coste | Puntos |
|---|---:|---:|
| Bélgica | 7 M | 43 |
| México | 6 M | 38 |
| Brasil | 8 M | 35 |
| Suiza | 6 M | 35 |
| Marruecos | 6 M | 32 |
| Portugal | 8 M | 29 |
| Canadá | 5 M | 28 |
| Noruega | 7 M | 27 |
| Estados Unidos | 6 M | 27 |

---

# Simulación pre-torneo (Monte Carlo)

**¿Se podía llegar a algo parecido ANTES de empezar, solo con datos?** Sí a la
estructura, no al número exacto. Herramienta: `sim/simulate.mjs`.

## Cómo funciona

No reimplementa la fórmula de puntos: genera un Mundial sintético (mismo formato
que `data.js`) y lo pasa por el **`compute()` real** del motor, así puntúa
idéntico a la web. Repite N veces (por defecto 20.000) con un modelo de fuerza y
promedia → **puntos esperados** por selección. Con esos puntos corre el mismo
knapsack (36 M€, ≥7 selecciones, sin 9 M€).

- **Modelo de partido:** goles Poisson con media inclinada por diferencia de Elo
  (`BASE=1.35`, factor `10^(Δelo/800)`); empates de eliminatoria → penaltis por
  moneda ponderada. Constantes de calibración, ajustables.
- **Cuadro:** reparto aleatorio de los 32 clasificados en cada simulación
  (simplificación: el Mundial real cruza por posición de grupo; al promediar
  sobre N sorteos la dificultad esperada sale insesgada).
- **PRNG sembrado** → resultado reproducible corrida a corrida.

## Los ratings: de dónde salen y cómo cambiarlos

La fuerza sale de **`sim/ratings.json`**. Para afinar el modelo **no se toca el
script**: se edita ese JSON.

**Fuente actual: Elo de eloratings.net, snapshot `2025.tsv` (cierre de 2025).**
Es una foto ~6 meses ANTES del Mundial, **sin contaminar** por resultados del
propio torneo. Ojo: el fichero anual `2026.tsv` coincide con el `World.tsv`
actual (ya incluye el Mundial en curso), por eso no se usa.

Para actualizar o cambiar de fuente:

- **eloratings.net:** descargar `https://www.eloratings.net/<año>.tsv` (columna 3
  = código, columna 4 = Elo) y remapear a los 48 nombres del motor. Cuidado con
  códigos no estándar: Scotland=`SQ`, South Korea=`KR`, Switzerland=`CH`,
  Sweden=`SE`, Australia=`AU`/Austria=`AT`, Saudi=`SA`/South Africa=`ZA`. Y
  «Congo» es ambiguo: aquí se usa DR Congo (`CD`=1657).
- **Odds de casas de apuestas** pre-torneo (ganador + «pasa de grupos»),
  quitándoles el margen y convirtiéndolas a un rating equivalente. Incorporan más
  información (lesiones, forma, sorteo) que el Elo puro, pero requieren invertir
  probabilidad → rating.

Mientras el JSON tenga los 48 nombres exactos del motor, el simulador no cambia.

## Resultado con Elo reales (eloratings.net, cierre 2025)

Cartera óptima **esperada** (20.000 simulaciones):

| Selección | Coste | Pts esperados |
|---|---:|---:|
| Brasil | 8 M | 41.3 |
| Colombia | 7 M | 39.4 |
| Suiza | 6 M | 36.3 |
| Ecuador | 5 M | 36.0 |
| Croacia | 6 M | 28.3 |
| Corea Sur | 3 M | 17.4 |
| Uzbekistán | 1 M | 1.7 |
| **Total** | **36 M** | **200.4** |

## Contraste modelo vs realidad

- Las **4 mejores del modelo son de 9 M€** (España 88.8, Argentina 68.9, Francia
  55, Inglaterra 52.9) — prohibidas. El precio ya era una predicción excelente.
- Entre las permitidas, el modelo con Elo reales acierta a **Suiza** (esperado
  36.3 → real 35, ¡clavada!), que está en la cartera óptima a posteriori.
- Pero **sobrevalora** a Colombia (39.4 → real 23), Ecuador (36 → 10) y Croacia
  (28.3 → 9), y **no anticipa** las sorpresas que ganaron la porra (Bélgica 43,
  México 38, Marruecos 32): su esperanza estaba por debajo.

**Prueba de fuego** — puntos REALES que habrían sacado las carteras del modelo:

| Modelo | Pts esperados | Pts reales | Ratio |
|---|---:|---:|---:|
| Elo reales (eloratings 2025) | 200.4 | **105** | 52 % |
| Elo aproximados a ojo (versión previa) | 180 | 141 | 70 % |
| Cartera óptima a posteriori | — | 201 | 100 % |

**Lección clave (y contraintuitiva):** mejores inputs suben el **valor esperado**
(180 → 200.4), que es la medida honesta de la calidad de la elección — pero
**bajan** el resultado *realizado* en esta edición (141 → 105). No es un fallo del
modelo: es la varianza de un único torneo. Los Elo reales apostaron por
Colombia/Ecuador/Croacia (fuertes sobre el papel, flojos en la cancha), mientras
que la versión a ojo tenía por casualidad a Bélgica y México, que petaron muy por
encima de su fuerza. Sobre muchos torneos ganaría la cartera de mayor esperanza;
en uno solo manda el balón. Ningún rating pre-torneo captura ese ~50 % de arriba.

## Variante sin la restricción de 9 M€

Quitando el veto a las cuatro más caras (España, Francia, Inglaterra, Argentina),
con los Elo reales el óptimo esperado es **264.7 pts** con solo **dos** de 9 M€:

| Selección | Coste | Pts esperados |
|---|---:|---:|
| España | 9 M | 88.8 |
| Argentina | 9 M | 68.9 |
| Suiza | 6 M | 36.3 |
| Ecuador | 5 M | 36.0 |
| Corea Sur | 3 M | 17.4 |
| Irán | 3 M | 15.6 |
| Uzbekistán | 1 M | 1.7 |
| **Total** | **36 M** | **264.7** |

No mete tres o cuatro caras: España es tan dominante (88.8) que, tras
España+Argentina (18 M€), rellenar con valor barato rinde más por M€ que añadir
Francia o Inglaterra.

## Los cuatro escenarios (la moraleja del torneo)

| Escenario | Pts esperados | Pts reales | % del techo |
|---|---:|---:|---:|
| **Elo reales, SIN veto** | 264.7 | **195** | **97 %** |
| Elo reales, CON veto | 200.4 | 105 | 52 % |
| Elo a ojo, CON veto | 180 | 141 | 70 % |
| Óptima a posteriori | — | 201 | 100 % |

- **Sin la restricción, la porra es casi trivial de optimizar:** un Elo decente
  da el **97 %** del máximo. Compras a los dos súper-favoritos (España +
  Argentina, la apuesta más predecible del cuadro — ambos llegaron a la final),
  rellenas con valor barato y casi tocas el techo. El modelo apenas acierta nada
  difícil.
- **La restricción de las 4 caras es TODA la gracia del juego:** al quitártelas,
  te empuja al tramo medio (6-8 M€) donde manda la varianza — sorpresas como
  Bélgica, México o Marruecos que ningún Elo predice. Ahí el modelo cae al
  52-70 %.
- Por eso el veto no es un capricho: convierte una compra obvia («pilla a los
  favoritos») en un ejercicio real de buscar valor infravalorado, que es donde de
  verdad se gana o se pierde la porra.

---

# Mejoras del modelo

## Mejora 1 — Ventaja de local *(implementada)*

El Mundial 2026 lo organizan **EEUU, Canadá y México**, que juegan todo el torneo
en casa. El Elo puro los infravaloraba: en la realidad **sobrerrindieron**
(México 38, Canadá 28, USA 27). Se añade un **boost de +100 de Elo** a los tres
anfitriones en cada partido (`HOST_ELO` en `sim/simulate.mjs`, knob ajustable;
mismo +100 que eloratings.net da al local, aquí permanente porque siempre juegan
en casa). No toca `ratings.json` — la fuerza cruda queda separada del efecto
local.

**Efecto (Elo reales, con veto de 9 M€):** el modelo ahora incorpora a México y
Canadá y sube del **52 % al 75 %** del techo realizado.

| Selección | Coste | Pts esperados |
|---|---:|---:|
| Brasil | 8 M | 40.9 |
| México | 6 M | 36.7 |
| Ecuador | 5 M | 35.4 |
| Canadá | 5 M | 33.2 |
| Suiza | 6 M | 32.0 |
| Irán | 3 M | 15.4 |
| Corea Sur | 3 M | 14.0 |
| **Total** | **36 M** | **207.7** |

Puntos **reales** de esta cartera: **151** (75 % del techo de 201), frente a los
105 (52 %) sin el boost. El sesgo de local era sistemático y corregible — justo el
tipo de error que un modelo sí puede arreglar (a diferencia de las sorpresas puras).

## Mejora 2 — Fuerza desde odds de casas *(implementada)*

Blend del Elo con las **cuotas outright** «ganar el Mundial». Fuente:
`sim/odds.json` — BetMGM (vía soccergraph.com), publicadas en **abril 2026**, campo
completo de 48, pre-torneo. Confirman de paso que «Congo» = **DR Congo**.

Mecanismo (en `sim/simulate.mjs`, knob `BLEND_W`):
1. cuota americana → probabilidad implícita (`+X → 100/(X+100)`);
2. quitar el margen normalizando a suma 1;
3. fuerza de mercado = `ln(prob)` (≈ lineal en Elo: el campeón encadena ~7
   victorias, así que `log(prob campeón)` ≈ suma de log-probs ∝ fuerza);
4. estandarizar Elo y mercado a z-scores y mezclar con peso `BLEND_W`
   (1 = solo Elo, 0 = solo mercado), devolviendo a escala Elo. `ratings.json` y
   `odds.json` quedan crudos; la mezcla vive en el código.

**Barrido del knob** (puntos reales, con local y veto de 9 M€):

| `BLEND_W` | Mezcla | Pts reales | % techo |
|---|---|---:|---:|
| 0 | solo mercado | 147 | 73 % |
| 0.25 | | 147 | 73 % |
| 0.5 | mitad y mitad | 133 | 66 % |
| 0.75 | | 151 | 75 % |
| 1 | solo Elo | 151 | 75 % |

**Resultado honesto:** las odds **no mejoraron** este torneo. Todo el barrido cae
en 66-75 %, dentro del ruido Monte Carlo. Mercado y Elo coinciden en los
favoritos; donde discreparon (el mercado subía a Portugal/USA, el Elo a Suiza), el
Elo acertó *esta vez*, y el 0.5 pilla lo peor de ambos (mete Portugal, que sacó
29, y suelta Suiza, que sacó 35). Es una señal legítima que **ayudaría de media**
—incorpora lesiones/forma/repescas que el Elo de cierre-2025 ignora— pero en una
sola edición vuelve a mandar la varianza. Se deja implementada con `BLEND_W=0.5`;
subirlo hacia 1 tira más del Elo.

## Mejora 3 — Modelo de partido calibrado *(pendiente)*

Sustituir los dos Poisson independientes (subestiman empates) por **Dixon-Coles**,
y **ajustar** `BASE` y el divisor `800` contra partidos internacionales históricos
en vez de fijarlos a ojo.

## Comparativa de escenarios (actualizada)

| Escenario | Pts esperados | Pts reales | % del techo |
|---|---:|---:|---:|
| Elo reales, SIN veto | 264.7 | 195 | 97 % |
| **Elo + local, CON veto** *(Mejora 1)* | 207.7 | **151** | **75 %** |
| Elo + odds + local, CON veto *(Mejora 2, w=0.5)* | 194.5 | 133 | 66 % |
| Elo reales, CON veto | 200.4 | 105 | 52 % |
| Elo a ojo, CON veto | 180 | 141 | 70 % |
| Óptima a posteriori | — | 201 | 100 % |

> Nota: el % del techo *realizado* es ruidoso entre modelos (66-75 %) porque el
> resultado de una sola edición está dominado por varianza. La ventaja de local
> (Mejora 1) es la única mejora que sube de forma clara y sistemática (corrige un
> sesgo real); las odds (Mejora 2) aportan señal pero no despuntan en esta foto.

## Uso

```bash
node sim/simulate.mjs [N]   # N simulaciones, por defecto 20000

# Variante sin el veto de 9 M€ (copia temporal, quita el filtro):
sed 's/\.filter((t) => COST\[t\] !== 9)//' sim/simulate.mjs > sim/_no9.mjs \
  && node sim/_no9.mjs 20000; rm sim/_no9.mjs
```

No se despliega en la web (el deploy solo sirve `index.html` + `data.js` + `dist/*.js`).
