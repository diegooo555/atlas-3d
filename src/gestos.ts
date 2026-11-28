// gestos.ts — gestos con los dedos sobre el overlay de la sesión AR (Sesión 39).
// Traduce Pointer Events a tres intenciones: mover (un dedo), escalar y girar (dos dedos).

export interface AccionesGestos {
  /** Un dedo se arrastra (tras superar el umbral). `primero` es true en el primer movimiento. */
  alMover(clientX: number, clientY: number, primero: boolean): void;
  /** Dos dedos giran entre sí: cambio de ángulo en radianes. */
  alGirar(rad: number): void;
  /** Dos dedos se separan o se juntan: distancia actual ÷ distancia anterior. */
  alEscalar(factor: number): void;
}

export interface Gestos {
  /** true si el toque actual ya se convirtió en un gesto (arrastre o dos dedos): no es «tocar para colocar». */
  huboGesto(): boolean;
  destruir(): void;
}

const UMBRAL_ARRASTRE_PX = 10; // por debajo de esto es un toque, no un arrastre

export function crearGestos(el: HTMLElement, acciones: AccionesGestos): Gestos {
  const dedos = new Map<number, { x: number; y: number }>();
  let inicio = { x: 0, y: 0 };
  let arrastrando = false;
  let hubo = false;
  let distanciaPrev = 0;
  let anguloPrev = 0;

  const medida = () => {
    const [a, b] = [...dedos.values()];
    return { distancia: Math.hypot(b.x - a.x, b.y - a.y), angulo: Math.atan2(b.y - a.y, b.x - a.x) };
  };

  function alBajar(e: PointerEvent) {
    // Los botones del overlay (como «Salir de AR») no inician gestos.
    if ((e.target as HTMLElement).closest("button")) return;
    if (dedos.size === 0) {
      hubo = false;
      arrastrando = false;
      inicio = { x: e.clientX, y: e.clientY };
    }
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 2) {
      const m = medida();
      distanciaPrev = m.distancia;
      anguloPrev = m.angulo;
      hubo = true; // con dos dedos nunca es un toque
    }
  }

  function alMoverDedo(e: PointerEvent) {
    const dedo = dedos.get(e.pointerId);
    if (!dedo) return;
    dedo.x = e.clientX;
    dedo.y = e.clientY;
    if (dedos.size === 1) {
      if (!arrastrando && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < UMBRAL_ARRASTRE_PX) return;
      const primero = !arrastrando;
      arrastrando = true;
      hubo = true;
      acciones.alMover(e.clientX, e.clientY, primero);
    } else if (dedos.size === 2) {
      const m = medida();
      if (distanciaPrev > 0) acciones.alEscalar(m.distancia / distanciaPrev);
      let d = m.angulo - anguloPrev;
      if (d > Math.PI) d -= 2 * Math.PI; // el ángulo da la vuelta en ±180°: se normaliza
      if (d < -Math.PI) d += 2 * Math.PI;
      acciones.alGirar(d);
      distanciaPrev = m.distancia;
      anguloPrev = m.angulo;
    }
  }

  function alSubir(e: PointerEvent) {
    dedos.delete(e.pointerId);
    if (dedos.size === 0) arrastrando = false;
  }

  el.addEventListener("pointerdown", alBajar);
  el.addEventListener("pointermove", alMoverDedo);
  el.addEventListener("pointerup", alSubir);
  el.addEventListener("pointercancel", alSubir);
  return {
    huboGesto: () => hubo,
    destruir() {
      el.removeEventListener("pointerdown", alBajar);
      el.removeEventListener("pointermove", alMoverDedo);
      el.removeEventListener("pointerup", alSubir);
      el.removeEventListener("pointercancel", alSubir);
      dedos.clear();
    },
  };
}
