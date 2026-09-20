# RutaÓptima — Dijkstra aplicado a logística de distribución

Actividad del curso de **Teoría de Grafos**.

Aplicación web que resuelve el problema de la **ruta de menor costo para distribuir mercancía sobre la red vial nacional de Colombia**, usando el algoritmo de **Dijkstra**. Permite escoger los nodos, definir las aristas, editar sus pesos, ver el costo de la ruta, resaltar la ruta mínima y recorrer el algoritmo paso a paso.

---

## La problemática

Una empresa de carga tiene que llevar mercancía entre ciudades. Cada corredor vial tiene tres costos distintos:

| Peso | Unidad | De qué depende |
|---|---|---|
| Costo de flete | COP | Terreno, peajes, combustible |
| Distancia | km | Longitud de la carretera |
| Tiempo | horas | Estado de la vía y pendiente |

El costo **no** es proporcional a la distancia: un paso de montaña como La Línea gasta mucho más combustible por kilómetro que un tramo plano del Caribe. Por eso la ruta más barata, la más corta y la más rápida **no son la misma ruta**, y el usuario puede escoger cuál de las tres métricas minimiza el algoritmo.

### La demostración

Con el escenario precargado, **Bogotá → Cartagena** da tres respuestas distintas:

| Métrica | Ruta óptima | Total |
|---|---|---|
| Costo | Bogotá → Bucaramanga → Barranquilla → Cartagena | $ 5.430.000 |
| Distancia | Bogotá → Medellín → Montería → Cartagena | 990 km |
| Tiempo | Bogotá → Tunja → Bucaramanga → Barranquilla → Cartagena | 21 h 12 min |

La ruta más barata recorre 10,1 % más kilómetros que la más corta; la más rápida cuesta 1,3 % más que la más barata. El panel «Las tres rutas óptimas» muestra esa comparación al calcular.

---

## Qué hace

- **Escenario real precargado**: 21 ciudades y 30 corredores viales del país, con distancias y tiempos aproximados reales.
- **Editor completo del grafo**: agregar y eliminar puntos, arrastrarlos, crear y borrar corredores, editar los tres pesos, y marcar un corredor como de sentido único.
- **Origen y destino** seleccionables, y selector de la métrica a minimizar.
- **Ruta mínima** resaltada en el lienzo y desglosada tramo a tramo como una hoja de ruta, con el acumulado en cada punto.
- **Ejecución paso a paso** con reproducción, velocidad ajustable y barra de avance: muestra la tabla de distancias, la tabla de predecesores, el contenido de la cola de prioridad y la fórmula de cada relajación.
- **Validación de la precondición**: si algún peso es negativo, la ejecución se bloquea y se explica por qué Dijkstra no aplica y qué algoritmo corresponde.
- **Lista y matriz de adyacencia** derivadas del mismo modelo que consume el algoritmo.
- **Panel de complejidad**: contrasta la cota O((V + A) · log V) con las operaciones realmente ejecutadas.
- Árbol de caminos mínimos completo, exportar e importar JSON, deshacer y rehacer, impresión del informe, modo claro y oscuro.

---

## El algoritmo

Todo el núcleo vive en `lib/graph/` y es **TypeScript puro**: no importa React ni Next, así que se puede ejecutar y verificar de forma aislada.

| Archivo | Contenido |
|---|---|
| `types.ts` | Modelo del grafo: nodos, aristas, pesos, métricas |
| `min-heap.ts` | Montículo binario mínimo — es lo que da la complejidad O((V + A) · log V) en vez de O(V²) |
| `adjacency.ts` | Lista y matriz de adyacencia, alcanzabilidad |
| `validation.ts` | Precondiciones: pesos no negativos, lazos, aristas paralelas |
| `dijkstra.ts` | El algoritmo, con la traza completa paso a paso |

### Decisiones de implementación

- **`decrease-key` por borrado perezoso.** En vez de reubicar una entrada del montículo cuando mejora la distancia de un nodo, se inserta una entrada nueva y la vieja se descarta al extraerla. Es la variante estándar, y las entradas obsoletas se muestran tachadas en la vista de la cola: verlas aparecer y descartarse explica la estrategia mejor que una nota al pie.
- **Instantáneas completas por paso**, no incrementos. Cuesta O(V) por paso, pero a cambio la barra de avance salta a cualquier punto sin rehacer la ejecución y no existe la clase de errores de «ir hacia atrás».
- **Se guarda qué arista concreta se usó** para llegar a cada nodo (`previousEdge`), además del predecesor. Sin eso, con aristas paralelas la reconstrucción de la ruta no puede saber cuál de las dos se usó y se resaltaría la equivocada.
- **Dirigido por arista, no global.** Un corredor vial es una sola carretera de doble sentido, así que se guarda una vez. Para pesos asimétricos reales se marca como dirigida y se agrega la inversa como otra arista.
- **Detenerse al consolidar el destino.** Cualquier nodo que quede en la cola tiene distancia mayor o igual, así que ninguna ruta pendiente podría mejorar la encontrada.

