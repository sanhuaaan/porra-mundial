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

## Mejora 3 — Modelo de partido calibrado *(implementada)*

Dos cambios en `sim/simulate.mjs`:

1. **Dixon-Coles** en vez de dos Poisson independientes. El Poisson independiente
   **subestima los empates**; DC corrige las cuatro celdas de marcador bajo con un
   parámetro `RHO=-0.13` (valor del paper de 1997). Se muestrea el marcador de la
   rejilla conjunta. Efecto medible: en un partido igualado (Δ=0) la probabilidad
   de empate sube de **25.8 % → 29 %**, que es la tasa real del fútbol
   internacional (~28-29 %).
2. **Divisor calibrado**, no a ojo. El `800` inventado se sustituye por un `DIV`
   que se **busca** al arrancar: el que hace que el resultado esperado del modelo
   (`P(gana) + ½·P(empate)`) reproduzca la curva de expectativa Elo estándar
   `We(Δ)=1/(1+10^(−Δ/400))`. Sale **DIV≈1060**. El 800 era demasiado agresivo:
   inflaba el marcador de los favoritos (España pasa de 78 → 66 pts esperados, más
   realista). Ajuste modelo↔Elo casi perfecto:

   | Δ Elo | modelo | We(Δ) |
   |---:|---:|---:|
   | 80 | 0.6 | 0.6 |
   | 160 | 0.7 | 0.7 |
   | 240 | 0.8 | 0.8 |
   | 320 | 0.9 | 0.9 |

**Resultado:** el modelo queda **más realista** (empates correctos, favoritos sin
inflar), pero la cartera óptima a `w=0.5` **no cambia** — mismas 7 selecciones,
**133 pts reales (66 %)**. Refinar las probabilidades afina los puntos esperados,
pero ni la decisión (knapsack sobre 9 tramos de coste) ni el resultado realizado
(dominado por varianza) se mueven.

*(`BASE=1.35` se deja fijo: es la media internacional real ~2.7 goles/partido ÷ 2,
no un número inventado. La rejilla DC hace la simulación ~3× más lenta: ~35 s para
20.000, aceptable.)*

## Mejora 4 — Cuadro real *(implementada)*

En vez de repartir los 32 clasificados **al azar** cada simulación, se usa la
plantilla del **cruce real** del Mundial (`sim/bracket.json`, extraída de `data.js`
por posición de grupo y reconstruida en orden de árbol). Cada slot lo fija la
posición (ganador/segundo de cada grupo, **exactos**); los 8 huecos de tercero se
rellenan por ranking (aprox.: en cada simulación clasifican terceros de grupos
distintos). Knob `REAL_BRACKET`.

**Efecto (con veto): 133 → 154 pts reales (66 % → 77 %)** — el mejor resultado con
restricción. El cuadro fija quién se cruza con quién: **Suiza (35) y USA (27)**
tenían caminos favorables que el sorteo aleatorio promediaba y por eso
infravaloraba. Como la ventaja de local, es un cambio **estructural**, y los
estructurales sí mueven la aguja.

## Mejora 5 — Estilo ataque/defensa *(implementada)*

Un solo Elo colapsa ataque y defensa. Cada equipo lleva ahora un sesgo de estilo
**strength-neutral** (`sim/style.json`): `atk` = marca más de lo que su fuerza
predice, `def` = encaja menos (residuos de `log(GF|GA por partido) ~ Elo`; fuente
GF/GA: eloratings.net, todos los tiempos). La media de goles se multiplica por
`exp(STYLE·(atk_A − def_B))`. No cambia quién gana (los sesgos promedian 0), pero sí
la **distribución de goles** → afecta a los bonus de goleador/menos goleado/GD.
Caras plausibles: Alemania/Inglaterra atacantes, Irán/Marruecos defensivos.

**Efecto (con veto): 154 → 148 pts reales (77 % → 74 %)** — bajó. El tilt subió el
bonus esperado de atacantes/defensivos modestos (entra Australia, sale Suiza). Es
un **refinamiento**, y como los otros refinamientos, se pierde en la varianza (y
con un proxy de estilo de *todos los tiempos*, poca señal). Se deja con `STYLE=0.1`;
0 lo desactiva.

---

# Síntesis: las cinco mejoras

| Mejora | Tipo | ¿Cambia el realizado? |
|---|---|---|
| **1. Ventaja de local** | **Estructural** | **Sí: 52 → 75 %** |
| 2. Odds de casas | Refinamiento | No (ruido) |
| 3. Dixon-Coles + calibrar | Refinamiento | No |
| **4. Cuadro real** | **Estructural** | **Sí: 66 → 77 %** |
| 5. Estilo ataque/defensa | Refinamiento | No (74 %, baja algo) |

