import { METRIC_LABELS, type EdgeWeights, type Metric } from "./types";

/**
 * Formateo en es-CO.
 *
 * El locale se fija explícitamente en vez de usar el del entorno: si el
 * servidor y el navegador resolvieran locales distintos, los números
 * renderizados no coincidirían y React reportaría un error de hidratación.
 */

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  notation: "compact",
  maximumFractionDigits: 1,
});

const decimalFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return currencyFormatter.format(value);
}

export function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return compactCurrencyFormatter.format(value);
}

export function formatDistance(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return `${decimalFormatter.format(value)} km`;
}

/** Horas decimales a "9 h 30 min". */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return "∞";
  if (hours === 0) return "0 min";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  return integerFormatter.format(value);
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

/** Versión corta, para las etiquetas de arista dentro del lienzo. */
export function formatMetricShort(value: number, metric: Metric): string {
  if (!Number.isFinite(value)) return "∞";
  switch (metric) {
    case "cost":
      return compactCurrencyFormatter.format(value).replace(/\s/g, "");
    case "distance":
      return `${decimalFormatter.format(value)}`;
    case "time":
      return `${decimalFormatter.format(value)} h`;
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
