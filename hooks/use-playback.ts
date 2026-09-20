"use client";

import { useEffect } from "react";

/**
 * Avanza un paso cada cierto tiempo mientras la reproducción esté activa.
 *
 * Usa `setTimeout` reprogramado y no `setInterval`: si un render se demora,
 * `setInterval` acumularía ticks pendientes y la animación daría un salto al
 * recuperarse. Reprogramar tras cada paso mantiene el ritmo estable.
 */
export function usePlayback({
  isPlaying,
  speed,
  step,
  canAdvance,
  onTick,
}: {
  isPlaying: boolean;
  speed: number;
  /** Paso actual. Va en las dependencias para que el efecto se reprograme
   *  tras cada avance; sin él solo se dispararía un temporizador y la
   *  reproducción se detendría en el segundo paso. */
  step: number;
  canAdvance: boolean;
  onTick: () => void;
}): void {
  useEffect(() => {
    if (!isPlaying || !canAdvance) return;
    const delay = Math.max(90, 850 / speed);
    const timer = setTimeout(onTick, delay);
    return () => clearTimeout(timer);
  }, [isPlaying, speed, step, canAdvance, onTick]);
}

/** `true` si el usuario pidió reducir el movimiento en su sistema. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
