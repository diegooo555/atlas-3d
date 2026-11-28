// ===== Avisos locales del Atlas 3D — Sesión 37 =====
// El Atlas no tiene servidor: no hay push. Solo notificaciones locales, y solo
// si el usuario concedió el permiso (pedido dentro de un clic, nunca al cargar).

export type EstadoAvisos = NotificationPermission | "no-soportado";

export function estadoAvisos(): EstadoAvisos {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "no-soportado";
  return Notification.permission;
}

export function describirEstadoAvisos(estado: EstadoAvisos = estadoAvisos()): string {
  switch (estado) {
    case "granted":
      return "Avisos activos.";
    case "denied":
      return "Bloqueaste los avisos: puedes reactivarlos en la configuración del sitio.";
    case "no-soportado":
      return "Este navegador no permite avisos.";
    default:
      return "Avisos sin activar.";
  }
}

/** Pide el permiso (debe llamarse desde un clic) y confirma con un primer aviso. */
export async function activarAvisos(): Promise<EstadoAvisos> {
  if (estadoAvisos() === "no-soportado") return "no-soportado";
  const permiso = await Notification.requestPermission();
  if (permiso === "granted") {
    await mostrarAviso("Avisos activados", "Te avisaremos cuando terminen las descargas del Atlas.");
  }
  return permiso;
}

/** Muestra una notificación a través del Service Worker (funciona también en Android). */
export async function mostrarAviso(titulo: string, cuerpo: string, url = "/", tag = "atlas-aviso"): Promise<boolean> {
  if (estadoAvisos() !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(titulo, {
    body: cuerpo,
    icon: "/iconos/icon-192.png",
    tag,
    data: { url },
  });
  return true;
}
