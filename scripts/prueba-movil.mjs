import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const URL = "http://localhost:3000";
const OUT = process.argv[2] ?? "./capturas";
mkdirSync(OUT, { recursive: true });

// Los tres tamaños que importan: el iPhone más vendido, el más pequeño que
// sigue siendo común, y un Android estrecho.
const APARATOS = [
  { nombre: "iphone-14", device: devices["iPhone 14"] },
  // El iPhone SE de 2ª/3ª generación, que es el que trae Chrome DevTools.
  {
    nombre: "iphone-se-375",
    device: { ...devices["iPhone 14"], viewport: { width: 375, height: 667 } },
  },
  // El SE original: el más estrecho que sigue siendo realista.
  { nombre: "iphone-se-320", device: devices["iPhone SE"] },
  { nombre: "galaxy-s9", device: devices["Galaxy S9+"] },
];

const fallos = [];
const notas = [];
const fallo = (aparato, msg) => fallos.push(`[${aparato}] ${msg}`);
const nota = (aparato, msg) => notas.push(`[${aparato}] ${msg}`);

const browser = await chromium.launch();

/** Arrastre táctil real, vía protocolo del navegador (no eventos sintéticos). */
async function arrastreTactil(cdp, x1, y1, x2, y2) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x1, y: y1 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8 },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

