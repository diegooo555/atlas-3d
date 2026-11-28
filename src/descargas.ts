// ===== Descarga de fichas — Sesión 37 =====
// Este módulo lo importan el Service Worker (sw.ts) y la página (main.ts):
// como Vite empaqueta ambos, la lógica se escribe UNA sola vez.
import { obtenerDescargas, marcarDescargaLista } from "./db";
import type { Ficha } from "./modelos/tipos";

export const ETIQUETA_SYNC = "descargar-modelos";
export const CACHE_MODELOS = "modelos-3d";
// BASE_URL vale «/» en local y «/nombre-del-repo/» en GitHub Pages: nunca escribas rutas absolutas a mano.
export const urlDeModelo = (id: string) => `${import.meta.env.BASE_URL}modelos/${id}.json`;

/**
 * Las fichas que existen en public/modelos/ (una por modelo del catálogo, src/modelos/index.ts).
 * Se escriben aquí, y no importando el catálogo, para que el Service Worker no cargue los modelos.
 */
export const MODELOS_IDS = ["mvc", "capas", "microservicios"];

export type AlProgresar = (hechos: number, total: number) => void | Promise<void>;

/**
 * Descarga, una por una, las fichas que están «pendiente». Si una falla LANZA:
 * las anteriores ya quedaron marcadas como «listo» (no se vuelven a pedir) y
 * el navegador reintentará solo las que faltan.
 * Devuelve cuántas se descargaron en esta pasada.
 */
export async function descargarPendientes(db: IDBDatabase, alProgresar: AlProgresar): Promise<number> {
  const todas = await obtenerDescargas(db);
  const total = todas.length;
  let hechos = todas.filter((d) => d.estado === "listo").length;
  const cache = await caches.open(CACHE_MODELOS);
  let descargadas = 0;
  for (const d of todas.filter((x) => x.estado === "pendiente")) {
    // cache: "reload" evita que la caché HTTP del navegador responda por la red.
    const resp = await fetch(urlDeModelo(d.modeloId), { cache: "reload" });
    if (!resp.ok) throw new Error(`${d.modeloId}: el servidor respondió ${resp.status}`);
    await cache.put(urlDeModelo(d.modeloId), resp);
    await marcarDescargaLista(db, d.modeloId);
    hechos++;
    descargadas++;
    await alProgresar(hechos, total);
  }
  return descargadas;
}

/**
 * Sesión 40: la ficha ampliada de un modelo, por tres caminos en orden:
 * la caché «modelos-3d» (sirve sin conexión), la red y, si no hay ninguno, null
 * (la página usa entonces solo el resumen que viaja en el código).
 */
export async function leerFicha(id: string): Promise<Ficha | null> {
  try {
    const cache = await caches.open(CACHE_MODELOS);
    const guardada = await cache.match(urlDeModelo(id));
    if (guardada) return (await guardada.json()) as Ficha;
  } catch {
    /* sin Cache Storage: se intenta la red */
  }
  try {
    const resp = await fetch(urlDeModelo(id));
    if (resp.ok) return (await resp.json()) as Ficha;
  } catch {
    /* sin red */
  }
  return null;
}
