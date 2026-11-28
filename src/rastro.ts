// rastro.ts — «migas de pan» de la salida de AR (Sesión 40).
// Si el proceso de la pestaña muere («¡Oh, no!») no queda consola ni excepción que leer.
// Por eso, ANTES de cada paso delicado se anota su nombre en localStorage (una escritura
// síncrona llega al almacenamiento aunque la pestaña muera un instante después) y, al
// reabrir la app, la última anotación dice hasta dónde se llegó.

const CLAVE = "atlas3d-rastro-ar";
export const PASO_FINAL = "fin-ok";

export function anotar(paso: string): void {
  try {
    localStorage.setItem(CLAVE, `${paso}|${Date.now()}`);
  } catch {
    /* sin almacenamiento (modo privado): el rastro es opcional */
  }
}

/** La última anotación: qué paso y hace cuántos segundos. null si nunca se anotó nada. */
export function leerRastro(): { paso: string; hace: number } | null {
  let valor: string | null = null;
  try {
    valor = localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
  if (!valor) return null;
  const [paso, cuando] = valor.split("|");
  const hace = Math.max(0, Math.round((Date.now() - Number(cuando)) / 1000));
  return { paso, hace: Number.isFinite(hace) ? hace : 0 };
}

/** true si la última sesión de AR no llegó a «fin-ok»: la pestaña murió en algún paso. */
export function rastroInterrumpido(): boolean {
  const r = leerRastro();
  return r !== null && r.paso !== PASO_FINAL;
}

export function describirRastro(): string {
  const r = leerRastro();
  if (!r) return "Última sesión de AR: sin registro.";
  if (r.paso === PASO_FINAL) return `Última sesión de AR: terminó completa (hace ${r.hace} s).`;
  return `Última sesión de AR: se interrumpió en el paso «${r.paso}» (hace ${r.hace} s).`;
}
