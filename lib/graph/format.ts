import { METRIC_LABELS, type EdgeWeights, type Metric } from "./types";

/**
 * Formateo en es-CO: punto para los miles, coma para los decimales.
 *
 * No se usa `Intl.NumberFormat` a propósito. Cada motor trae su propia versión
 * de los datos de localización (CLDR): uno escribe "1.090" y otro "1090"
 * (la regla de agrupar solo desde cinco cifras), uno "$505 k" y otro
 * "$505 mil". Como el lienzo se renderiza también en el servidor, cualquier
 * diferencia entre Node y el navegador es un error de hidratación. Formateando
 * a mano, el texto es idéntico en todas partes.
 */

const ESPACIO_DURO = " ";

/** "1234567" → "1.234.567". Siempre agrupa, también con cuatro cifras. */
function agrupar(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Número con a lo sumo `decimales` cifras decimales, sin ceros sobrantes.
 * Normaliza −0 a 0: un "-0 km" no significa nada.
 */
export function formatDecimal(value: number, decimales = 1): string {
  if (!Number.isFinite(value)) return "∞";
  const factor = 10 ** decimales;
  const redondeado = Math.round(Math.abs(value) * factor) / factor;
  const signo = value < 0 && redondeado !== 0 ? "-" : "";
  const [entero, fraccion] = redondeado.toFixed(decimales).split(".");
  const fraccionLimpia = (fraccion ?? "").replace(/0+$/, "");
  return `${signo}${agrupar(entero)}${fraccionLimpia ? `,${fraccionLimpia}` : ""}`;
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  const numero = formatDecimal(value, 0);
  return numero.startsWith("-")
    ? `-$${ESPACIO_DURO}${numero.slice(1)}`
    : `$${ESPACIO_DURO}${numero}`;
}

export function formatDistance(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return `${formatDecimal(value, 1)} km`;
}

/** Horas decimales a "9 h 30 min". Los negativos llevan el signo una sola vez. */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return "∞";
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  if (totalMinutes === 0) return "0 min";
  const signo = hours < 0 ? "-" : "";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${signo}${m} min`;
  if (m === 0) return `${signo}${agrupar(String(h))} h`;
  return `${signo}${agrupar(String(h))} h ${m} min`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return formatDecimal(value, 0);
}

/** Porcentaje con coma decimal: 10.101 → "10,1 %". */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return `${formatDecimal(value, 1)}${ESPACIO_DURO}%`;
}

/** "1 punto", "4 puntos". */
export function formatCount(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`;
}

/** Formatea un valor según la métrica a la que pertenece. */
export function formatMetric(value: number, metric: Metric): string {
  if (!Number.isFinite(value)) return "∞";
  switch (metric) {
    case "cost":
      return formatCurrency(value);
    case "distance":
      return formatDistance(value);
    case "time":
      return formatDuration(value);
  }
}

/** Costo abreviado: "$505k", "$2,4M". */
function formatCompactCurrency(value: number): string {
  const signo = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 999_950) return `${signo}$${formatDecimal(abs / 1_000_000, 1)}M`;
  if (abs >= 1000) return `${signo}$${formatDecimal(abs / 1000, 1)}k`;
  const entero = formatDecimal(abs, 0);
  return entero === "0" ? "$0" : `${signo}$${entero}`;
}

/** Versión corta, para las etiquetas de arista dentro del lienzo. */
export function formatMetricShort(value: number, metric: Metric): string {
  if (!Number.isFinite(value)) return "∞";
  switch (metric) {
    case "cost":
      return formatCompactCurrency(value);
    case "distance":
      return formatDecimal(value, 1);
    case "time":
      return `${formatDecimal(value, 1)} h`;
  }
}

export function metricLabel(metric: Metric): string {
  return METRIC_LABELS[metric];
}

/** "cuesta $X, recorre Y km y toma Z h" */
export function describeTotals(totals: EdgeWeights): string {
  return `${formatCurrency(totals.cost)} · ${formatDistance(totals.distance)} · ${formatDuration(totals.time)}`;
}

/** Diferencia porcentual de `value` respecto a `reference`. */
export function percentDelta(value: number, reference: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0)
    return null;
  return ((value - reference) / reference) * 100;
}

/**
 * Lee un número escrito como se escribe en Colombia.
 *
 *   "2.360.000"   → 2360000   (punto de miles)
 *   "1.234,5"     → 1234,5    (coma decimal)
 *   "2,5"         → 2,5
 *   "12.7"        → 12,7      (un punto que no agrupa miles es decimal)
 *   "$ 1.500.000" → 1500000   (se admite el signo de pesos)
 *
 * Un punto seguido de exactamente tres cifras, tras una parte entera de una a
 * tres cifras que no empieza en cero, se lee como separador de miles: así lo
 * escribe cualquier persona en Colombia. Devuelve `null` si el texto está
 * vacío o no es un número (nunca 0: un campo vacío no es un peso de cero).
 */
export function parseColombianNumber(texto: string): number | null {
  const limpio = texto.replace(/[\s  $]/g, "");
  if (limpio === "" || limpio === "-") return null;

  const signo = limpio.startsWith("-") ? -1 : 1;
  const cuerpo = limpio.replace(/^[-+]/, "");

  let numero: number | null = null;
  if (/^\d+$/.test(cuerpo)) {
    numero = Number(cuerpo);
  } else if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(cuerpo)) {
    numero = Number(cuerpo.replace(/\./g, "").replace(",", "."));
  } else if (/^\d+,\d+$/.test(cuerpo)) {
    numero = Number(cuerpo.replace(",", "."));
  } else if (/^\d+\.\d+$/.test(cuerpo)) {
    numero = Number(cuerpo);
  }

  if (numero === null || !Number.isFinite(numero)) return null;
  const resultado = signo * numero;
  return resultado === 0 ? 0 : resultado;
}
