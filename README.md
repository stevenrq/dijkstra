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

- **Escenario real precargado**: 20 ciudades y 29 corredores viales del país, con distancias y tiempos aproximados reales.
- **Editor completo del grafo**: agregar y eliminar puntos, arrastrarlos, crear y borrar corredores, editar los tres pesos, y marcar un corredor como de sentido único.
- **Origen y destino** seleccionables, y selector de la métrica a minimizar.
- **Ruta mínima** resaltada en el lienzo y desglosada tramo a tramo como una hoja de ruta, con el acumulado en cada punto.
- **Ejecución paso a paso** con reproducción, velocidad ajustable y barra de avance: muestra la tabla de distancias, la tabla de predecesores, el contenido de la cola de prioridad y la fórmula de cada relajación.
- **Validación de la precondición**: si algún peso de la métrica que se minimiza es negativo, la ejecución se bloquea y se explica por qué Dijkstra no aplica y qué algoritmo corresponde. Si el negativo está en otra métrica, la ruta se calcula y la fila de esa métrica en la comparativa explica que no aplica.
- **Origen y destino obligatorios**: sin los dos, el botón «Calcular» se desactiva y dice qué falta.
- **Lista y matriz de adyacencia** derivadas del mismo modelo que consume el algoritmo.
- **Panel de complejidad**: contrasta la cota O((V + A) · log V) con las operaciones realmente ejecutadas.
- Árbol de caminos mínimos completo, exportar e importar JSON, deshacer y rehacer, impresión del informe, modo claro y oscuro.
- **Pesos escritos a la colombiana**: «2.360.000» son dos millones trescientos sesenta mil y «12,5» lleva coma decimal.

### Importar un grafo

El archivo es el mismo que produce «Exportar»: `{ "version": 1, "graph": { … } }` (también se acepta el grafo suelto). Se valida campo por campo y un archivo inválido se rechaza con un mensaje que dice qué falla: versión distinta de 1, tipo de punto desconocido, `directed` que no sea `true`/`false`, identificadores vacíos, repetidos o reservados (`__proto__`, `constructor`, `prototype`), coordenadas o pesos no numéricos o fuera de rango, y corredores hacia puntos que no existen. Los pesos negativos sí se aceptan (se bloquean al calcular, con su explicación), para que todo lo que el editor permite hacer se pueda exportar y volver a cargar.

Límite: **200 puntos y 1000 corredores**. La traza paso a paso guarda una instantánea completa por paso; con un grafo de ese tamaño una ejecución tarda medio segundo, y con cinco veces más, medio minuto y más de un gigabyte de memoria.

### Imprimir

«Imprimir informe» (o Ctrl+P) saca el mapa y la hoja de ruta con sus tramos, totales y las tres rutas óptimas, en papel A4 o Carta, en claro aunque la pantalla esté en tema oscuro.

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
| `npm test` | Pruebas del núcleo, del formato, de la importación y del reductor |
| `npm run test:escritorio` | Prueba la interfaz en escritorio y tableta, en Chromium, WebKit y Firefox |
| `npm run test:movil` | Prueba la interfaz en cuatro teléfonos emulados, en Chromium y WebKit |
| `npm run typecheck` | Revisión de tipos (genera antes los tipos de rutas de Next) |
| `npm run lint` | Revisión de estilo |

---

## Cómo se verifica que es correcto

`npm test` ejecuta las pruebas unitarias sin navegador ni dependencias externas: el algoritmo y el montículo, el formato de cifras en es-CO y la lectura de números escritos a la colombiana, la validación, la importación (cada rechazo y la ida y vuelta exacta de lo que se exporta), la hoja de ruta y el reductor de estado (deshacer, identificadores, estado guardado corrupto).

**Casos con respuesta conocida a mano.** El escenario «Dígrafo académico de 5 nodos» tiene solución calculada en papel: desde A, d(B)=8, d(C)=9, d(D)=5, d(E)=7, y la ruta mínima A→C es **A→D→B→C con costo 9**, no la tentadora A→B→C que costaría 11. Ese grafo también obliga a ejercitar el borrado perezoso, porque D→B mejora a B *después* de que B ya estaba encolado.

**La prueba que de verdad demuestra corrección.** Sobre 200 grafos aleatorios con pesos no negativos se comprueban las dos **condiciones de optimalidad de camino mínimo**:

1. para todo nodo `v` alcanzable, `d(v) = d(previo(v)) + peso(previo(v), v)`
2. para todo arco `(u, v)` con `u` alcanzable, `d(v) ≤ d(u) + peso(u, v)`

Juntas caracterizan la solución de caminos mínimos: si se cumplen, el resultado **es** el óptimo. No hace falta confiar en casos escogidos a dedo.

### Pruebas en móvil

`npm run test:movil` levanta cuatro configuraciones de teléfono (iPhone 14, iPhone SE de 375 y de 320 px, Galaxy S9+) con Playwright, en Chromium y en WebKit (el motor de Safari), y comprueba en cada una: que nada se desborde a lo ancho, que ningún control de la barra quede cortado, que los rótulos del mapa sean legibles, que ningún número se derrame fuera de su nodo, que al tocar «Calcular» aparezca la ruta resaltada con sus ciudades rotuladas, que la animación avance, que al contraer el panel el mapa se reencuadre, y que arrastrar un nodo con el dedo lo mueva. Deja capturas de cada pantalla.

Es la prueba que encontró los problemas que a 520 px no se veían: rótulos de 6 px, controles empujados fuera de la pantalla y valores derramándose fuera de los nodos.

### Pruebas en escritorio y tableta

`npm run test:escritorio` recorre la aplicación en Chromium, WebKit y Firefox, a 1440, 1280, 1024 y 768 px, en tema claro y oscuro. Comprueba que no haya errores de consola ni de hidratación, la demostración de las tres métricas con sus totales y porcentajes, la comparativa, los pesos negativos, la lectura de números, el teclado y los atajos, importar y exportar, deshacer, el estado guardado corrupto, el cambio de ancho entre puntos de corte y la impresión (incluido el PDF). Escribe capturas y un `resumen.json`.

Las dos pruebas de interfaz se corren contra la compilación de producción:

```bash
npm run build
npx next start -p 3100
npm run test:escritorio -- --url=http://localhost:3100 --salida=capturas/escritorio
npm run test:movil -- --url=http://localhost:3100 --salida=capturas/movil
```

Opciones: `--navegadores=chromium,webkit,firefox` y, en la de escritorio, `--solo=grupo1,grupo2`.

### Comprobaciones manuales

1. Calcular Bogotá → Cartagena con cada métrica y verificar que las tres rutas difieren.
2. Sumar a mano los tramos de la hoja de ruta: debe coincidir con el total.
3. Poner un peso negativo en cualquier corredor: la ejecución se bloquea con la explicación.
4. Escenario «Grafo desconectado», ruta A → F: debe reportar que no existe ruta.
5. Escoger el mismo punto como origen y destino: costo 0, «1 punto · 0 tramos».
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
