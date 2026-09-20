"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoundingBox } from "@/lib/graph/geometry";

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 4200;

/**
 * Pan y zoom del lienzo, mutando el `viewBox` del <svg>.
 *
 * Se mueve el viewBox en vez de aplicar un `transform` CSS porque así los
 * anchos de trazo y los tamaños de fuente quedan en unidades de mundo y
 * escalan solos, y porque las coordenadas para detectar clics coinciden
 * exactamente con las del modelo de datos.
 *
 * Este estado vive aquí, local al lienzo, y NO en el reductor global: pasar
 * el pan a 60 fps por un contexto re-renderizaría todos los paneles.
 */
export function useSvgViewport(initial: ViewBox) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  /**
   * Contenedor del <svg>. Hace falta porque `ResizeObserver` **no emite
   * eventos observando un elemento <svg>**: hay que observar un elemento HTML
   * normal. Comprobado en el navegador — observando el <svg> llegan cero
   * notificaciones aunque su altura cambie.
   */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(initial);
  /** Tamaño del lienzo en píxeles CSS. Sirve para dimensionar el texto SVG. */
  const [size, setSize] = useState({ width: 0, height: 0 });
  /** Última caja encuadrada, para poder repetir el encuadre al cambiar de tamaño. */
  const fitTargetRef = useRef<BoundingBox | null>(null);
  /** El usuario tomó el control del mapa (movió o hizo zoom). */
  const userAdjustedRef = useRef(false);
  const lastSize = useRef<{ width: number; height: number } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startBox: ViewBox;
  } | null>(null);

  /**
   * Pantalla → mundo.
   *
   * Se usa la matriz del propio SVG en vez de aritmética sobre
   * getBoundingClientRect: es exacta bajo `preserveAspectRatio` (que puede
   * dejar bandas a los lados) y bajo cualquier transform CSS del contenedor.
   * Si esto se calcula a mano, el nodo arrastrado se desfasa del cursor.
   */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: point.x, y: point.y };
  }, []);

  const zoomBy = useCallback((factor: number, originClient?: { x: number; y: number }) => {
    const svg = svgRef.current;
    userAdjustedRef.current = true;
    setViewBox((box) => {
      const nextWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, box.width * factor),
      );
      const ratio = nextWidth / box.width;
      const nextHeight = box.height * ratio;

      if (!svg || !originClient) {
        // Sin punto de anclaje se hace zoom al centro.
        return {
          x: box.x + (box.width - nextWidth) / 2,
          y: box.y + (box.height - nextHeight) / 2,
          width: nextWidth,
          height: nextHeight,
        };
      }

      const matrix = svg.getScreenCTM();
      if (!matrix) return box;
      const anchor = new DOMPoint(
        originClient.x,
        originClient.y,
      ).matrixTransform(matrix.inverse());

      // El punto bajo el cursor debe seguir bajo el cursor tras el zoom.
      return {
        x: anchor.x - (anchor.x - box.x) * ratio,
        y: anchor.y - (anchor.y - box.y) * ratio,
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, []);

  /**
   * React registra `wheel` de forma pasiva en la raíz, así que un
   * `preventDefault()` dentro de un handler JSX no impide el scroll de la
   * página. Hay que registrar el listener nativo como no pasivo.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0012);
      zoomBy(factor, { x: event.clientX, y: event.clientY });
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const beginPan = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      userAdjustedRef.current = true;
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBox: viewBox,
      };
    },
    [viewBox],
  );

  const movePan = useCallback((event: React.PointerEvent) => {
    const pan = panRef.current;
    const svg = svgRef.current;
    if (!pan || !svg || pan.pointerId !== event.pointerId) return;

    // Se parte siempre del viewBox inicial del gesto para que no se acumule
    // deriva por redondeos entre frames.
    const scale = pan.startBox.width / svg.clientWidth;
    setViewBox({
      ...pan.startBox,
      x: pan.startBox.x - (event.clientX - pan.startClientX) * scale,
      y: pan.startBox.y - (event.clientY - pan.startClientY) * scale,
    });
  }, []);

  const endPan = useCallback((event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    try {
      (event.currentTarget as Element).releasePointerCapture(event.pointerId);
    } catch {
      // El puntero ya se había liberado.
    }
    panRef.current = null;
  }, []);

  const isPanning = () => panRef.current !== null;

  /** Encuadra la caja indicada, respetando la proporción del lienzo. */
  const fitTo = useCallback((bounds: BoundingBox | null) => {
    const svg = svgRef.current;
    if (!bounds) return;
    fitTargetRef.current = bounds;
    // Un encuadre devuelve el control al automático: a partir de aquí el
    // lienzo puede volver a reencuadrarse solo si cambia de tamaño.
    userAdjustedRef.current = false;
    const width = Math.max(MIN_WIDTH, bounds.maxX - bounds.minX);
    const height = Math.max(MIN_WIDTH, bounds.maxY - bounds.minY);

    const aspect =
      svg && svg.clientHeight > 0 ? svg.clientWidth / svg.clientHeight : 1;
    let finalWidth = width;
    let finalHeight = height;
    if (width / height > aspect) finalHeight = width / aspect;
    else finalWidth = height * aspect;

    setViewBox({
      x: bounds.minX - (finalWidth - width) / 2,
      y: bounds.minY - (finalHeight - height) / 2,
      width: finalWidth,
      height: finalHeight,
    });
  }, []);

  /**
   * Reacción al cambio de tamaño del lienzo: contraer el panel inferior, girar
   * el teléfono o redimensionar la ventana.
   *
   * Si el usuario todavía no ha movido el mapa, se reencuadra para que el
   * espacio nuevo se llene de mapa y no de vacío. En cuanto lo ha movido, se
   * conserva su escala y el espacio nuevo simplemente revela más área: nadie
   * quiere que el mapa dé un salto de zoom mientras lo está usando.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;

      const previous = lastSize.current;
      lastSize.current = { width, height };
      setSize({ width, height });
      if (!previous || previous.width === 0 || previous.height === 0) return;
      if (previous.width === width && previous.height === height) return;

      if (!userAdjustedRef.current && fitTargetRef.current) {
        fitTo(fitTargetRef.current);
        return;
      }

      setViewBox((box) => {
        // Escala con la que se venía dibujando (preserveAspectRatio="meet").
        const scale = Math.min(
          previous.width / box.width,
          previous.height / box.height,
        );
        if (!Number.isFinite(scale) || scale <= 0) return box;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const nextWidth = width / scale;
        const nextHeight = height / scale;
        return {
          x: centerX - nextWidth / 2,
          y: centerY - nextHeight / 2,
          width: nextWidth,
          height: nextHeight,
        };
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [fitTo]);

  /**
   * Unidades de mundo por píxel CSS.
   *
   * Es el factor que permite dimensionar el texto del lienzo en píxeles de
   * pantalla: un tamaño fijo en unidades de mundo se vuelve ilegible en cuanto
   * el mapa se dibuja pequeño, que es justo lo que pasa en un teléfono.
   */
  const unitsPerPx = size.width > 0 ? viewBox.width / size.width : viewBox.width / 800;

  return {
    svgRef,
    containerRef,
    size,
    unitsPerPx,
    viewBox,
    setViewBox,
    toWorld,
    zoomBy,
    beginPan,
    movePan,
    endPan,
    isPanning,
    fitTo,
  };
}
