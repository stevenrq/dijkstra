"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatDecimal, parseColombianNumber } from "@/lib/graph/format";
import type { GraphNode } from "@/lib/graph/types";
import { usePlannerDispatch } from "./planner-context";

/** Escala del lienzo: ~0,9 km por unidad de mundo en el escenario de Colombia. */
const KM_POR_UNIDAD = 0.9;
const VELOCIDAD_MEDIA = 55; // km/h de un camión de carga
const COP_POR_KM = 5500;

export function EdgeDialog({
  pending,
  nodeById,
  onClose,
  onAnnounce,
}: {
  pending: { from: string; to: string } | null;
  nodeById: Map<string, GraphNode>;
  onClose: () => void;
  onAnnounce: (message: string) => void;
}) {
  const from = pending ? nodeById.get(pending.from) : null;
  const to = pending ? nodeById.get(pending.to) : null;

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {from && to && (
          // La `key` remonta el formulario para cada pareja nueva, de modo que
          // los valores prellenados se calculan en el estado inicial y no hace
          // falta un efecto que los reajuste después de pintar.
          <EdgeForm
            key={`${from.id}-${to.id}`}
            from={from}
            to={to}
            onClose={onClose}
            onAnnounce={onAnnounce}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Los tres pesos se prellenan a partir de la distancia en el lienzo: así el
 * corredor recién dibujado es usable de inmediato y solo hay que ajustarlo,
 * en vez de empezar desde tres campos en blanco.
 */
function valoresIniciales(from: GraphNode, to: GraphNode) {
  const km = Math.max(
    5,
    Math.round(Math.hypot(to.x - from.x, to.y - from.y) * KM_POR_UNIDAD),
  );
  // Prellenados como se escriben en Colombia, igual que se leen al enviar.
  return {
    distance: formatDecimal(km, 0),
    time: formatDecimal(Math.round((km / VELOCIDAD_MEDIA) * 10) / 10, 1),
    cost: formatDecimal(km * COP_POR_KM, 0),
  };
}

function EdgeForm({
  from,
  to,
  onClose,
  onAnnounce,
}: {
  from: GraphNode;
  to: GraphNode;
  onClose: () => void;
  onAnnounce: (message: string) => void;
}) {
  const dispatch = usePlannerDispatch();
  const iniciales = () => valoresIniciales(from, to);
  const [cost, setCost] = useState(() => iniciales().cost);
  const [distance, setDistance] = useState(() => iniciales().distance);
  const [time, setTime] = useState(() => iniciales().time);
  const [label, setLabel] = useState("");
  const [directed, setDirected] = useState(false);

  // Un campo vacío no es un peso de cero: `Number("")` daba 0 y se aceptaba.
  const values = {
    cost: parseColombianNumber(cost),
    distance: parseColombianNumber(distance),
    time: parseColombianNumber(time),
  };
  const malo = (value: number | null) => value === null || value < 0;
  const invalid = Object.values(values).some(malo);

  const submit = () => {
    if (values.cost === null || values.distance === null || values.time === null) return;
    if (invalid) return;
    dispatch({
      type: "ADD_EDGE",
      from: from.id,
      to: to.id,
      weights: { cost: values.cost, distance: values.distance, time: values.time },
      directed,
      label,
    });
    onAnnounce(`Corredor creado entre ${from.label} y ${to.label}.`);
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nuevo corredor</DialogTitle>
        <DialogDescription>
          {from.label} {directed ? "→" : "↔"} {to.label}
        </DialogDescription>
      </DialogHeader>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field>
          <FieldLabel htmlFor="corredor-nombre">Nombre del corredor</FieldLabel>
          <Input
            id="corredor-nombre"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Opcional, p. ej. Troncal de Occidente"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="corredor-costo">Costo (COP)</FieldLabel>
            <Input
              id="corredor-costo"
              inputMode="decimal"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              aria-invalid={malo(values.cost)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="corredor-km">Distancia (km)</FieldLabel>
            <Input
              id="corredor-km"
              inputMode="decimal"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
              aria-invalid={malo(values.distance)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="corredor-horas">Tiempo (h)</FieldLabel>
            <Input
              id="corredor-horas"
              inputMode="decimal"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              aria-invalid={malo(values.time)}
            />
          </Field>
        </div>

        <Field orientation="horizontal">
          <Switch
            id="corredor-dirigido"
            checked={directed}
            onCheckedChange={(checked) => setDirected(checked)}
          />
          <div className="grid gap-0.5">
            <FieldLabel htmlFor="corredor-dirigido">Sentido único</FieldLabel>
            <FieldDescription>
              Por defecto el corredor se recorre en ambos sentidos. Actívalo
              para modelar una vía de un solo sentido.
            </FieldDescription>
          </div>
        </Field>

        {invalid && (
          <p className="text-destructive text-sm">
            Los tres pesos deben ser números mayores o iguales que cero (por
            ejemplo 1.500.000 o 12,5). Dijkstra no admite pesos negativos.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={invalid}>
            Crear corredor
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
