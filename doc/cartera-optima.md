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
