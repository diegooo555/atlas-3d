// instalar.ts — la instalación guiada (Sesión 41).
// El navegador decide CUÁNDO la app es instalable (y lo avisa con «beforeinstallprompt»);
// la página decide CÓMO se ofrece: guarda el evento y lo usa en un botón propio.

/** TypeScript no trae el tipo del evento (no es un estándar cerrado): se declara solo lo que se usa. */
interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type EstadoInstalacion = "instalada" | "recien-instalada" | "instalable" | "ios" | "no-disponible";

let evento: EventoInstalacion | null = null; // el evento guardado (solo sirve una vez)
let recienInstalada = false; // llegó «appinstalled» en esta visita
let rechazada = false; // la persona canceló el diálogo del sistema
let avisar: () => void = () => {};

export function iniciarInstalacion(alCambiar: () => void): void {
  avisar = alCambiar;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Sin esto, Chrome móvil muestra su propia barrita de «Instalar». Se guarda para usarlo en NUESTRO botón.
    e.preventDefault();
    evento = e as EventoInstalacion;
    rechazada = false;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    evento = null; // ya no sirve
    recienInstalada = true;
    avisar();
  });
  // Cambiar entre pestaña del navegador y ventana de app también cambia el modo de visualización.
  window.matchMedia("(display-mode: standalone)").addEventListener("change", () => avisar());
  avisar();
}

/** Abre el diálogo del sistema. Debe llamarse dentro de un clic (gesto del usuario). */
export async function pedirInstalacion(): Promise<"accepted" | "dismissed" | "no-disponible"> {
  if (!evento) return "no-disponible";
  const guardado = evento;
  evento = null; // un evento solo se puede usar una vez: se suelta antes de esperar la respuesta
  await guardado.prompt();
  const { outcome } = await guardado.userChoice;
  rechazada = outcome === "dismissed";
  avisar();
  return outcome;
}

export function estaInstalada(): boolean {
  // Android/escritorio: el modo de visualización del manifest. iOS: la propiedad no estándar «standalone».
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone o iPad (el iPad reciente se presenta como un «Mac» con pantalla táctil). Safari no dispara el evento. */
export function esIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Si la persona canceló el último diálogo (para explicar por qué no hay botón). */
export function instalacionRechazada(): boolean {
  return rechazada;
}

export function estadoInstalacion(): EstadoInstalacion {
  // El orden importa: si ya corre como app, no se ofrece aunque haya evento.
  if (estaInstalada()) return "instalada";
  if (recienInstalada) return "recien-instalada";
  if (evento) return "instalable";
  if (esIOS()) return "ios";
  return "no-disponible";
}
