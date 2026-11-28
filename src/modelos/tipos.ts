// modelos/tipos.ts — un modelo de arquitectura descrito como DATOS (Sesión 40).
// Un modelo es una lista de piezas y de enlaces; constructor.ts los convierte en objetos 3D.
// Este archivo no importa Three.js: lo usan también el Service Worker y las descargas.

/** Qué papel cumple una pieza. El rol decide el color y el texto de la leyenda. */
export type Rol = "actor" | "presentacion" | "coordinacion" | "logica" | "datos" | "infra";

/** Geometría de la pieza: solo cajas, cilindros y esferas (es un esquema didáctico). */
export type Forma = "caja" | "cilindro" | "esfera";

export interface Pieza {
  id: string;
  nombre: string;
  rol: Rol;
  forma: Forma;
  /** Centro de la pieza (x derecha, y arriba, z hacia el espectador). */
  pos: [number, number, number];
  /** Ancho, alto y fondo. */
  tam: [number, number, number];
  /** Frase corta: viaja con el código, así se lee aunque no haya conexión. */
  resumen: string;
  /** Dónde va el rótulo: «arriba» de la pieza (por defecto), «abajo», o «frente», sobre su cara delantera. */
  rotulo?: "arriba" | "abajo" | "frente";
}

/** Cómo se comunican dos piezas: una llamada directa, un evento, o un flujo de datos. */
export type TipoEnlace = "llamada" | "evento" | "datos";

export interface Enlace {
  de: string;
  a: string;
  etiqueta?: string;
  tipo: TipoEnlace;
  /** Desplaza la flecha entera, para dibujar dos flechas paralelas entre las mismas piezas. */
  desvio?: [number, number, number];
}

export interface DefinicionModelo {
  id: string;
  nombre: string;
  /** Una línea para la lista de modelos. */
  resumen: string;
  piezas: Pieza[];
  enlaces: Enlace[];
  /** Altura de la cámara de la vista normal, en grados sobre el horizonte (cada modelo se lee mejor desde un ángulo distinto). */
  elevacion?: number;
  /** Factor de la distancia de la cámara (menor = más cerca). Por defecto 1. */
  distancia?: number;
}

/**
 * La explicación ampliada de un modelo: vive en public/modelos/<id>.json, NO en el código.
 * Se descarga (Sesión 37) y se lee de la caché, de la red o, si no hay ninguna, no se lee.
 */
export interface Ficha {
  id: string;
  nombre: string;
  resumen: string;
  cuandoUsarla: string;
  riesgo: string;
  /** Responsabilidad ampliada de cada pieza, por id de pieza. */
  piezas: Record<string, string>;
}

/** El mismo color significa lo mismo en los tres modelos. */
export const ROLES: Record<Rol, { nombre: string; color: number; css: string }> = {
  actor: { nombre: "Usuario o sistema externo", color: 0x94a3b8, css: "#94a3b8" },
  presentacion: { nombre: "Presentación", color: 0x3b82f6, css: "#3b82f6" },
  coordinacion: { nombre: "Coordinación", color: 0xf97316, css: "#f97316" },
  logica: { nombre: "Lógica de negocio", color: 0xfacc15, css: "#facc15" },
  datos: { nombre: "Datos", color: 0x22c55e, css: "#22c55e" },
  infra: { nombre: "Infraestructura", color: 0xa855f7, css: "#a855f7" },
};

/** El tipo de enlace decide el color de la flecha: los eventos (rosa) se distinguen de las llamadas. */
export const COLORES_ENLACE: Record<TipoEnlace, number> = {
  llamada: 0xe8e2cf,
  datos: 0x67e8f9,
  evento: 0xf472b6,
};
