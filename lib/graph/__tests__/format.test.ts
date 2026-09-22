import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCount,
  formatCurrency,
  formatDecimal,
  formatDistance,
  formatDuration,
  formatMetricShort,
  formatPercent,
  parseColombianNumber,
  percentDelta,
} from "../format";

const NBSP = " ";

describe("Formato es-CO", () => {
  it("moneda con punto de miles y espacio duro", () => {
    assert.equal(formatCurrency(5_430_000), `$${NBSP}5.430.000`);
    assert.equal(formatCurrency(1500), `$${NBSP}1.500`);
    assert.equal(formatCurrency(9), `$${NBSP}9`);
    assert.equal(formatCurrency(-505_000), `-$${NBSP}505.000`);
    assert.equal(formatCurrency(Infinity), "∞");
  });

  it("nunca muestra un cero con signo", () => {
    assert.equal(formatCurrency(-0), `$${NBSP}0`);
    assert.equal(formatCurrency(-0.4), `$${NBSP}0`);
    assert.equal(formatDistance(-0), "0 km");
    assert.equal(formatDuration(-0), "0 min");
  });

  it("distancias agrupan siempre los miles, sin depender del motor", () => {
    assert.equal(formatDistance(990), "990 km");
    assert.equal(formatDistance(1090), "1.090 km");
    assert.equal(formatDistance(12.75), "12,8 km");
  });

  it("duraciones", () => {
    assert.equal(formatDuration(21.2), "21 h 12 min");
    assert.equal(formatDuration(21.7), "21 h 42 min");
    assert.equal(formatDuration(0.999), "1 h");
    assert.equal(formatDuration(59.99 / 60), "1 h");
    assert.equal(formatDuration(0.004), "0 min");
    assert.equal(formatDuration(2), "2 h");
    assert.equal(formatDuration(NaN), "∞");
  });

  it("duraciones negativas llevan el signo una sola vez", () => {
    assert.equal(formatDuration(-0.5), "-30 min");
    assert.equal(formatDuration(-1.5), "-1 h 30 min");
    assert.equal(formatDuration(-2), "-2 h");
  });

  it("porcentajes y decimales con coma", () => {
    assert.equal(formatPercent(10.101), `10,1${NBSP}%`);
    assert.equal(formatPercent(1.289), `1,3${NBSP}%`);
    assert.equal(formatDecimal(0.5), "0,5");
    assert.equal(formatDecimal(4), "4");
    assert.equal(formatDecimal(1234.56, 1), "1.234,6");
  });

  it("los porcentajes de la demostración", () => {
    assert.ok(Math.abs(percentDelta(1090, 990)! - 10.101) < 1e-3);
    assert.equal(formatPercent(percentDelta(1090, 990)!), `10,1${NBSP}%`);
    assert.equal(formatPercent(percentDelta(5_500_000, 5_430_000)!), `1,3${NBSP}%`);
    assert.equal(percentDelta(5, 0), null);
    assert.equal(percentDelta(Infinity, 3), null);
  });

  it("singular y plural", () => {
    assert.equal(formatCount(1, "punto", "puntos"), "1 punto");
    assert.equal(formatCount(0, "tramo", "tramos"), "0 tramos");
    assert.equal(formatCount(4, "punto", "puntos"), "4 puntos");
  });

  it("formato corto del lienzo, fijo e idéntico en servidor y navegador", () => {
    assert.equal(formatMetricShort(505_000, "cost"), "$505k");
    assert.equal(formatMetricShort(2_360_000, "cost"), "$2,4M");
    assert.equal(formatMetricShort(999_999, "cost"), "$1M");
    assert.equal(formatMetricShort(1500, "cost"), "$1,5k");
    assert.equal(formatMetricShort(950, "cost"), "$950");
    assert.equal(formatMetricShort(0, "cost"), "$0");
    assert.equal(formatMetricShort(-505_000, "cost"), "-$505k");
    assert.equal(formatMetricShort(21.2, "time"), "21,2 h");
    assert.equal(formatMetricShort(1090, "distance"), "1.090");
  });
});

describe("Lectura de números escritos en Colombia", () => {
  const casos: [string, number | null][] = [
    ["2.360.000", 2_360_000],
    ["$ 2.360.000", 2_360_000],
    ["$ 1.500.000", 1_500_000],
    ["2,5", 2.5],
    ["1.234,5", 1234.5],
    ["12.7", 12.7],
    ["1.000", 1000],
    ["0.360", 0.36],
    ["-3", -3],
    ["-0,5", -0.5],
    ["505000", 505_000],
    ["0", 0],
    ["-0", 0],
    ["", null],
    ["  ", null],
    ["-", null],
    ["abc", null],
    ["1.2.3", null],
    ["2.36.000", null],
    ["1,2,3", null],
    ["1e3", null],
    ["Infinity", null],
  ];
  for (const [texto, esperado] of casos) {
    it(`«${texto}» → ${esperado}`, () => {
      assert.equal(parseColombianNumber(texto), esperado);
    });
  }
});