La lección de las cinco juntas: **solo las mejoras que corrigen algo ESTRUCTURAL
—la ventaja de local y el cruce real del cuadro— mueven el resultado**. Las que
refinan la *precisión* de las probabilidades (odds, Dixon-Coles, estilo att/def)
hacen el modelo más honesto y mejor calibrado —lo correcto de cara a muchos
torneos— pero en **una sola edición** el techo lo pone la varianza, no la
sofisticación. Mejor modelo ≠ mejor porra concreta; sí mejor apuesta media.

## Comparativa de escenarios (actualizada)

Todas CON veto de 9 M€, cada una acumulando sobre la anterior:

| Escenario | Pts esperados | Pts reales | % del techo |
|---|---:|---:|---:|
| Elo a ojo | 180 | 141 | 70 % |
| Elo reales | 200.4 | 105 | 52 % |
| + local *(M1, estructural)* | 207.7 | **151** | **75 %** |
| + odds *(M2)* | 194.5 | 133 | 66 % |
| + Dixon-Coles *(M3)* | 179.9 | 133 | 66 % |
| **+ cuadro real *(M4, estructural)*** | 182 | **154** | **77 %** |
| + estilo att/def *(M5)* | 197.9 | 148 | 74 % |
| Óptima a posteriori | — | 201 | 100 % |

> Nota: los saltos claros llegan con las mejoras **estructurales** (local 52→75 %,
> cuadro real 66→77 %); los refinamientos (odds, Dixon-Coles, estilo) se mueven
> dentro del ruido de una sola edición, dominada por varianza.

## Predicción final del modelo completo, SIN restricción

Con las tres mejoras activas (blend Elo/odds `w=0.5` + local + Dixon-Coles
calibrado) y **sin el veto de 9 M€**, la cartera pre-torneo predicha es:

| Selección | Coste | Pts esperados | Pts reales |
|---|---:|---:|---:|
| España | 9 M | 66.0 | 76 |
| Argentina | 9 M | 55.3 | 78 |
| México | 6 M | 34.4 | 38 |
| Canadá | 5 M | 30.3 | 28 |
| Corea Sur | 3 M | 12.4 | 2 |
| Irán | 3 M | 9.3 | 3 |
| Uzbekistán | 1 M | −0.8 | −9 |
| **Total** | **36 M** | **206.8** | **216** |

Techo real **sin restricción** (`≥7`, `≤36 M€`, a posteriori): **254**
(Argentina 78, España 76, Francia 65, Canadá 28 + rellenos). El modelo captura
**216 = 85 %** del techo.

**Por qué acierta tanto aquí (85 %) y tan poco con el veto (66-75 %):** sin el
veto, el modelo compra lo **predecible** —España y Argentina, las dos apuestas más
seguras del cuadro, ambas llegaron a la final (76 y 78)— y la ventaja de local le
suma México (38) y Canadá (28). Cuatro aciertos gordos de siete. Lo único que dejó
de ganar frente al óptimo fue no meter una **tercera** de 9 M€ (Francia, 65): optó
por México + rellenos por valor esperado, y México (38) casi lo compensó.

Es el remate de toda la moraleja: **quitado el veto, el favorito es rey y un buen
modelo lo ve venir.** El juego solo se vuelve impredecible cuando la restricción de
las 4 caras te empuja al tramo medio, donde manda la varianza.

---

# Optimización avanzada #1 — la distribución, no la media

`sim/optimize.mjs` (con `sim/model.mjs`, el modelo ya refactorizado como módulo
reutilizable). El knapsack de `simulate.mjs` maximiza puntos **esperados** = suma
de medias marginales, y por linealidad de la esperanza **ignora toda correlación**
entre las selecciones propias. Pero en una sola porra manda la varianza. Aquí se
guarda la matriz equipo×simulación y se optimiza el subconjunto (recocido simulado,
objetivo no separable → sin DP) para métricas de riesgo que **sí** usan la
correlación (dos equipos del mismo grupo o que se cruzan pronto están
negativamente correlados → menos varianza):

| Objetivo | Cartera | media | mediana | p25 | σ | REAL |
|---|---|---:|---:|---:|---:|---:|
| media | Bra·Por·Méx·Can·Cor·Aus·Irán | 197.6 | 196 | 169 | 40.3 | 148 |
| mediana | *(idéntica)* | 197.6 | 196 | 169 | 40.3 | 148 |
| percentil-25 | Bra·**Ale**·Méx·Can·Cor·Aus·Irán | 197.0 | 195 | 170 | 39.0 | 140 |
| media−σ | *(idéntica a p25)* | 197.0 | 195 | 170 | 39.0 | 140 |
| **σ-mínima (ref)** | Gha·Tún·ArSaudí·Pan·Hai·CV·Cur | **−28.4** | −29 | −37 | **12.5** | −13 |

