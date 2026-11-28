// conexion.ts — el estado de la conexión (Sesión 41).
// Ojo: navigator.onLine en false es fiable (no hay red); en true solo dice «hay alguna red»,
// no que el servidor responda (un wifi sin salida a Internet también da true).

/** Avisa del estado inicial y de cada cambio. Devuelve una función para dejar de escuchar. */
export function iniciarConexion(alCambiar: (enLinea: boolean) => void): () => void {
  const alSubir = () => alCambiar(true);
  const alBajar = () => alCambiar(false);
  window.addEventListener("online", alSubir);
  window.addEventListener("offline", alBajar);
  alCambiar(navigator.onLine);
  return () => {
    window.removeEventListener("online", alSubir);
    window.removeEventListener("offline", alBajar);
  };
}