### Casos límite cubiertos

Origen igual al destino · destino inalcanzable · grafo desconectado · lazos · aristas paralelas · peso cero · peso negativo (bloqueado) · grafo vacío · nodo aislado.

---

## Cómo ejecutarlo

```bash
npm install
npm run dev        # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas del algoritmo (29 pruebas) |
| `npm run test:movil` | Prueba la interfaz en iPhone 14, iPhone SE y Galaxy S9+ |
| `npm run typecheck` | Revisión de tipos |
| `npm run lint` | Revisión de estilo |

---

## Cómo se verifica que es correcto

`npm test` ejecuta 29 pruebas sobre el núcleo, sin navegador ni dependencias externas.

**Casos con respuesta conocida a mano.** El escenario «Dígrafo académico de 5 nodos» tiene solución calculada en papel: desde A, d(B)=8, d(C)=9, d(D)=5, d(E)=7, y la ruta mínima A→C es **A→D→B→C con costo 9**, no la tentadora A→B→C que costaría 11. Ese grafo también obliga a ejercitar el borrado perezoso, porque D→B mejora a B *después* de que B ya estaba encolado.

**La prueba que de verdad demuestra corrección.** Sobre 200 grafos aleatorios con pesos no negativos se comprueban las dos **condiciones de optimalidad de camino mínimo**:

1. para todo nodo `v` alcanzable, `d(v) = d(previo(v)) + peso(previo(v), v)`
2. para todo arco `(u, v)` con `u` alcanzable, `d(v) ≤ d(u) + peso(u, v)`

Juntas caracterizan la solución de caminos mínimos: si se cumplen, el resultado **es** el óptimo. No hace falta confiar en casos escogidos a dedo.

### Pruebas en móvil

`npm run test:movil` levanta tres teléfonos emulados con Playwright (viewport, densidad de píxel y eventos táctiles reales) contra el servidor de desarrollo, y comprueba en cada uno: que nada se desborde a lo ancho, que ningún control de la barra quede cortado, que los rótulos del mapa sean legibles, que ningún número se derrame fuera de su nodo, que al tocar «Calcular» aparezca la ruta resaltada con sus ciudades rotuladas, que la animación avance, que al contraer el panel el mapa se reencuadre, y que arrastrar un nodo con el dedo lo mueva. Deja capturas de cada pantalla.

Es la prueba que encontró los problemas que a 520 px no se veían: rótulos de 6 px, controles empujados fuera de la pantalla y valores derramándose fuera de los nodos.

### Comprobaciones manuales

1. Calcular Bogotá → Cartagena con cada métrica y verificar que las tres rutas difieren.
2. Sumar a mano los tramos de la hoja de ruta: debe coincidir con el total.
3. Poner un peso negativo en cualquier corredor: la ejecución se bloquea con la explicación.
4. Escenario «Grafo desconectado», ruta A → F: debe reportar que no existe ruta.
5. Escoger el mismo punto como origen y destino: costo 0.
6. Recorrer la animación hasta el final: las distancias del último paso deben coincidir con el resultado.

---

## Accesibilidad

El lienzo nunca es la única forma de hacer algo: la pestaña **Editar** replica en formularios todo lo que se puede hacer arrastrando. Además, dentro del lienzo:

| Tecla | Acción |
|---|---|
| `V` `N` `E` `D` | Cambiar de herramienta |
| Flechas | Moverse al punto vecino en esa dirección |
| `Shift` + flechas | Mover el punto enfocado |
| `Entrar` | Empezar o terminar una conexión |
| `Supr` | Eliminar lo seleccionado |
| `Esc` | Cancelar la conexión en curso |

Cada estado del algoritmo se distingue por color **y** por una señal no cromática (relleno hueco o sólido, anillo doble, anillo punteado, trazo discontinuo), de modo que el lienzo sigue siendo legible con daltonismo o impreso en blanco y negro. Las explicaciones de cada paso se anuncian en una región `aria-live`.

---

## Tecnología

Next.js 16 (App Router) · React 19 · TypeScript en modo estricto · Tailwind CSS v4 · shadcn/ui sobre Base UI.

El grafo se dibuja con **SVG propio, sin librerías de grafos**: hacía falta control total para animar la relajación arista por arista, que es justamente lo que las librerías de nodos no exponen.

> Las distancias, tiempos y costos del escenario de Colombia son aproximaciones didácticas de los corredores reales, no cifras operativas.