**El hallazgo:** optimizar el suelo/varianza en vez de la media **apenas cambia
nada** en el extremo competitivo — un swap (Portugal→Alemania), σ de 40.3 → 39.0,
suelo +2 pts. La referencia de σ-mínima muestra por qué: la varianza *sí* es
reducible (baja hasta 12.5), pero **solo tirando la media a −28** (7 equipos flojos
que fiablemente no puntúan). La frontera media-varianza es escarpada: donde quieres
estar (media alta) la varianza es **sistemática** —la lotería de «¿llega mi equipo
a la final?»— y **no es diversificable**.

Esto **cierra definitivamente** la pregunta de "no elegir 4 del mismo grupo /
repartir por el cuadro": el margen de cobertura existe, pero es **insignificante**
para una cartera competitiva. Ni la herramienta teóricamente correcta bate a la
varianza; solo confirma, una vez más, que en una sola porra el balón manda.

```bash
node sim/optimize.mjs [N]   # optimiza media / mediana / p25 / media−σ
```

---

# Refinamiento #3 — asignación FIFA de terceros

Completa la Mejora 4 (cuadro real). El fill anterior metía los 8 terceros en sus
huecos por **ranking**, sin respetar la regla FIFA de que **un tercero nunca juega
contra el ganador de su propio grupo** en dieciseisavos. Medido: el fill antiguo
generaba **~0.7 cruces imposibles por torneo** (un tercero contra su propio grupo,
que jamás ocurre en la realidad). Ahora se asigna con una biyección determinista
que evita el propio grupo (`assignThirds` en `model.mjs`).

La tabla oficial exacta (495 combinaciones) vive en el **Annex C** de las
regulaciones FIFA, en PDF, impracticable de transcribir; pero lo que importa para
los puntos es la **restricción** (un tercero se cruza con algún ganador igual), y
esa sí se respeta.

**Efecto:** corrige un bug real, pero el impacto agregado es **nulo** — cartera y
realizado idénticos (**148**). Un refinamiento más que se pierde en la varianza; su
valor es de **corrección**, no de resultado.

---

# Idea #4 — optimizar `P(ganar la porra)` *(NO implementada)*

Todo lo anterior maximiza **tus** puntos. Pero la porra no se gana puntuando mucho,
sino **puntuando más que los otros 6**. El objetivo correcto sería relativo:

> maximizar `P(tu total > el de los otros 6) = P(quedar 1.º)`

**Por qué sería potente:**
- Premia la **diferenciación**, no los puntos. Si todo el campo tiene España y Corea
  Sur (en esta porra, *los 7* participantes tienen Corea Sur), tenerlos tú no te
  despega de la manada. Para ganar necesitas exposición **distinta** al campo.
- Invierte la lógica del riesgo: de **líder** te cubres (te pareces al campo); de
  **tapado** te la juegas (anti-correlación con el campo, billete de lotería que
  paga cuando el favorito falla). El único sitio donde la correlación *entre
  carteras* decide quién gana.

**Por qué NO se implementa (limitación de fondo):** el objetivo necesita las
**carteras de los otros 6**, y **antes de que empiece la competición no las
conoces** — cada uno entrega en secreto. Sin el campo, `P(ganar)` no es calculable
*a priori*. Solo sería viable:
- **retrospectivamente** (como análisis a toro pasado, no como predicción), o
- si la porra **revela las apuestas antes del pitido inicial** (ventaja de último en
  entregar: ves el campo y optimizas tu respuesta), o
- con un **modelo especulativo del campo** (asumir que todos juegan cerca del óptimo
  y diferenciarte de esa cartera-consenso) — pero eso es inventarse a los rivales.

En esta porra las apuestas no se conocen de antemano, así que se queda como idea.
El motor está listo (matriz de simulaciones + carteras en `CONFIG.participants`): si
algún día se conocen los rosters antes de empezar, es un `optimize.mjs` con el
objetivo cambiado a `P(máximo de los rivales < tú)`.

## Uso

```bash
node sim/simulate.mjs [N]   # N simulaciones, por defecto 20000

# Variante sin el veto de 9 M€ (copia temporal, quita el filtro):
sed 's/\.filter((t) => COST\[t\] !== 9)//' sim/simulate.mjs > sim/_no9.mjs \
  && node sim/_no9.mjs 20000; rm sim/_no9.mjs
```

No se despliega en la web (el deploy solo sirve `index.html` + `data.js` + `dist/*.js`).
