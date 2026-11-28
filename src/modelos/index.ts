// modelos/index.ts — el catálogo: toda la app (pestañas, tarjetas, descargas) se construye recorriéndolo.
// Agregar un modelo nuevo = un archivo en esta carpeta, una línea aquí y su ficha en public/modelos/.
import type { DefinicionModelo } from "./tipos";
import { MVC } from "./mvc";
import { CAPAS } from "./capas";
import { MICROSERVICIOS } from "./microservicios";

export const CATALOGO: DefinicionModelo[] = [MVC, CAPAS, MICROSERVICIOS];

export function modeloPorId(id: string): DefinicionModelo | undefined {
  return CATALOGO.find((m) => m.id === id);
}
