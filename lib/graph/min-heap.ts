/**
 * Montículo binario mínimo.
 *
 * Es la estructura que le da a Dijkstra su complejidad O((V + A) log V).
 * Sin ella, buscar el mínimo linealmente en cada iteración daría O(V²).
 *
 * Estrategia de `decrease-key`: **borrado perezoso**. En vez de reubicar una
 * entrada existente cuando mejora la distancia de un nodo, se inserta una
 * entrada nueva y la vieja se descarta al extraerla. Es la variante estándar,
 * es más simple de razonar, y las entradas obsoletas son visibles en la
 * animación (se muestran tachadas), que es un buen punto didáctico.
 */

export interface HeapEntry<T> {
  priority: number;
  /** Contador monótono que desempata a igual prioridad. */
  sequence: number;
  value: T;
}

export class MinHeap<T> {
  private items: HeapEntry<T>[] = [];
  private counter = 0;

  constructor(initial?: readonly { priority: number; value: T }[]) {
    if (initial && initial.length > 0) {
      this.items = initial.map((entry) => ({
        priority: entry.priority,
        sequence: this.counter++,
        value: entry.value,
      }));
      // Construcción en O(n): se hunde cada nodo interno de abajo hacia arriba.
      for (let i = (this.items.length >> 1) - 1; i >= 0; i--) {
        this.siftDown(i);
      }
    }
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** O(log n) */
  push(priority: number, value: T): void {
    this.items.push({ priority, sequence: this.counter++, value });
    this.siftUp(this.items.length - 1);
  }

  /** O(log n) */
  pop(): HeapEntry<T> | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  /** O(1) */
  peek(): HeapEntry<T> | undefined {
    return this.items[0];
  }

  /** O(n). Orden interno del montículo, no ordenado por prioridad. */
  toArray(): readonly HeapEntry<T>[] {
    return this.items;
  }

  /**
   * O(n log n). Copia ordenada ascendentemente por prioridad — solo para
   * retratar el estado de la cola en cada paso. No muta el montículo.
   */
  toSortedArray(): HeapEntry<T>[] {
    return [...this.items].sort(
      (a, b) => a.priority - b.priority || a.sequence - b.sequence,
    );
  }

  clear(): void {
    this.items = [];
  }

  private compare(a: HeapEntry<T>, b: HeapEntry<T>): number {
    return a.priority - b.priority || a.sequence - b.sequence;
  }

  private siftUp(start: number): void {
    let index = start;
    const item = this.items[index];
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(item, this.items[parent]) >= 0) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  private siftDown(start: number): void {
    let index = start;
    const length = this.items.length;
    const item = this.items[index];
    for (;;) {
      const left = index * 2 + 1;
      if (left >= length) break;
      const right = left + 1;
      const child =
        right < length && this.compare(this.items[right], this.items[left]) < 0
          ? right
          : left;
      if (this.compare(this.items[child], item) >= 0) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = item;
  }
}
