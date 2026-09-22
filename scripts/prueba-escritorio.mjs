import { chromium, firefox, webkit } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { inflateSync } from "node:zlib";

/*
 * Prueba de la interfaz en escritorio y tableta, en los tres motores.
 *
 * Complementa a `prueba-movil.mjs`: aquí se recorren los flujos completos
 * (la demostración de las tres métricas, la edición, deshacer, importar y
 * exportar, el teclado, la impresión) y la maquetación entre 768 y 1440 px.
 *
 * Uso:
 *   npm run test:escritorio -- --url=http://localhost:3100 --salida=capturas/escritorio
 *   npm run test:escritorio -- --navegadores=webkit --solo=demostracion,impresion
 *
 * Conviene correrla contra la compilación de producción (`next build` +
 * `next start`), que es lo que recomienda la guía de Playwright de Next.
 */

const { values: opciones, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string" },
    salida: { type: "string" },
    navegadores: { type: "string" },
    solo: { type: "string" },
  },
});

const URL_BASE = (opciones.url ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = opciones.salida ?? positionals[0] ?? "./capturas/escritorio";
const MOTORES = { chromium, webkit, firefox };
const NAVEGADORES = (opciones.navegadores ?? "chromium,webkit,firefox")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);
const SOLO = opciones.solo ? new Set(opciones.solo.split(",").map((g) => g.trim())) : null;

mkdirSync(OUT, { recursive: true });

const fallos = [];
const notas = [];
const resumen = {};
let donde = "";
const fallo = (msg) => {
  fallos.push(`[${donde}] ${msg}`);
  (resumen[donde] ??= []).push(msg);
};
const nota = (msg) => notas.push(`[${donde}] ${msg}`);
const comprobar = (condicion, msg) => {
  if (!condicion) fallo(msg);
  return Boolean(condicion);
};

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espacios duros y saltos a un solo espacio: así se comparan textos. */
const normalizar = (t) => (t ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
/** Solo los dígitos: cada motor agrupa los miles a su manera. */
const digitos = (t) => (t ?? "").replace(/\D/g, "");

async function esperarServidor(url, ms = 60_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      // Todavía no escucha.
    }
    await espera(500);
  }
  return false;
}

const LIENZO = 'svg[role="application"]';

/** Contexto nuevo por grupo: el localStorage de un grupo no contamina a otro. */
async function abrir(browser, { width = 1440, height = 900, oscuro = false, ruta = "/", init } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: oscuro ? "dark" : "light",
    locale: "es-CO",
    acceptDownloads: true,
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errores = vigilar(page);
  const respuesta = await page.goto(URL_BASE + ruta, { waitUntil: "load", timeout: 60_000 });
  if (ruta === "/") await page.locator(LIENZO).first().waitFor({ timeout: 30_000 }).catch(() => {});
  await espera(900);
  return { context, page, errores, respuesta };
}