for (const { nombre, device } of APARATOS) {
  const context = await browser.newContext({ ...device, locale: "es-CO" });
  const page = await context.newPage();

  const erroresConsola = [];
  page.on("console", (m) => {
    if (m.type() === "error") erroresConsola.push(m.text());
  });
  page.on("pageerror", (e) => erroresConsola.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const vp = page.viewportSize();
  nota(nombre, `viewport ${vp.width}x${vp.height}, dpr ${device.deviceScaleFactor}`);

  /* ---- 1. Desbordamiento horizontal ---- */
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  if (overflow.scroll > overflow.client + 1) {
    fallo(
      nombre,
      `la página se desborda a lo ancho: scrollWidth ${overflow.scroll} > ${overflow.client}`,
    );
  }

  /* ---- 2. Nada recortado en la barra superior ---- */
  const barra = await page.evaluate(() => {
    const h = document.querySelector("header");
    const r = h.getBoundingClientRect();
    const hijos = [...h.querySelectorAll("button, [role='combobox'], h1")].map((c) => {
      const b = c.getBoundingClientRect();
      return {
        etiqueta: (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 30),
        left: Math.round(b.left),
        right: Math.round(b.right),
        w: Math.round(b.width),
        h: Math.round(b.height),
        visible: b.width > 0 && b.height > 0,
      };
    });
    return { headerW: Math.round(r.width), hijos };
  });
  for (const c of barra.hijos) {
    if (!c.visible) continue;
    if (c.right > barra.headerW + 1 || c.left < -1) {
      fallo(nombre, `"${c.etiqueta}" se sale de la barra (${c.left}–${c.right} de ${barra.headerW})`);
    }
  }

  /* ---- 3. Tamaño de los objetivos táctiles ---- */
  const pequenos = barra.hijos.filter((c) => c.visible && c.etiqueta && (c.w < 28 || c.h < 28));
  if (pequenos.length) {
    nota(
      nombre,
      `controles por debajo de 28px: ${pequenos.map((c) => `${c.etiqueta} ${c.w}x${c.h}`).join(", ")}`,
    );
  }

  /* ---- 3b. Los controles del panel caben en la pantalla ---- */
  const controles = await page.evaluate(() => {
    const seccion = document.querySelector("section.no-imprimir");
    const fuera = [];
    for (const el of seccion.querySelectorAll("button[aria-label], [role='tab']")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      const nombre = (el.getAttribute("aria-label") || el.textContent || "").trim();
      // Las pestañas viven en un carril con scroll horizontal: es legítimo que
      // se salgan. Los botones de altura no: tienen que estar siempre a mano.
      const enCarril = el.closest(".overflow-x-auto") !== null;
      if (!enCarril && (b.right > window.innerWidth + 1 || b.left < -1)) {
        fuera.push(`${nombre} (${Math.round(b.left)}–${Math.round(b.right)})`);
      }
    }
    const asas = [...seccion.querySelectorAll("button[aria-label]")].filter((b) =>
      /panel|mapa completo/.test(b.getAttribute("aria-label") || ""),
    ).length;
    // Con el asa fuera del carril, las seis pestañas tienen que caber enteras.
    const pestanasCortadas = [...seccion.querySelectorAll("[role='tab']")]
      .filter((t) => {
        const b = t.getBoundingClientRect();
        return b.width > 0 && b.right > window.innerWidth + 1;
      })
      .map((t) => t.textContent.trim());
    return { fuera, asas, pestanasCortadas };
  });
  if (controles.fuera.length) {
    fallo(nombre, `controles del panel fuera de la pantalla: ${controles.fuera.join(", ")}`);
  }
  if (controles.asas !== 1) {
    fallo(nombre, `se esperaba 1 asa de altura del panel, hay ${controles.asas}`);
  }
  // Desde 360 px (todo teléfono en uso hoy) las seis pestañas deben caber.
  // Por debajo se admite el carril con desplazamiento: 320 px es el iPhone SE
  // de 2016 y ahí no caben sin mutilar las etiquetas.
  if (controles.pestanasCortadas.length) {
    if (vp.width >= 360) {
      fallo(nombre, `pestañas cortadas por el borde: ${controles.pestanasCortadas.join(", ")}`);
    } else {
      nota(nombre, `pestañas que exigen desplazar el carril: ${controles.pestanasCortadas.join(", ")}`);
    }
  }

  /* ---- 3c. Nada dentro de la sección se desborda en silencio ---- */
  const recortes = await page.evaluate(() => {
    const seccion = document.querySelector("section.no-imprimir");
    const limite = seccion.getBoundingClientRect().right;
    const malos = [];
    for (const el of seccion.querySelectorAll("p, h3, span")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      if (el.closest(".overflow-x-auto") || el.closest("table")) continue;
      if (b.right > limite + 1) {
        malos.push(`"${(el.textContent || "").trim().slice(0, 30)}" llega a ${Math.round(b.right)} de ${Math.round(limite)}`);
      }
    }
    return malos;
  });
  if (recortes.length) {
    fallo(nombre, `texto recortado por el borde: ${recortes.slice(0, 2).join("; ")}`);
  }

  /* ---- 4. El mapa se dibuja y ocupa algo razonable ---- */
  const mapa = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const nodos = svg.querySelectorAll('g[role="button"]').length;
    // Caja real que ocupan los nodos dibujados, en píxeles de pantalla.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of svg.querySelectorAll('g[role="button"]')) {
      const b = g.getBoundingClientRect();
      minX = Math.min(minX, b.left); maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top); maxY = Math.max(maxY, b.bottom);
    }
    return {
      w: Math.round(r.width), h: Math.round(r.height), nodos,
      grafoW: Math.round(maxX - minX), grafoH: Math.round(maxY - minY),
      viewBox: svg.getAttribute("viewBox"),
    };
  });
  if (!mapa || mapa.nodos === 0) fallo(nombre, "el mapa no dibujó ningún nodo");
  else {
    const usoW = mapa.grafoW / mapa.w;
    const usoH = mapa.grafoH / mapa.h;
    nota(
      nombre,
      `lienzo ${mapa.w}x${mapa.h}, grafo ${mapa.grafoW}x${mapa.grafoH} (usa ${Math.round(usoW * 100)}% ancho, ${Math.round(usoH * 100)}% alto)`,
    );
    if (Math.max(usoW, usoH) < 0.6) {
      fallo(nombre, `el grafo desaprovecha el lienzo: ${Math.round(usoW * 100)}%x${Math.round(usoH * 100)}%`);
    }
  }

  // Las áreas táctiles no pueden pisarse: si se pisan, el nodo dibujado más
  // tarde intercepta el toque dirigido a su vecino y se arrastra el equivocado.
  const solapes = await page.evaluate(() => {
    const areas = [...document.querySelectorAll('svg[role="application"] circle[fill="transparent"]')]
      .map((c) => {
        const b = c.getBoundingClientRect();
        return {
          nombre: c.parentElement.querySelector("title")?.textContent?.split(".")[0] ?? "?",
          cx: b.left + b.width / 2,
          cy: b.top + b.height / 2,
          r: b.width / 2,
        };
      });
    const malos = [];
    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        const d = Math.hypot(areas[i].cx - areas[j].cx, areas[i].cy - areas[j].cy);
        if (d < areas[i].r + areas[j].r - 0.5) {
          malos.push(`${areas[i].nombre} y ${areas[j].nombre}`);
        }
      }
    }
    return malos;
  });
  if (solapes.length) {
    fallo(nombre, `áreas táctiles solapadas: ${solapes.slice(0, 3).join("; ")}`);
  }

  await page.screenshot({ path: join(OUT, `${nombre}-1-inicio.png`) });

  /* ---- 5. Legibilidad de los rótulos del mapa ---- */
  const rotulo = await page.evaluate(() => {
    const t = document.querySelector('svg[role="application"] g[role="button"] text:last-of-type');
    if (!t) return null;
    const b = t.getBoundingClientRect();
    return { alto: Math.round(b.height), texto: t.textContent };
  });
  if (rotulo) {
    nota(nombre, `rótulo "${rotulo.texto}" mide ${rotulo.alto}px de alto`);
    if (rotulo.alto < 9) fallo(nombre, `los rótulos del mapa son ilegibles (${rotulo.alto}px)`);
  }

  /* ---- 6. Calcular la ruta, tocando de verdad ---- */
  const panel = page.locator("section.no-imprimir");
  await panel.getByRole("tab", { name: "Ruta" }).tap();
  await page.waitForTimeout(400);
  const boton = panel.getByRole("button", { name: /Calcular ruta/ });
  await boton.scrollIntoViewIfNeeded();
  await boton.tap();
  await page.waitForTimeout(900);

  const resultado = await panel.getByText("Ruta de menor costo").count();
  if (resultado === 0) fallo(nombre, "tras tocar Calcular no apareció el resultado");
  const total = await panel.getByText("$ 5.430.000").count();
  if (total === 0) fallo(nombre, "el total esperado ($ 5.430.000) no aparece");

  // La ruta tiene que estar resaltada en el mapa sin tocar nada más.
  const enRuta = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]');
    const aristas = [...svg.querySelectorAll("path")].filter((p) =>
      (p.getAttribute("class") || "").includes("stroke-graph-path"),
    ).length;
    const rotulos = [...svg.querySelectorAll('g[role="button"] text')].map((t) =>
      t.textContent,
    );
    return { aristas, rotulos };
  });
  if (enRuta.aristas === 0) {
    fallo(nombre, "tras calcular, la ruta no aparece resaltada en el mapa");
  }
  for (const ciudad of ["Bogotá D.C.", "Bucaramanga", "Barranquilla", "Cartagena"]) {
    if (!enRuta.rotulos.includes(ciudad)) {
      fallo(nombre, `la ciudad de la ruta "${ciudad}" no queda rotulada en el mapa`);
    }
  }
  nota(nombre, `rótulos visibles en el mapa: ${enRuta.rotulos.filter((r) => /[A-Za-zÁÉÍÓÚáéíóú]/.test(r)).join(", ")}`);

  await page.screenshot({ path: join(OUT, `${nombre}-2-resultado.png`) });

  /* ---- 7. Animación paso a paso ---- */
  await panel.getByRole("tab", { name: "Paso a paso" }).tap();
  await page.waitForTimeout(300);
  await panel.getByRole("button", { name: "Reproducir" }).tap();
  await page.waitForTimeout(2600);
  const pasoTexto = await panel.getByText(/Paso \d+ de \d+/).first().textContent();
  const nPaso = Number(/Paso (\d+)/.exec(pasoTexto ?? "")?.[1] ?? 0);
  nota(nombre, `tras 2,6 s de reproducción: ${pasoTexto?.trim()}`);
  if (nPaso < 3) fallo(nombre, `la animación no avanzó (se quedó en el paso ${nPaso})`);
  await panel.getByRole("button", { name: "Pausar" }).tap();

  /* ---- 8. Contraer el panel: el mapa debe reencuadrarse ---- */
  const antes = await page.evaluate(() =>
    document.querySelector('svg[role="application"]').getAttribute("viewBox"));
  await panel.getByRole("button", { name: /panel|mapa completo/ }).tap();
  await page.waitForTimeout(700);
  const despues = await page.evaluate(() =>
    document.querySelector('svg[role="application"]').getAttribute("viewBox"));
  if (antes === despues) fallo(nombre, "al contraer el panel el mapa no se reencuadró");
  // Ningún número puede derramarse fuera de su nodo.
  const derrames = await page.evaluate(() => {
    const salidos = [];
    for (const g of document.querySelectorAll('svg[role="application"] g[role="button"]')) {
      const circulo = g.querySelector("circle:not([fill='transparent'])");
      const textos = [...g.querySelectorAll("text")];
      if (!circulo || textos.length === 0) continue;
      const c = circulo.getBoundingClientRect();
      for (const t of textos) {
        const b = t.getBoundingClientRect();
        // Solo interesa el texto centrado en el nodo (la distancia). El
        // rótulo del nombre va debajo a propósito y se descarta por posición.
        const centradoEnElNodo =
          Math.abs((b.top + b.bottom) / 2 - (c.top + c.bottom) / 2) <
          c.height * 0.35;
        if (centradoEnElNodo && b.width > c.width + 2) {
          salidos.push(`${t.textContent} (${Math.round(b.width)}px) en un nodo de ${Math.round(c.width)}px`);
        }
      }
    }
    return salidos;
  });
  if (derrames.length) {
    fallo(nombre, `números derramados fuera del nodo: ${derrames.slice(0, 3).join("; ")}`);
  }

  await page.screenshot({ path: join(OUT, `${nombre}-3-contraido.png`) });

  /* ---- 9. Arrastrar un nodo con el dedo ---- */
  const nodoBogota = page.locator('svg[role="application"] g[role="button"]').filter({
    has: page.locator('title:text-matches("Bogotá")'),
  }).first();
  const caja = await nodoBogota.boundingBox();
  if (!caja) fallo(nombre, "no se encontró el nodo de Bogotá para arrastrarlo");
  else {
    const antesXY = await page.evaluate(() => {
      const g = [...document.querySelectorAll('svg[role="application"] g[role="button"]')]
        .find((n) => n.querySelector("title")?.textContent?.includes("Bogotá"));
      const c = g.querySelector("circle:not([stroke-dasharray])");
      return { cx: c.getAttribute("cx"), cy: c.getAttribute("cy") };
    });

    const cx = caja.x + caja.width / 2;
    const cy = caja.y + caja.height / 2;
    const obstruido = await page.evaluate(
      ([x, y]) => {
        const encima = document.elementFromPoint(x, y);
        return !encima || encima.closest("button, [data-slot='button-group']") !== null;
      },
      [cx, cy],
    );
    let seArrastro = false;
    if (obstruido) {
      nota(nombre, "el nodo de prueba queda bajo un control flotante; se omite el arrastre");
    } else {
      const cdp = await context.newCDPSession(page);
      const r = await page.evaluate(() => {
        const b = document
          .querySelector('svg[role="application"]')
          .getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      });
      // Destino fijo de 50 px hacia el lado con más espacio, recortado para
      // no salirse del lienzo. Así el recorrido es siempre medible, incluso
      // en una pantalla de 251 px de alto donde el nodo ya está centrado.
      const margen = 26;
      const haciaIzquierda = cx - r.left > r.right - cx;
      const haciaArriba = cy - r.top > r.bottom - cy;
      const destinoX = Math.min(
        Math.max(cx + (haciaIzquierda ? -50 : 50), r.left + margen),
        r.right - margen,
      );
      const destinoY = Math.min(
        Math.max(cy + (haciaArriba ? -50 : 50), r.top + margen),
        r.bottom - margen,
      );
      if (Math.hypot(destinoX - cx, destinoY - cy) < 15) {
        nota(nombre, "el lienzo es demasiado pequeño para un arrastre medible; se omite");
      } else {
        await arrastreTactil(cdp, cx, cy, destinoX, destinoY);
        seArrastro = true;
      }
    }
    await page.waitForTimeout(500);

    const despuesXY = await page.evaluate(() => {
      const g = [...document.querySelectorAll('svg[role="application"] g[role="button"]')]
        .find((n) => n.querySelector("title")?.textContent?.includes("Bogotá"));
      const c = g.querySelector("circle:not([stroke-dasharray])");
      return { cx: c.getAttribute("cx"), cy: c.getAttribute("cy") };
    });

    // Solo se juzga el arrastre si de verdad se llegó a intentar.
    if (!seArrastro) {
      // Ya quedó anotado por qué se omitió.
    } else if (antesXY.cx === despuesXY.cx && antesXY.cy === despuesXY.cy) {
      fallo(
        nombre,
        `arrastrar un nodo con el dedo no lo movió (de ${Math.round(cx)},${Math.round(cy)} en pantalla)`,
      );
    } else {
      nota(nombre, `arrastre táctil: el nodo pasó de (${antesXY.cx}, ${antesXY.cy}) a (${despuesXY.cx}, ${despuesXY.cy})`);
    }
  }

  /* ---- 10. Editar y Datos caben y hacen scroll ---- */
  await panel.getByRole("button", { name: /panel|mapa completo/ }).tap();
  await page.waitForTimeout(300);
  for (const t of ["Editar", "Datos", "Tabla"]) {
    await panel.getByRole("tab", { name: t }).tap();
    await page.waitForTimeout(400);
    const ov = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    if (ov.scroll > ov.client + 1) {
      fallo(nombre, `la pestaña ${t} desborda la página a lo ancho (${ov.scroll} > ${ov.client})`);
    }
    await page.screenshot({ path: join(OUT, `${nombre}-4-${t.toLowerCase()}.png`) });
  }

  if (erroresConsola.length) {
    fallo(nombre, `errores en consola: ${erroresConsola.slice(0, 3).join(" | ")}`);
  }

  await context.close();
}

await browser.close();

console.log("\n===== NOTAS =====");
for (const n of notas) console.log(" ·", n);
console.log("\n===== FALLOS =====");
if (fallos.length === 0) console.log(" Ninguno.");
else for (const f of fallos) console.log(" ✗", f);
console.log(`\nCapturas en ${OUT}`);
process.exit(fallos.length ? 1 : 0);