/** Errores de consola, excepciones, respuestas fallidas e hidratación. */
function vigilar(page) {
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(`consola: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/no-existe")) {
      errores.push(`HTTP ${r.status()} ${r.url()}`);
    }
  });
  page.on("requestfailed", (r) => {
    const motivo = r.failure()?.errorText ?? "";
    // Las descargas y las navegaciones abortadas no son fallos de la app.
    if (/abort|cancel/i.test(motivo)) return;
    errores.push(`petición fallida: ${r.url()} ${motivo}`);
  });
  return errores;
}

function revisarErrores(errores, contexto = "") {
  const hidratacion = errores.filter((e) => /hydrat|did not match|#418|#425|#423/i.test(e));
  if (hidratacion.length) fallo(`error de hidratación ${contexto}: ${hidratacion[0]}`);
  const resto = errores.filter((e) => !hidratacion.includes(e));
  if (resto.length) fallo(`errores ${contexto}: ${resto.slice(0, 3).join(" | ")}`);
}

/** Zona que contiene los paneles de Ruta, Editar y Datos a este ancho. */
function zona(page) {
  const ancho = page.viewportSize().width;
  return ancho >= 1024 ? page.locator("aside") : page.locator("section.no-imprimir");
}

/** Panel de ejecución (Paso a paso, Tabla, Cola). */
const panelEjecucion = (page) => page.locator("section.no-imprimir");

async function pestana(page, nombre, dentro = zona(page)) {
  await dentro.getByRole("tab", { name: nombre, exact: true }).click();
  await espera(250);
}

async function escenario(page, nombre) {
  await page.getByRole("combobox", { name: "Escenario" }).click();
  await page.getByRole("option", { name: nombre }).click();
  await espera(500);
}

async function elegirPunto(page, indice, nombre) {
  await pestana(page, "Ruta");
  await zona(page).getByRole("combobox").nth(indice).click();
  await page.getByRole("option", { name: nombre, exact: true }).click();
  await espera(250);
}

async function metrica(page, nombre) {
  await pestana(page, "Ruta");
  await zona(page).getByRole("button", { name: nombre, exact: true }).click();
  await espera(300);
}

async function calcular(page) {
  await pestana(page, "Ruta");
  await zona(page).getByRole("button", { name: /Calcular ruta mínima/ }).click();
  await espera(600);
}

const hoja = (page) => zona(page).locator('section[aria-label="Hoja de ruta"]');

async function textoHoja(page) {
  if ((await hoja(page).count()) === 0) return "";
  return normalizar(await hoja(page).first().innerText());
}

async function contarNodos(page) {
  return page.locator(`${LIENZO} g[role="button"]`).count();
}

function nodo(page, nombre) {
  return page
    .locator(`${LIENZO} g[role="button"]`)
    .filter({ has: page.locator("title", { hasText: new RegExp(`^${nombre}`) }) })
    .first();
}

/** Tarjeta del corredor en la pestaña Editar. */
function tarjetaCorredor(page, texto) {
  return zona(page)
    .locator("div")
    .filter({ hasText: texto })
    .filter({ has: page.getByRole("textbox", { name: /Costo en COP/ }) })
    .last();
}

async function estadoGuardado(page) {
  await espera(800);
  return page.evaluate(() => JSON.parse(localStorage.getItem("rutaoptima-estado") ?? "null"));
}

async function captura(page, nombre, opciones = {}) {
  await page.screenshot({ path: join(OUT, `${nombre}.png`), ...opciones });
}

/** Luminancia relativa de un color CSS cualquiera (también oklch). */
async function luminancia(page, selectorOLocator) {
  const loc = typeof selectorOLocator === "string" ? page.locator(selectorOLocator) : selectorOLocator;
  return loc.first().evaluate((el) => {
    const color = getComputedStyle(el).color;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  });
}

async function idsRepetidos(page) {
  return page.evaluate(() => {
    const vistos = new Map();
    for (const el of document.querySelectorAll("[id]")) {
      vistos.set(el.id, (vistos.get(el.id) ?? 0) + 1);
    }
    return [...vistos].filter(([, n]) => n > 1).map(([id]) => id);
  });
}

/** Títulos de los marcadores y número de páginas de un PDF, sin dependencias. */
function leerPdf(buffer) {
  const crudo = buffer.toString("latin1");
  const partes = [crudo];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(crudo))) {
    const inicio = m.index + m[0].length;
    const fin = crudo.indexOf("endstream", inicio);
    if (fin < 0) break;
    try {
      partes.push(inflateSync(buffer.subarray(inicio, fin)).toString("latin1"));
    } catch {
      // No es un flujo comprimido.
    }
  }
  const todo = partes.join("\n");
  const titulos = [];
  for (const t of todo.matchAll(/\/Title\s*(<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\)])*)\))/g)) {
    if (t[2]) {
      const hex = t[2].replace(/\s/g, "");
      const bytes = Buffer.from(hex, "hex");
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        let s = "";
        for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
        titulos.push(s);
      } else titulos.push(bytes.toString("latin1"));
    } else titulos.push(t[3]);
  }
  const paginas = (todo.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return { titulos, paginas };
}

/* ------------------------------------------------------------------ *
 * Grupos
 * ------------------------------------------------------------------ */

const TAMANOS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
];

let axeFuente = null;
try {
  const require = createRequire(import.meta.url);
  axeFuente = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  axeFuente = null;
}

const GRUPOS = {
  async salud(browser, motor) {
    for (const t of TAMANOS) {
      for (const oscuro of [false, true]) {
        const tema = oscuro ? "oscuro" : "claro";
        donde = `${motor} salud ${t.width}x${t.height} ${tema}`;
        const { context, page, errores, respuesta } = await abrir(browser, { ...t, oscuro });
        comprobar(respuesta?.status() === 200, `la página respondió ${respuesta?.status()}`);

        const medidas = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          oscuro: document.documentElement.classList.contains("dark"),
          esquema: getComputedStyle(document.documentElement).colorScheme,
        }));
        comprobar(medidas.scroll <= medidas.client + 1, `desborde horizontal: ${medidas.scroll} > ${medidas.client}`);
        comprobar(medidas.oscuro === oscuro, `la clase dark no corresponde al tema ${tema}`);
        comprobar(
          oscuro ? /dark/.test(medidas.esquema) : !/dark/.test(medidas.esquema) && medidas.esquema !== "normal",
          `color-scheme es "${medidas.esquema}" en tema ${tema}`,
        );

        const asideVisible = await page.locator("aside").isVisible();
        comprobar(asideVisible === t.width >= 1024, `columna lateral visible=${asideVisible} a ${t.width} px`);
        const analisis = await page.getByRole("tab", { name: "Análisis" }).isVisible().catch(() => false);
        comprobar(analisis === t.width >= 1280, `pestaña Análisis visible=${analisis} a ${t.width} px`);

        const mapa = await page.evaluate((sel) => {
          const svg = document.querySelector(sel);
          if (!svg) return null;
          const r = svg.getBoundingClientRect();
          const gs = svg.querySelectorAll('g[role="button"]');
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const g of gs) {
            const b = g.getBoundingClientRect();
            minX = Math.min(minX, b.left); maxX = Math.max(maxX, b.right);
            minY = Math.min(minY, b.top); maxY = Math.max(maxY, b.bottom);
          }
          return { nodos: gs.length, usoW: (maxX - minX) / r.width, usoH: (maxY - minY) / r.height };
        }, LIENZO);
        if (!mapa) fallo("no hay lienzo");
        else {
          comprobar(mapa.nodos === 20, `el mapa tiene ${mapa.nodos} nodos, no 20`);
          comprobar(
            Math.max(mapa.usoW, mapa.usoH) >= 0.6,
            `el grafo desaprovecha el lienzo (${Math.round(mapa.usoW * 100)}% x ${Math.round(mapa.usoH * 100)}%)`,
          );
        }

        if (axeFuente && t.width === 1440) {
          await page.addScriptTag({ content: axeFuente });
          const violaciones = await page.evaluate(async () => {
            const r = await axe.run(document, {
              runOnly: ["duplicate-id-aria", "label", "button-name", "aria-input-field-name", "aria-toggle-field-name"],
            });
            return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
          });
          comprobar(violaciones.length === 0, `axe: ${violaciones.join(", ")}`);
        } else if (!axeFuente && t.width === 1440 && !oscuro) {
          nota("axe-core no está disponible; se omite la revisión automática de accesibilidad");
        }

        await captura(page, `${motor}-salud-${t.width}-${tema}`);
        revisarErrores(errores);
        await context.close();
      }
    }
  },

  async demostracion(browser, motor) {
    donde = `${motor} demostracion`;
    const { context, page, errores } = await abrir(browser);
    const esperado = {
      Costo: {
        total: "5430000",
        ruta: ["Bogotá D.C.", "Bucaramanga", "Barranquilla", "Cartagena"],
        otros: ["1090", "21 h 42 min"],
      },
      Distancia: {
        total: "990",
        ruta: ["Bogotá D.C.", "Medellín", "Montería", "Cartagena"],
        otros: ["6075000", "21 h 36 min"],
      },
      Tiempo: {
        total: "21 h 12 min",
        ruta: ["Bogotá D.C.", "Tunja", "Bucaramanga", "Barranquilla", "Cartagena"],
        otros: ["5500000", "1100"],
      },
    };

    for (const [nombre, e] of Object.entries(esperado)) {
      await metrica(page, nombre);
      await calcular(page);
      const texto = await textoHoja(page);
      if (!comprobar(texto, `${nombre}: no apareció la hoja de ruta`)) continue;
      comprobar(texto.includes(`Ruta de menor ${nombre.toLowerCase()}`), `${nombre}: falta el título de la hoja`);
      const totalTexto = normalizar(await hoja(page).locator("header p").nth(1).innerText());
      comprobar(
        nombre === "Tiempo" ? totalTexto === e.total : digitos(totalTexto) === e.total,
        `${nombre}: total "${totalTexto}", se esperaba ${e.total}`,
      );
      const ciudades = (await hoja(page).locator("ol > li p.font-medium").allInnerTexts()).map(normalizar);
      comprobar(
        ciudades.join(" > ") === e.ruta.join(" > "),
        `${nombre}: ruta ${ciudades.join(" > ")}, se esperaba ${e.ruta.join(" > ")}`,
      );
      comprobar(texto.includes(`${e.ruta.length} puntos · ${e.ruta.length - 1} tramos`), `${nombre}: conteo de puntos y tramos`);
      const pie = normalizar(await hoja(page).locator("footer").innerText());
      for (const o of e.otros) {
        comprobar(/h/.test(o) ? pie.includes(o) : digitos(pie).includes(o), `${nombre}: el pie no trae ${o} (${pie})`);
      }
      const acumulados = (await hoja(page).getByText(/^Acumulado:/).allInnerTexts()).map(normalizar);
      const ultimo = acumulados.at(-1) ?? "";
      comprobar(
        nombre === "Tiempo" ? ultimo.endsWith(e.total) : digitos(ultimo) === e.total,
        `${nombre}: el último acumulado (${ultimo}) no coincide con el total`,
      );
      const resaltadas = await page.locator(`${LIENZO} path[class*="stroke-graph-path"]`).count();
      comprobar(resaltadas >= e.ruta.length - 1, `${nombre}: solo ${resaltadas} aristas resaltadas`);
      await captura(page, `${motor}-demostracion-${nombre.toLowerCase()}`);
    }

    await metrica(page, "Costo");
    await calcular(page);
    const comparativa = normalizar(await zona(page).locator('section[aria-labelledby]').filter({ hasText: "Las tres rutas óptimas" }).first().innerText().catch(() => ""));
    comprobar(comparativa.includes("Las tres rutas óptimas"), "no aparece la comparativa");
    comprobar(comparativa.includes("10,1 %"), `la comparativa no dice «10,1 %»: ${comparativa.slice(0, 200)}`);
    comprobar(comparativa.includes("1,3 %"), "la comparativa no dice «1,3 %»");
    comprobar(!/\d\.\d %/.test(comparativa), "porcentajes con punto decimal");
    revisarErrores(errores);
    await context.close();
  },

  async comparativa(browser, motor) {
    donde = `${motor} comparativa`;
    const { context, page, errores } = await abrir(browser);
    await calcular(page);
    const fila = (n) => zona(page).getByRole("button", { name: new RegExp(`^Menor ${n}`) });
    await fila("distancia").click();
    await espera(600);
    let texto = await textoHoja(page);
    comprobar(texto.includes("Ruta de menor distancia"), "tocar «Menor distancia» borró el resultado en vez de mostrar esa ruta");
    comprobar(digitos(texto).startsWith("990"), "tocar «Menor distancia» no muestra 990 km");
    comprobar(
      (await zona(page).getByRole("button", { name: "Distancia", exact: true }).getAttribute("aria-pressed")) === "true",
      "«Minimizar» no quedó en Distancia",
    );
    await fila("distancia").click().catch(() => {});
    await espera(400);
    comprobar((await textoHoja(page)).includes("Ruta de menor distancia"), "tocar la fila activa borró el resultado");
    await metrica(page, "Tiempo");
    texto = await textoHoja(page);
    comprobar(texto.includes("Ruta de menor tiempo"), "cambiar «Minimizar» con un resultado a la vista no recalculó");
    await captura(page, `${motor}-comparativa`);
    revisarErrores(errores);
    await context.close();
  },

  async negativos(browser, motor) {
    donde = `${motor} negativos`;
    let { context, page, errores } = await abrir(browser);
    await pestana(page, "Editar");
    await tarjetaCorredor(page, "Cartagena ↔ Barranquilla").getByRole("textbox", { name: /Costo en COP/ }).fill("-1");
    await calcular(page);
    const alerta = normalizar(await zona(page).getByRole("alert").first().innerText().catch(() => ""));
    comprobar(alerta.includes("Dijkstra exige pesos no negativos"), "un costo negativo no bloqueó el cálculo con la explicación");
    comprobar(alerta.includes("Bellman-Ford"), "la explicación no menciona Bellman-Ford");
    await captura(page, `${motor}-negativo-activo`);
    revisarErrores(errores, "(activo)");
    await context.close();

    ({ context, page, errores } = await abrir(browser));
    await pestana(page, "Editar");
    await tarjetaCorredor(page, "Cartagena ↔ Barranquilla").getByRole("textbox", { name: /Tiempo en h/ }).fill("-0,5");
    await metrica(page, "Costo");
    await calcular(page);
    const texto = await textoHoja(page);
    comprobar(texto.includes("Ruta de menor costo"), "un tiempo negativo bloqueó minimizar el costo");
    const todo = normalizar(await zona(page).innerText());
    comprobar(!/-\d+ h -\d+ min/.test(todo), "aparece una duración negativa mal formada («-1 h -30 min»)");
    comprobar(/No aplica/.test(todo), "la comparativa no explica que el tiempo no aplica por pesos negativos");
    comprobar(!todo.includes("Cada métrica lleva por un camino distinto"), "la comparativa afirma que las tres rutas difieren aunque falta una");
    await captura(page, `${motor}-negativo-inactivo`);
    revisarErrores(errores, "(inactivo)");
    await context.close();
  },

  async numeros(browser, motor) {
    donde = `${motor} numeros`;
    const { context, page, errores } = await abrir(browser);
    await pestana(page, "Editar");
    const costo = tarjetaCorredor(page, "Cartagena ↔ Barranquilla").getByRole("textbox", { name: /Costo en COP/ });
    await costo.fill("1.505.000");
    await costo.blur();
    comprobar((await costo.getAttribute("aria-invalid")) !== "true", "«1.505.000» se marca como inválido");
    const guardado = await estadoGuardado(page);
    const arista = guardado?.graph?.edges?.find((e) => e.id === "ctg-baq");
    comprobar(arista?.weights?.cost === 1505000, `«1.505.000» se guardó como ${arista?.weights?.cost}`);

    // Diálogo de corredor nuevo.
    await page.locator("main").getByRole("button", { name: "Conectar dos puntos" }).click();
    await nodo(page, "Bogotá").click();
    await nodo(page, "Cúcuta").click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo corredor" });
    await dialogo.waitFor();
    const crear = dialogo.getByRole("button", { name: "Crear corredor" });
    await dialogo.getByLabel("Costo (COP)").fill("");
    comprobar(await crear.isDisabled(), "«Nuevo corredor» acepta un costo vacío");
    await dialogo.getByLabel("Costo (COP)").fill("1.500.000");
    comprobar(await crear.isEnabled(), "«Nuevo corredor» rechaza «1.500.000»");
    await captura(page, `${motor}-numeros-dialogo`);
    await page.keyboard.press("Escape");
    revisarErrores(errores);
    await context.close();
  },

  async desconectado(browser, motor) {
    donde = `${motor} desconectado`;
    const { context, page, errores } = await abrir(browser);
    await escenario(page, "Grafo desconectado");
    await calcular(page);
    const texto = normalizar(await zona(page).innerText());
    comprobar(texto.includes("No existe ruta"), "A → F no reporta «No existe ruta»");
    comprobar(/5 de 6 puntos/.test(texto), "no dice «5 de 6 puntos»");
    const explicacion = normalizar(await panelEjecucion(page).locator("p[aria-live]").first().innerText().catch(() => ""));
    comprobar(/inalcanzable/.test(explicacion), `el último paso no dice que F es inalcanzable (${explicacion.slice(0, 80)})`);
    revisarErrores(errores);
    await context.close();
  },

  async "mismo-punto"(browser, motor) {
    donde = `${motor} mismo-punto`;
    const { context, page, errores } = await abrir(browser);
    await elegirPunto(page, 1, "Bogotá D.C.");
    await calcular(page);
    const texto = await textoHoja(page);
    comprobar(/\$\s?0\b/.test(texto), `Bogotá → Bogotá no da $ 0 (${texto.slice(0, 80)})`);
    comprobar(texto.includes("1 punto · 0 tramos"), "falta el singular «1 punto · 0 tramos»");
    revisarErrores(errores);
    await context.close();
  },

  async reproduccion(browser, motor) {
    donde = `${motor} reproduccion`;
    const { context, page, errores } = await abrir(browser);
    await calcular(page);
    const panel = panelEjecucion(page);
    await pestana(page, "Paso a paso", panel);
    const contador = panel.getByText(/Paso \d+ de \d+/).first();
    const total = Number(/de (\d+)/.exec(await contador.innerText())?.[1] ?? 0);
    comprobar(total === 76, `la ejecución por costo tiene ${total} pasos, se esperaban 76`);
    await panel.getByRole("button", { name: "Primer paso" }).click();
    comprobar((await contador.innerText()).startsWith("Paso 1 de"), "«Primer paso» no volvió al paso 1");
    await panel.getByRole("button", { name: /Velocidad 4/ }).click();
    await panel.getByRole("button", { name: "Reproducir" }).click();
    await panel.getByText(new RegExp(`Paso ${total} de ${total}`)).first().waitFor({ timeout: 40_000 }).catch(() => fallo("la reproducción no llegó al final"));
    const final = normalizar(await panel.locator("p[aria-live]").first().innerText());
    comprobar(
      final.includes("Fin. La ruta mínima de Bogotá D.C. a Cartagena recorre 4 nodos"),
      `el último paso no resume la ruta: ${final.slice(0, 100)}`,
    );
    await pestana(page, "Tabla", panel);
    const fila = normalizar(await panel.getByRole("row").filter({ hasText: "Cartagena" }).first().innerText());
    comprobar(digitos(fila).includes("5430000") && fila.includes("Consolidado"), `fila final de Cartagena: ${fila}`);
    await captura(page, `${motor}-reproduccion-tabla`);
    revisarErrores(errores);
    await context.close();
  },

  async deslizador(browser, motor) {
    donde = `${motor} deslizador`;
    const { context, page, errores } = await abrir(browser);
    await calcular(page);
    const panel = panelEjecucion(page);
    const deslizadores = panel.getByRole("slider");
    const n = await deslizadores.count();
    comprobar(n === 1, `el deslizador tiene ${n} asas`);
    comprobar((await panel.getByRole("slider", { name: /Paso/ }).count()) === 1, "el asa del deslizador no tiene nombre accesible");
    const texto = (await deslizadores.first().getAttribute("aria-valuetext")) ?? "";
    comprobar(/Paso \d+ de \d+/.test(texto), `aria-valuetext del deslizador: "${texto}"`);
    const repetidos = await idsRepetidos(page);
    comprobar(repetidos.length === 0, `ids repetidos: ${repetidos.join(", ")}`);
    revisarErrores(errores);
    await context.close();
  },

  async teclado(browser, motor) {
    donde = `${motor} teclado`;
    const { context, page, errores } = await abrir(browser);
    const etiquetaActiva = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    await nodo(page, "Bogotá").click();
    await nodo(page, "Bogotá").focus();
    await page.keyboard.press("ArrowUp");
    await espera(150);
    comprobar((await etiquetaActiva()).startsWith("Bucaramanga"), `tras ↑ el foco quedó en «${(await etiquetaActiva()).split(".")[0]}»`);
    await page.keyboard.press("ArrowUp");
    await espera(150);
    const segunda = await etiquetaActiva();
    comprobar(segunda.startsWith("Valledupar"), `tras ↑↑ el foco quedó en «${segunda.split(".")[0]}»`);

    const anillo = await page.evaluate(() => {
      const g = document.activeElement;
      const c = g?.querySelector(".anillo-foco");
      return c ? Number(getComputedStyle(c).opacity) : 0;
    });
    comprobar(anillo > 0, "el nodo enfocado no muestra un anillo de foco");

    await page.keyboard.press("Delete");
    await espera(300);
    const tras = await contarNodos(page);
    comprobar(tras === 19, `Supr dejó ${tras} nodos (se esperaban 19)`);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await espera(300);
    comprobar((await contarNodos(page)) === 20, "un solo Deshacer no restauró el nodo borrado con Supr");
    revisarErrores(errores);
    await context.close();
  },

  async atajos(browser, motor) {
    donde = `${motor} atajos`;
    const { context, page, errores } = await abrir(browser);
    await page.getByRole("combobox", { name: "Escenario" }).click();
    await espera(300);
    await page.keyboard.press("d");
    await page.keyboard.press("Escape");
    await espera(300);
    const eliminar = page.locator("main").getByRole("button", { name: "Eliminar", exact: true });
    comprobar((await eliminar.getAttribute("aria-pressed")) !== "true", "escribir «d» en el selector de escenario activó la herramienta Eliminar");

    await nodo(page, "Cali").click();
    await zona(page).getByRole("button", { name: /Calcular ruta mínima/ }).focus();
    await page.keyboard.press("Delete");
    await espera(300);
    comprobar((await contarNodos(page)) === 20, "Supr con el foco en un botón borró el nodo seleccionado");
    revisarErrores(errores);
    await context.close();
  },

  async "etiquetas-ids"(browser, motor) {
    donde = `${motor} etiquetas-ids`;
    const { context, page, errores } = await abrir(browser, { width: 768, height: 1024 });
    await pestana(page, "Ruta", page.locator("section.no-imprimir"));
    const origen = page.getByRole("combobox", { name: "Origen" }).filter({ visible: true });
    comprobar((await origen.count()) === 1, "a 768 px el selector visible de «Origen» no tiene nombre");
    const destino = page.getByRole("combobox", { name: "Destino" }).filter({ visible: true });
    comprobar((await destino.count()) === 1, "a 768 px el selector visible de «Destino» no tiene nombre");
    const repetidos = await idsRepetidos(page);
    comprobar(repetidos.length === 0, `ids repetidos: ${repetidos.join(", ")}`);
    await captura(page, `${motor}-etiquetas-768`);
    revisarErrores(errores);
    await context.close();
  },

  async "importar-exportar"(browser, motor) {
    donde = `${motor} importar-exportar`;
    const { context, page, errores } = await abrir(browser);
    const exportar = async () => {
      const [descarga] = await Promise.all([
        page.waitForEvent("download", { timeout: 10_000 }),
        page.getByRole("button", { name: "Exportar el grafo como JSON" }).click(),
      ]);
      const ruta = join(OUT, `${motor}-${descarga.suggestedFilename()}`);
      await descarga.saveAs(ruta);
      return { nombre: descarga.suggestedFilename(), contenido: JSON.parse(readFileSync(ruta, "utf8")) };
    };

    try {
      const { nombre, contenido } = await exportar();
      comprobar(nombre === "colombia.json", `nombre de archivo ${nombre}`);
      comprobar(contenido.version === 1, "el archivo no trae version 1");
      comprobar(contenido.graph?.nodes?.length === 20 && contenido.graph?.edges?.length === 29, "el archivo no trae 20 nodos y 29 corredores");
    } catch (e) {
      fallo(`la exportación no descargó nada: ${e.message.slice(0, 100)}`);
    }

    const importar = async (nombre, datos) => {
      await page.reload();
      await espera(900);
      await page.locator('input[type="file"]').setInputFiles({
        name: nombre,
        mimeType: "application/json",
        buffer: Buffer.from(typeof datos === "string" ? datos : JSON.stringify(datos)),
      });
      const ok = page.getByText("Grafo importado", { exact: true });
      const malo = page.getByText("No se pudo importar el archivo", { exact: true });
      await Promise.race([ok.first().waitFor(), malo.first().waitFor()]).catch(() => {});
      const aceptado = await ok.first().isVisible().catch(() => false);
      const mensaje = aceptado ? "" : normalizar(await malo.first().locator("..").innerText().catch(() => ""));
      return { aceptado, mensaje };
    };

    // Un grafo con peso negativo se puede editar y exportar, así que tiene que poder volver.
    await pestana(page, "Editar");
    await tarjetaCorredor(page, "Cartagena ↔ Barranquilla").getByRole("textbox", { name: /Costo en COP/ }).fill("-5");
    await espera(700);
    try {
      const { contenido } = await exportar();
      const r = await importar("negativo.json", contenido);
      comprobar(r.aceptado, `no se pudo reimportar un grafo exportado con peso negativo (${r.mensaje})`);
    } catch (e) {
      fallo(`exportar/importar con peso negativo: ${e.message.slice(0, 100)}`);
    }

    const base = {
      version: 1,
      graph: {
        id: "prueba",
        name: "Prueba",
        description: "",
        nodes: [
          { id: "A", label: "A", kind: "hub", x: 0, y: 0 },
          { id: "B", label: "B", kind: "hub", x: 100, y: 0 },
        ],
        edges: [{ id: "A-B", from: "A", to: "B", directed: false, weights: { cost: 1, distance: 1, time: 1 } }],
      },
    };
    const variantes = {
      "version-2": { ...base, version: 2 },
      "tipo-desconocido": { ...base, graph: { ...base.graph, nodes: [{ ...base.graph.nodes[0], kind: "nave" }, base.graph.nodes[1]] } },
      "id-proto": '{"version":1,"graph":{"id":"p","name":"p","description":"","nodes":[{"id":"__proto__","label":"X","kind":"hub","x":0,"y":0}],"edges":[]}}',
      "demasiados-puntos": {
        ...base,
        graph: {
          ...base.graph,
          nodes: Array.from({ length: 201 }, (_, i) => ({ id: `n${i}`, label: `n${i}`, kind: "hub", x: i, y: 0 })),
          edges: [],
        },
      },
      "dirigido-texto": { ...base, graph: { ...base.graph, edges: [{ ...base.graph.edges[0], directed: "true" }] } },
    };
    for (const [nombre, datos] of Object.entries(variantes)) {
      const r = await importar(`${nombre}.json`, datos);
      comprobar(!r.aceptado, `se aceptó el archivo inválido «${nombre}»`);
    }
    await captura(page, `${motor}-importar-error`);
    revisarErrores(errores);
    await context.close();
  },

  async deshacer(browser, motor) {
    donde = `${motor} deshacer`;
    let { context, page, errores } = await abrir(browser);
    await escenario(page, "Lienzo en blanco");
    await pestana(page, "Editar");
    const agregar = () => zona(page).getByRole("button", { name: "Agregar punto" }).click();
    await agregar();
    await espera(200);
    await page.getByRole("button", { name: "Vaciar el grafo" }).click();
    await espera(200);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await espera(200);
    await agregar();
    const guardado = await estadoGuardado(page);
    const ids = guardado?.graph?.nodes?.map((n) => n.id) ?? [];
    comprobar(ids.length === 2 && new Set(ids).size === 2, `ids tras Vaciar → Deshacer → Agregar: ${ids.join(", ")}`);
    revisarErrores(errores.filter((e) => !/same key/.test(e)), "(ids)");
    await context.close();

    ({ context, page, errores } = await abrir(browser));
    await pestana(page, "Editar");
    await zona(page).getByRole("button", { name: "Eliminar Bogotá D.C." }).click();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await espera(200);
    await pestana(page, "Ruta");
    comprobar(
      await zona(page).getByRole("button", { name: /Calcular ruta mínima/ }).isEnabled(),
      "tras borrar el origen y deshacer, «Calcular» queda deshabilitado",
    );
    const origen = normalizar(await zona(page).getByRole("combobox").first().innerText());
    comprobar(origen.includes("Bogotá"), `tras deshacer, el origen es «${origen}»`);

    await pestana(page, "Editar");
    const nombre = zona(page).getByRole("textbox", { name: "Nombre de Cartagena" });
    await nombre.click();
    await nombre.press("End");
    await nombre.pressSequentially(" Puerto de la Costa Caribe Norte", { delay: 5 });
    await nombre.blur();
    await espera(200);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await espera(300);
    const restaurado = await zona(page).getByRole("textbox", { name: /^Nombre de Cartagena/ }).first().inputValue().catch(() => "?");
    comprobar(restaurado === "Cartagena", `un Deshacer tras renombrar dejó «${restaurado}»`);
    revisarErrores(errores, "(origen)");
    await context.close();
  },

  async escenarios(browser, motor) {
    donde = `${motor} escenarios`;
    const { context, page, errores } = await abrir(browser);
    await pestana(page, "Editar");
    await zona(page).getByRole("textbox", { name: "Nombre de Bogotá D.C." }).fill("Bogotá Centro");
    await espera(200);
    await escenario(page, "Red nacional de distribución (Colombia)");
    await pestana(page, "Editar");
    comprobar(
      (await zona(page).getByRole("textbox", { name: /^Nombre de Bogotá Centro/ }).count()) === 1,
      "reelegir el mismo escenario borró los cambios",
    );
    await escenario(page, "Dígrafo académico de 5 nodos");
    comprobar((await contarNodos(page)) === 5, "no se cargó el dígrafo");
    await page.getByRole("button", { name: "Deshacer" }).click({ timeout: 3000 }).catch(() => fallo("no se puede deshacer el cambio de escenario"));
    await espera(400);
    comprobar((await contarNodos(page)) === 20, "deshacer no volvió a la red de Colombia");
    revisarErrores(errores);
    await context.close();
  },

  async almacenamiento(browser, motor) {
    for (const [caso, valor] of [
      ["sin-grafo", '{"version":1}'],
      ["metrica-invalida", '{"version":1,"metric":"nave"}'],
      ["json-roto", "{no es json"],
    ]) {
      donde = `${motor} almacenamiento ${caso}`;
      const { context, page, errores } = await abrir(browser, {
        init: `(() => { if (!sessionStorage.getItem("sembrado")) { sessionStorage.setItem("sembrado", "1"); localStorage.setItem("rutaoptima-estado", ${JSON.stringify(valor)}); } })()`,
      });
      comprobar((await contarNodos(page)) === 20, "el estado guardado corrupto no volvió al escenario por defecto");
      await calcular(page).catch(() => fallo("no se pudo calcular"));
      comprobar((await textoHoja(page)).includes("Ruta de menor"), "no se puede calcular tras un estado guardado corrupto");
      await pestana(page, "Datos").catch(() => {});
      revisarErrores(errores);
      await context.close();
    }
  },

  async persistencia(browser, motor) {
    donde = `${motor} persistencia`;
    const { context, page, errores } = await abrir(browser);
    await pestana(page, "Editar");
    await zona(page).getByRole("textbox", { name: "Nombre de Bogotá D.C." }).fill("Bogotá Centro");
    await zona(page).getByRole("textbox", { name: /^Nombre de Bogotá Centro/ }).blur();
    await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
    await espera(900);
    await page.reload();
    await espera(1200);
    await pestana(page, "Editar");
    comprobar(
      (await zona(page).getByRole("textbox", { name: /^Nombre de Bogotá Centro/ }).count()) === 1,
      "el nombre editado no sobrevivió a la recarga",
    );
    comprobar(await page.evaluate(() => document.documentElement.classList.contains("dark")), "el tema oscuro no sobrevivió a la recarga");
    revisarErrores(errores);
    await context.close();
  },

  async impresion(browser, motor) {
    for (const oscuro of [false, true]) {
      const tema = oscuro ? "oscuro" : "claro";
      donde = `${motor} impresion ${tema}`;
      const { context, page, errores } = await abrir(browser, {
        init: `localStorage.setItem("rutaoptima-tema", "${oscuro ? "dark" : "light"}")`,
      });
      await calcular(page);
      for (const ancho of [680, 703, 943, 1009]) {
        await page.setViewportSize({ width: ancho, height: 1000 });
        await page.emulateMedia({ media: "print" });
        await espera(400);
        const titulo = page.getByText("Ruta de menor costo").filter({ visible: true });
        const visible = (await titulo.count()) > 0;
        comprobar(visible, `a ${ancho} px la hoja de ruta no se imprime`);
        comprobar(!(await page.locator("header").first().isVisible()), `a ${ancho} px se imprime la barra superior`);
        comprobar(!(await page.locator("section.no-imprimir").isVisible()), `a ${ancho} px se imprime el panel de ejecución`);
        if (visible) {
          const lum = await luminancia(page, titulo);
          comprobar(lum < 0.35, `a ${ancho} px el texto impreso es claro (luminancia ${lum.toFixed(2)})`);
          const recorte = await titulo.first().evaluate((el) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const s = getComputedStyle(p);
              if (/hidden|clip/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p.className.slice(0, 60);
            }
            return null;
          });
          comprobar(!recorte, `a ${ancho} px un contenedor recorta el informe (${recorte})`);
        }
        await captura(page, `${motor}-impresion-${tema}-${ancho}`, { fullPage: true });
        await page.emulateMedia({ media: null });
      }

      if (motor === "chromium") {
        await page.setViewportSize({ width: 1440, height: 900 });
        for (const formato of ["A4", "Letter"]) {
          for (const horizontal of [false, true]) {
            const nombre = `${motor}-informe-${tema}-${formato}-${horizontal ? "horizontal" : "vertical"}.pdf`;
            const pdf = await page.pdf({ format: formato, landscape: horizontal, tagged: true, outline: true, printBackground: true });
            writeFileSync(join(OUT, nombre), pdf);
            const { titulos, paginas } = leerPdf(pdf);
            if (titulos.length === 0) nota(`${nombre}: el PDF no trae marcadores`);
            comprobar(titulos.some((t) => t.includes("Hoja de ruta")), `${nombre}: el PDF no contiene la «Hoja de ruta» (marcadores: ${titulos.slice(0, 4).join(", ")})`);
            comprobar(paginas >= 1 && paginas <= 3, `${nombre}: ${paginas} páginas`);
          }
        }
      }
      revisarErrores(errores);
      await context.close();
    }
  },

  async cortes(browser, motor) {
    donde = `${motor} cortes`;
    const { context, page, errores } = await abrir(browser, { width: 768, height: 1024 });
    const seccion = page.locator("section.no-imprimir");
    const pestanasVisibles = async () => {
      const seleccionadas = seccion.getByRole("tab", { selected: true }).filter({ visible: true });
      const panel = seccion.getByRole("tabpanel").filter({ visible: true });
      const texto = (await panel.count()) ? normalizar(await panel.first().innerText()) : "";
      return { n: await seleccionadas.count(), texto };
    };
    await pestana(page, "Ruta", seccion);
    await page.setViewportSize({ width: 1024, height: 768 });
    await espera(600);
    let r = await pestanasVisibles();
    comprobar(r.n === 1 && r.texto.length > 0, `al pasar de 768 a 1024 px el panel inferior queda sin pestaña (${r.n}) o vacío`);
    await captura(page, `${motor}-cortes-1024`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await espera(400);
    await pestana(page, "Análisis", seccion);
    await page.setViewportSize({ width: 1100, height: 900 });
    await espera(600);
    r = await pestanasVisibles();
    comprobar(r.n === 1, "al pasar de 1440 a 1100 px con «Análisis» no queda ninguna pestaña marcada");

    await page.setViewportSize({ width: 768, height: 1024 });
    await espera(500);
    const asa = seccion.getByRole("button", { name: /panel/ });
    comprobar((await asa.getAttribute("aria-expanded")) !== null, "el asa del panel no tiene aria-expanded");
    for (let i = 0; i < 3 && (await asa.getAttribute("aria-label")) !== "Mostrar el panel"; i++) {
      await asa.click();
      await espera(300);
    }
    const inerte = await seccion.evaluate((s) => Boolean(s.querySelector("[inert]")));
    comprobar(inerte, "con el panel contraído su contenido sigue recibiendo foco (sin inert)");
    await seccion.getByRole("tab", { name: "Tabla", exact: true }).click();
    await espera(400);
    comprobar((await asa.getAttribute("aria-label")) !== "Mostrar el panel", "tocar una pestaña con el panel contraído no lo abre");
    revisarErrores(errores);
    await context.close();
  },

  async "tabla-fija"(browser, motor) {
    donde = `${motor} tabla-fija`;
    const { context, page, errores } = await abrir(browser, { width: 1280, height: 720 });
    await calcular(page);
    const panel = panelEjecucion(page);
    await pestana(page, "Tabla", panel);
    const r = await panel.evaluate((s) => {
      const thead = s.querySelector('[role="tabpanel"] thead');
      if (!thead) return { error: "sin tabla" };
      let cont = thead.parentElement;
      while (cont && !(cont.scrollHeight > cont.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(cont).overflowY))) {
        cont = cont.parentElement;
      }
      if (!cont) return { error: "la tabla no se desplaza" };
      cont.scrollTop = cont.scrollHeight;
      return new Promise((resolve) =>
        requestAnimationFrame(() =>
          resolve({ delta: thead.getBoundingClientRect().top - cont.getBoundingClientRect().top }),
        ),
      );
    });
    if (r.error) nota(r.error);
    else comprobar(Math.abs(r.delta) <= 2, `el encabezado de la tabla no queda fijo (se movió ${Math.round(r.delta)} px)`);
    await captura(page, `${motor}-tabla-fija`);
    revisarErrores(errores);
    await context.close();
  },

  async textos(browser, motor) {
    donde = `${motor} textos`;
    const { context, page, errores } = await abrir(browser);
    await page.getByRole("button", { name: "Exportar el grafo como JSON" }).click();
    await espera(500);
    comprobar((await page.getByRole("region", { name: "Notificaciones" }).count()) > 0, "la región de avisos no se llama «Notificaciones»");
    // Base UI oculta a propósito el botón de cerrar del árbol de accesibilidad
    // (el aviso se cierra solo o con el teclado), así que se lee el atributo.
    const cerrar = await page.locator('[data-slot="toast-close"]').first().getAttribute("aria-label").catch(() => null);
    comprobar(cerrar === "Cerrar aviso", `el botón de cerrar aviso dice «${cerrar}»`);

    await page.locator("main").getByRole("button", { name: "Conectar dos puntos" }).click();
    await nodo(page, "Bogotá").click();
    await nodo(page, "Cúcuta").click();
    await page.getByRole("dialog", { name: "Nuevo corredor" }).waitFor();
    comprobar((await page.getByRole("dialog", { name: "Nuevo corredor" }).getByRole("button", { name: "Cerrar", exact: true }).count()) > 0, "el diálogo no tiene un botón «Cerrar» en español");
    await page.keyboard.press("Escape");
    await espera(300);

    await pestana(page, "Datos");
    const transformacion = await zona(page).getByRole("button", { name: /Lista de adyacencia/i }).evaluate((b) => getComputedStyle(b).textTransform);
    comprobar(transformacion !== "capitalize", "«Lista De Adyacencia» sale con mayúsculas en cada palabra");

    const bogota = (await nodo(page, "Bogotá").getAttribute("aria-label")) ?? "";
    comprobar(!bogota.includes(".."), `el nombre accesible de Bogotá tiene doble punto: ${bogota}`);

    await escenario(page, "Lienzo en blanco");
    await page.locator("main").getByRole("button", { name: "Agregar punto" }).click();
    const caja = await page.locator(LIENZO).boundingBox();
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await espera(300);
    const etiqueta = (await page.locator(LIENZO).getAttribute("aria-label")) ?? "";
    comprobar(etiqueta.includes("1 punto y 0 corredores"), `lienzo con un punto: «${etiqueta}»`);
    revisarErrores(errores);
    await context.close();
  },

  async avisos(browser, motor) {
    donde = `${motor} avisos`;
    const { context, page, errores } = await abrir(browser);
    await escenario(page, "Aristas paralelas y empate");
    await calcular(page);
    const texto = normalizar(await zona(page).innerText());
    comprobar(texto.includes("más de un corredor entre P y Q"), "no se muestra el aviso de aristas paralelas");
    await pestana(page, "Datos");
    const resaltadas = await zona(page)
      .locator("li")
      .filter({ has: page.locator("p", { hasText: /^P$/ }) })
      .locator("li.text-graph-path")
      .filter({ hasText: "→ Q" })
      .count();
    comprobar(resaltadas === 1, `en la lista de adyacencia se resaltan ${resaltadas} arcos P→Q`);
    await captura(page, `${motor}-avisos`);
    revisarErrores(errores);
    await context.close();
  },

  async arrastre(browser, motor) {
    donde = `${motor} arrastre`;
    const { context, page, errores } = await abrir(browser);
    // Todo el arrastre dentro de una misma tarea, sin darle un frame al
    // navegador: es el caso de un gesto rápido. El nodo tiene que terminar
    // donde se soltó, no donde estaba.
    const r = await page.evaluate((sel) => {
      const svg = document.querySelector(sel);
      const g = [...svg.querySelectorAll('g[role="button"]')].find((n) =>
        n.querySelector("title")?.textContent?.startsWith("Bogotá"),
      );
      const circulo = g.querySelector("circle[class*='transition-']");
      const antes = { x: circulo.getAttribute("cx"), y: circulo.getAttribute("cy") };
      const caja = circulo.getBoundingClientRect();
      const x = caja.left + caja.width / 2;
      const y = caja.top + caja.height / 2;
      const evento = (tipo, dx) =>
        new PointerEvent(tipo, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: "mouse",
          button: 0,
          buttons: tipo === "pointerup" ? 0 : 1,
          clientX: x + dx,
          clientY: y + dx,
        });
      g.dispatchEvent(evento("pointerdown", 0));
      svg.dispatchEvent(evento("pointermove", 30));
      svg.dispatchEvent(evento("pointermove", 60));
      svg.dispatchEvent(evento("pointerup", 60));
      return antes;
    }, LIENZO);
    await espera(400);
    const despues = await nodo(page, "Bogotá").locator("circle[class*='transition-']").evaluate((c) => ({
      x: c.getAttribute("cx"),
      y: c.getAttribute("cy"),
    }));
    comprobar(despues.x !== r.x || despues.y !== r.y, "un arrastre rápido (en un solo frame) no movió el nodo");
    revisarErrores(errores);
    await context.close();
  },

  async encuadre(browser, motor) {
    donde = `${motor} encuadre`;
    const { context, page, errores } = await abrir(browser);
    await page.getByRole("button", { name: "Vaciar el grafo" }).click();
    await espera(300);
    await page.locator("main").getByRole("button", { name: "Agregar punto" }).click();
    const caja = await page.locator(LIENZO).boundingBox();
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await espera(500);
    const ancho = await page.locator(LIENZO).evaluate((s) => Number(s.getAttribute("viewBox").split(/\s+/)[2]));
    comprobar(ancho >= 400, `el primer punto tras Vaciar hace un zoom brusco (viewBox de ${Math.round(ancho)} unidades)`);
    await captura(page, `${motor}-encuadre`);
    revisarErrores(errores);
    await context.close();
  },

  async "sin-destino"(browser, motor) {
    donde = `${motor} sin-destino`;
    const { context, page, errores } = await abrir(browser);
    await escenario(page, "Lienzo en blanco");
    await page.locator("main").getByRole("button", { name: "Agregar punto" }).click();
    const caja = await page.locator(LIENZO).boundingBox();
    await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await espera(300);
    await pestana(page, "Ruta");
    comprobar(
      await zona(page).getByRole("button", { name: /Calcular ruta mínima/ }).isDisabled(),
      "se puede calcular sin destino",
    );
    revisarErrores(errores);
    await context.close();
  },

  async 404(browser, motor) {
    donde = `${motor} 404`;
    const { context, page, respuesta } = await abrir(browser, { ruta: "/no-existe" });
    comprobar(respuesta?.status() === 404, `/no-existe respondió ${respuesta?.status()}`);
    const texto = normalizar(await page.locator("body").innerText());
    comprobar(/no existe|no encontr/i.test(texto) && !/could not be found/i.test(texto), `la página 404 no está en español: ${texto.slice(0, 80)}`);
    await captura(page, `${motor}-404`);
    await context.close();
  },

  async tema(browser, motor) {
    donde = `${motor} tema`;
    const { context, page, errores } = await abrir(browser, {
      init: `localStorage.setItem("rutaoptima-tema", "dark")`,
    });
    await espera(1500);
    const r = await page.evaluate(() => ({
      oscuro: document.documentElement.classList.contains("dark"),
      esquema: getComputedStyle(document.documentElement).colorScheme,
    }));
    comprobar(r.oscuro, "un tema oscuro guardado se pierde al hidratar");
    comprobar(/dark/.test(r.esquema), `color-scheme es «${r.esquema}» en tema oscuro`);
    revisarErrores(errores);
    await context.close();
  },
};

/* ------------------------------------------------------------------ *
 * Ejecución
 * ------------------------------------------------------------------ */

if (!(await esperarServidor(URL_BASE))) {
  console.error(`No responde ${URL_BASE}. Arranca el servidor antes (p. ej. npx next start -p 3100).`);
  process.exit(2);
}

for (const motor of NAVEGADORES) {
  const tipo = MOTORES[motor];
  if (!tipo) {
    donde = motor;
    fallo(`motor desconocido «${motor}»`);
    continue;
  }
  let browser;
  try {
    browser = await tipo.launch();
  } catch (e) {
    donde = motor;
    fallo(`no se pudo abrir ${motor} (npx playwright install webkit firefox): ${e.message.split("\n")[0]}`);
    continue;
  }
  for (const [nombre, grupo] of Object.entries(GRUPOS)) {
    if (SOLO && !SOLO.has(nombre)) continue;
    const inicio = Date.now();
    try {
      await grupo(browser, motor);
    } catch (e) {
      fallo(`el grupo «${nombre}» se interrumpió: ${e.message.split("\n")[0].slice(0, 200)}`);
    }
    notas.push(`[${motor} ${nombre}] ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  }
  await browser.close();
}

writeFileSync(join(OUT, "resumen.json"), JSON.stringify({ url: URL_BASE, fallos: resumen }, null, 2));

console.log("\n===== NOTAS =====");
for (const n of notas) console.log(" ·", n);
console.log("\n===== FALLOS =====");
if (fallos.length === 0) console.log(" Ninguno.");
else for (const f of fallos) console.log(" ✗", f);
console.log(`\nCapturas en ${OUT}`);
process.exit(fallos.length ? 1 : 0);
