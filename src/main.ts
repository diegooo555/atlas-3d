import './style.css'
import { registerSW } from 'virtual:pwa-register';
import { crearVisor } from "./visor";
import { pedirPermisoOrientacion, hayOrientacionReal, iniciarControlOrientacion } from "./sensores";
import type { ControlOrientacion } from "./sensores";
import { iniciarCamaraDeFondo, detenerCamaraDeFondo, describirErrorCamara } from "./camara";

import {
  abrirBaseDeDatos, marcarModeloVisto, alternarFavorito, obtenerFavoritos,
  derivarClaveDesdeContrasena, guardarNotaDeEstudio, descifrarTexto,
  encolarDescargas, obtenerDescargas,
} from './db';
import { descargarPendientes, ETIQUETA_SYNC, MODELOS_IDS, leerFicha } from "./descargas";
import { activarAvisos, describirEstadoAvisos, estadoAvisos, mostrarAviso } from "./avisos";
import { diagnosticarAR, mensajeSoporteAR, pedirSesionAR, describirErrorAR } from "./xr";
import type { EstadoAR } from "./visor";
import { CATALOGO, modeloPorId } from "./modelos";
import { ROLES } from "./modelos/tipos";
import type { Ficha } from "./modelos/tipos";
import { describirRastro, rastroInterrumpido } from "./rastro";

const panel = document.createElement('div');
panel.style.cssText = 'padding:12px;font-family:sans-serif';
panel.innerHTML = `
  <h3>Progreso (IndexedDB) — Sesión 33</h3>
  <button id="ver1">Ver mvc</button>
  <button id="ver2">Ver capas</button>
  <button id="fav1">★ Favorito mvc</button>
  <button id="listar">Listar favoritos</button>
  <button id="nota">Guardar nota cifrada (mvc)</button>
  <button id="leer">Leer nota (mvc)</button>
  <pre id="salida"></pre>`;
document.body.appendChild(panel);
const salida = panel.querySelector('#salida')!;
const mostrar = (x: unknown) => (salida.textContent = JSON.stringify(x, null, 2));

// La sal se guarda (no es secreta); sin ella la misma contraseña no da la misma clave
function obtenerSal(): Uint8Array {
  const guardada = localStorage.getItem('atlas3d-sal');
  if (guardada) return new Uint8Array(JSON.parse(guardada));
  const sal = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem('atlas3d-sal', JSON.stringify([...sal]));
  return sal;
}

// Sesión 37: la conexión se comparte con la sección de descargas (más abajo).
let db: IDBDatabase;
const dbLista = abrirBaseDeDatos().then((d) => (db = d));

dbLista.then(db => {
  panel.querySelector('#ver1')!.addEventListener('click', async () => mostrar(await marcarModeloVisto(db, 'mvc')));
  panel.querySelector('#ver2')!.addEventListener('click', async () => mostrar(await marcarModeloVisto(db, 'capas')));
  panel.querySelector('#fav1')!.addEventListener('click', async () => mostrar({ favorito: await alternarFavorito(db, 'mvc') }));
  panel.querySelector('#listar')!.addEventListener('click', async () => mostrar(await obtenerFavoritos(db)));

  panel.querySelector('#nota')!.addEventListener('click', async () => {
    const pass = prompt('Contraseña para cifrar la nota:') || '';
    const texto = prompt('Escribe tu nota de estudio:') || '';
    const clave = await derivarClaveDesdeContrasena(pass, obtenerSal());
    await guardarNotaDeEstudio(db, clave, 'mvc', texto);
    mostrar('Nota guardada cifrada. Revísala en Application → IndexedDB.');
  });

  panel.querySelector('#leer')!.addEventListener('click', async () => {
    const pass = prompt('Contraseña:') || '';
    const clave = await derivarClaveDesdeContrasena(pass, obtenerSal());
    const reg = await new Promise<any>(r => {
      db.transaction('progreso').objectStore('progreso').get('mvc').onsuccess = e => r((e.target as IDBRequest).result);
    });
    try { mostrar({ nota: await descifrarTexto(clave, reg.notaCifrada, reg.notaIv) }); }
    catch { mostrar('Contraseña incorrecta: no se pudo descifrar.'); }
  });
});

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.log('SW del Atlas (injectManifest) registrado:', swUrl, registration);
  },
  // Sesión 37: el precaché quedó completo por primera vez.
  onOfflineReady() {
    estadoDescargaEl.textContent = "✓ La app ya funciona sin conexión.";
    // La notificación del sistema solo si la página no está visible.
    if (document.visibilityState !== "visible") {
      void mostrarAviso("Atlas 3D listo sin conexión", "Ya puedes abrir el Atlas aunque no tengas red.");
    }
  },
  onRegisterError(error) {
    console.error('Error al registrar el SW de Workbox:', error);
  },
});

// ── Sesión 35: visor 3D controlado por sensores de orientación ──────────────
const visor = crearVisor(document.querySelector<HTMLElement>("#visor")!);
const btnOrientacion = document.querySelector<HTMLButtonElement>("#btn-orientacion")!;
const btnCalibrar = document.querySelector<HTMLButtonElement>("#btn-calibrar")!;
const lecturaVisor = document.querySelector<HTMLElement>("#lectura-visor")!;
const avisoVisor = document.querySelector<HTMLElement>("#aviso-visor")!;
let control: ControlOrientacion | null = null;
let timerLectura = 0;

function avisarVisor(texto: string) {
  avisoVisor.textContent = texto;
  avisoVisor.hidden = !texto;
}

function apagarSensores() {
  control?.detener();
  control = null;
  window.clearInterval(timerLectura);
  visor.controlPorSensores(false);
  lecturaVisor.textContent = "";
  btnCalibrar.disabled = true;
  btnOrientacion.textContent = "📱 Rotar con el teléfono";
}

btnOrientacion.addEventListener("click", async () => {
  if (control) {
    apagarSensores(); // segundo clic: volver al control manual
    return;
  }
  const permiso = await pedirPermisoOrientacion();
  if (permiso === "denied") {
    avisarVisor("Denegaste el acceso a los sensores. Sigue disponible el control con ratón o dedo.");
    return;
  }
  if (permiso === "no-soportado" || !(await hayOrientacionReal())) {
    avisarVisor("Este dispositivo no tiene sensores de orientación. Usa el ratón o el dedo para girar el visor.");
    return;
  }
  avisarVisor("");
  visor.controlPorSensores(true);
  control = iniciarControlOrientacion((x, y) => visor.rotarHacia(x, y));
  btnCalibrar.disabled = false;
  btnOrientacion.textContent = "📱 Sensores: ACTIVOS (toca para apagar)";
  timerLectura = window.setInterval(() => {
    const { x, y } = visor.rotacionActualGrados();
    lecturaVisor.textContent = `rotación X ${x}° · Y ${y}°`;
  }, 150);
});
btnCalibrar.addEventListener("click", () => control?.calibrar());

// ── Sesión 36: cámara como fondo del visor ──────────────────────────────────
const videoFondo = document.querySelector<HTMLVideoElement>("#fondo-camara")!;
const btnCamara = document.querySelector<HTMLButtonElement>("#btn-camara")!;
let streamFondo: MediaStream | null = null;

function apagarCamara() {
  detenerCamaraDeFondo(videoFondo, streamFondo);
  streamFondo = null;
  videoFondo.hidden = true;
  visor.fondoTransparente(false);
  btnCamara.textContent = "📷 Cámara de fondo";
}

btnCamara.addEventListener("click", async () => {
  if (streamFondo) {
    apagarCamara();
    return;
  }
  avisarVisor("");
  try {
    // El permiso se pide AQUÍ, dentro del clic — no al cargar la página.
    streamFondo = await iniciarCamaraDeFondo(videoFondo);
  } catch (err) {
    avisarVisor(describirErrorCamara(err));
    return;
  }
  videoFondo.hidden = false;
  visor.fondoTransparente(true);
  btnCamara.textContent = "📷 Cámara: ACTIVA (toca para apagar)";
});

// Si el usuario cambia de pestaña o minimiza, la cámara se apaga sola:
// una cámara abierta en segundo plano gasta batería y deja el LED encendido.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && streamFondo) {
    apagarCamara();
    avisarVisor("La cámara se apagó al salir de la página. Vuelve a activarla cuando quieras.");
  }
});

// ── Sesiones 38 y 39: realidad aumentada con WebXR ──────────────────────────
const btnAR = document.querySelector<HTMLButtonElement>("#btn-ar")!;
const estadoAR = document.querySelector<HTMLElement>("#estado-ar")!;
const overlayAR = document.querySelector<HTMLElement>("#xr-overlay");
const btnSalirAR = document.querySelector<HTMLButtonElement>("#btn-salir-ar")!;
const diagAR = document.querySelector<HTMLElement>("#diag-ar")!;
const detallesAR = document.querySelector<HTMLDetailsElement>(".diag-ar")!;
const btnRecomprobar = document.querySelector<HTMLButtonElement>("#btn-recomprobar")!;
const xrEstado = document.querySelector<HTMLElement>("#xr-estado")!;
const xrDatos = document.querySelector<HTMLElement>("#xr-datos")!;
let sesionAR: XRSession | null = null;

// ── Sesión 39: hit-test, retícula, anclas y gestos (2/2) ────────────────────
// Texto de ayuda sobre la cámara según en qué punto va la colocación.
function ayudaAR(e: EstadoAR): string {
  if (!e.hitTest) return "Este dispositivo no ofrece hit-test: el modelo está a 1,5 m delante. Toca para traerlo delante de ti.";
  switch (e.fase) {
    case "buscando":
      return e.sinSuperficie
        ? "No encuentro superficies. Prueba con una zona con textura y buena luz, o toca la pantalla para colocar el modelo delante de ti."
        : "Mueve el teléfono despacio hasta ver el anillo verde sobre una superficie.";
    case "listo":
      return "Toca la pantalla para colocar el modelo.";
    case "colocado":
      return e.overlay
        ? "Arrastra para moverlo, gira con dos dedos, pellizca para el tamaño. Toca otro punto para recolocarlo."
        : "Modelo colocado. Toca otro punto para recolocarlo.";
  }
}

// Cada cambio del texto del overlay obliga al navegador a volver a dibujarlo
// encima de la cámara, y eso cuesta. Por eso: (1) solo se escribe si el texto
// cambió y (2) como máximo cada 200 ms (los gestos avisan decenas de veces por segundo).
const INTERVALO_OVERLAY_MS = 200;
let ultimoPintado = 0;
let pendienteAR: EstadoAR | null = null;
let temporizadorAR = 0;

function pintarEstadoAR(e: EstadoAR): void {
  const si = (v: boolean) => (v ? "sí" : "no");
  const { x, y, z } = e.posicion;
  const pos = e.fase === "colocado" ? `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) m` : "—";
  const ayuda = ayudaAR(e);
  const datos =
    `hit-test: ${si(e.hitTest)} · anclas: ${si(e.anclas)} · anclado: ${si(e.anclado)} · ` +
    `fase: ${e.fase} · escala: ${e.escala.toFixed(2)} · giro: ${e.giroGrados}° · pos: ${pos} · ` +
    `consultas: ${e.consultas} · resultados: ${e.resultados} · poses: ${e.impactos}`;
  if (xrEstado.textContent !== ayuda) xrEstado.textContent = ayuda;
  if (xrDatos.textContent !== datos) xrDatos.textContent = datos;
}

function mostrarEstadoAR(e: EstadoAR): void {
  if (performance.now() - ultimoPintado >= INTERVALO_OVERLAY_MS) {
    ultimoPintado = performance.now();
    pintarEstadoAR(e);
    return;
  }
  pendienteAR = e; // se pintará el último estado cuando venza el intervalo
  if (temporizadorAR) return;
  temporizadorAR = window.setTimeout(() => {
    temporizadorAR = 0;
    ultimoPintado = performance.now();
    if (pendienteAR) pintarEstadoAR(pendienteAR);
    pendienteAR = null;
  }, INTERVALO_OVERLAY_MS);
}

// ¿Se puede? El botón solo se habilita si la respuesta es «sí». Se pregunta al
// cargar, al pulsar «Comprobar de nuevo» y cuando el navegador avisa de que
// cambió el dispositivo XR (así funciona también si activas el emulador después).
async function comprobarAR(): Promise<void> {
  const { estado, lineas } = await diagnosticarAR();
  estadoAR.textContent = mensajeSoporteAR(estado);
  // Sesión 40: la última línea es el rastro de la salida de AR anterior (rastro.ts).
  diagAR.textContent = [...lineas, describirRastro()].join("\n");
  if (!sesionAR) btnAR.disabled = estado !== "disponible";
  // Si no se puede, o si la última salida de AR se interrumpió, el diagnóstico se muestra abierto.
  detallesAR.open = estado !== "disponible" || rastroInterrumpido();
}
void comprobarAR();
btnRecomprobar.addEventListener("click", () => void comprobarAR());
navigator.xr?.addEventListener("devicechange", () => void comprobarAR());

btnAR.addEventListener("click", async () => {
  avisarVisor("");
  // La cámara del navegador y la sesión AR no pueden usarse a la vez: la AR
  // abre la cámara por su cuenta. Se apagan también los sensores de la Sesión 35.
  apagarCamara();
  apagarSensores();
  try {
    // La petición ocurre DENTRO del clic: es el «gesto del usuario» que exige WebXR.
    const sesion = await pedirSesionAR(overlayAR);
    sesionAR = sesion;
    btnAR.disabled = true;
    pintarPiezaAR();
    const caps = await visor.entrarEnAR(sesion, {
      overlay: overlayAR!,
      alCambiar: mostrarEstadoAR,
      alTerminar: () => {
        sesionAR = null;
        btnAR.disabled = false;
        window.clearTimeout(temporizadorAR);
        temporizadorAR = 0;
        pendienteAR = null;
        estadoAR.textContent = "La sesión de realidad aumentada terminó.";
        // El visor termina de salir unos instantes después (rastro «fin-ok»): entonces se refresca el diagnóstico.
        window.setTimeout(() => void comprobarAR(), 400);
      },
    });
    // Pedir no es recibir: se dice en pantalla qué funciones no concedió el navegador.
    const faltan = [
      caps.overlay ? "" : "dom-overlay",
      caps.hitTest ? "" : "hit-test",
      caps.anclas ? "" : "anchors",
    ].filter(Boolean);
    estadoAR.textContent = faltan.length
      ? `Sesión de realidad aumentada activa. El navegador no concedió: ${faltan.join(", ")}.`
      : "Sesión de realidad aumentada activa. Usa «Salir de AR» sobre la cámara.";
  } catch (err) {
    sesionAR?.end().catch(() => {});
    sesionAR = null;
    btnAR.disabled = false;
    avisarVisor(describirErrorAR(err));
  }
});

// «Salir de AR» solo termina la sesión: la restauración la hace el listener de «end».
btnSalirAR.addEventListener("click", () => {
  void sesionAR?.end();
});
// Un toque sobre un botón del overlay NO debe contar como «tocar para colocar»:
// el navegador avisa con `beforexrselect` y basta cancelarlo.
btnSalirAR.addEventListener("beforexrselect", (e) => e.preventDefault());

// ── Sesión 40: modelos de arquitectura en 3D ────────────────────────────────
const tabsModelo = document.querySelector<HTMLElement>("#tabs-modelo")!;
const resumenModelo = document.querySelector<HTMLElement>("#resumen-modelo")!;
const leyendaEl = document.querySelector<HTMLElement>("#leyenda")!;
const chipsPiezas = document.querySelector<HTMLElement>("#chips-piezas")!;
const detallePieza = document.querySelector<HTMLElement>("#detalle-pieza")!;
const xrPieza = document.querySelector<HTMLElement>("#xr-pieza")!;
const btnPiezaAnt = document.querySelector<HTMLButtonElement>("#btn-pieza-ant")!;
const btnPiezaSig = document.querySelector<HTMLButtonElement>("#btn-pieza-sig")!;
let modeloActualId: string | null = null;
let piezaActual: string | null = null;
let fichaActual: Ficha | null = null;

/** Párrafo con un título en negrita opcional. textContent: los textos de la ficha nunca se interpretan como HTML. */
function parrafo(texto: string, titulo?: string, clase?: string): HTMLParagraphElement {
  const p = document.createElement("p");
  if (clase) p.className = clase;
  if (titulo) {
    const b = document.createElement("strong");
    b.textContent = titulo + " ";
    p.append(b);
  }
  p.append(texto);
  return p;
}

/** El panel bajo el visor: el resumen (del código) y, si hay ficha, la explicación ampliada. */
function pintarDetalle(): void {
  const def = modeloPorId(modeloActualId ?? "");
  if (!def) return;
  const pieza = def.piezas.find((p) => p.id === piezaActual);
  const sinFicha = "Detalle ampliado no disponible: descarga las fichas (abajo) para leerlo sin conexión.";
  if (!pieza) {
    detallePieza.replaceChildren(
      parrafo("Toca una pieza del modelo, o elígela en la lista, para ver qué hace. Toca la misma pieza otra vez para soltarla.")
    );
    if (fichaActual) {
      detallePieza.append(parrafo(fichaActual.cuandoUsarla, "Cuándo usarlo."), parrafo(fichaActual.riesgo, "Riesgo principal."));
    } else {
      detallePieza.append(parrafo(sinFicha, undefined, "sin-ficha"));
    }
    return;
  }
  const h = document.createElement("h4");
  h.textContent = pieza.nombre;
  const rol = document.createElement("span");
  rol.className = "rol";
  rol.textContent = ROLES[pieza.rol].nombre;
  detallePieza.replaceChildren(h, rol, parrafo(pieza.resumen));
  const ampliada = fichaActual?.piezas[pieza.id];
  if (ampliada) {
    // «Habla con» sale de los enlaces del modelo: no hay que escribirlo dos veces.
    const vecinos = def.enlaces
      .flatMap((e) => (e.de === pieza.id ? [e.a] : e.a === pieza.id ? [e.de] : []))
      .filter((id, i, todos) => todos.indexOf(id) === i)
      .map((id) => def.piezas.find((p) => p.id === id)?.nombre ?? id);
    detallePieza.append(parrafo(ampliada, "Responsabilidad."));
    if (vecinos.length) detallePieza.append(parrafo(vecinos.join(", ") + ".", "Habla con:"));
  } else {
    detallePieza.append(parrafo(sinFicha, undefined, "sin-ficha"));
  }
}

/** Texto del overlay en AR. Solo se reescribe si cambió (tocar el DOM del overlay cuesta: Sesión 39). */
function pintarPiezaAR(): void {
  const def = modeloPorId(modeloActualId ?? "");
  if (!def) return;
  const pieza = def.piezas.find((p) => p.id === piezaActual);
  const texto = pieza
    ? `${pieza.nombre}: ${fichaActual?.piezas[pieza.id] ?? pieza.resumen}`
    : `${def.nombre}. Usa ◀ ▶ para recorrer sus piezas.`;
  if (xrPieza.textContent !== texto) xrPieza.textContent = texto;
}

/** La ÚNICA vía de actualización: el toque en el canvas, el chip y ◀ ▶ terminan aquí. */
function sincronizarPieza(id: string | null): void {
  piezaActual = id;
  chipsPiezas.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  pintarDetalle();
  pintarPiezaAR();
}

function elegirModelo(id: string): void {
  const def = modeloPorId(id);
  if (!def) return;
  modeloActualId = id;
  piezaActual = null;
  fichaActual = null;
  visor.mostrarModelo(def);
  tabsModelo.innerHTML = CATALOGO.map((m) => `<button type="button" class="tab" data-id="${m.id}" aria-pressed="${m.id === id}">${m.nombre}</button>`).join("");
  tabsModelo.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) => b.addEventListener("click", () => elegirModelo(b.dataset.id!)));
  resumenModelo.textContent = def.resumen;
  const roles = [...new Set(def.piezas.map((p) => p.rol))];
  leyendaEl.innerHTML = roles.map((r) => `<span class="leyenda-item"><i style="background:${ROLES[r].css}"></i>${ROLES[r].nombre}</span>`).join("");
  chipsPiezas.innerHTML = def.piezas.map((p) => `<button type="button" class="chip" data-id="${p.id}" aria-pressed="false"><i style="background:${ROLES[p.rol].css}"></i>${p.nombre}</button>`).join("");
  chipsPiezas.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      const nueva = piezaActual === b.dataset.id ? null : b.dataset.id!;
      visor.seleccionar(nueva);
      sincronizarPieza(nueva);
    })
  );
  pintarDetalle();
  pintarPiezaAR();
  // La ficha ampliada llega de la caché (sin conexión) o de la red; si no hay ninguna, se usa solo el código.
  void leerFicha(id).then((f) => {
    if (modeloActualId !== id) return;
    fichaActual = f;
    pintarDetalle();
    pintarPiezaAR();
  });
}

visor.alTocarPieza(sincronizarPieza);

// En AR un toque sobre el modelo coloca o recoloca: no puede elegir piezas. Se eligen con ◀ ▶
// (botones del overlay), que recorren las piezas una por una: ninguna → 1.ª → 2.ª … → ninguna.
function recorrerPiezas(paso: number): void {
  const def = modeloPorId(modeloActualId ?? "");
  if (!def) return;
  const ids: (string | null)[] = [null, ...def.piezas.map((p) => p.id)];
  const i = ids.indexOf(piezaActual);
  const siguiente = ids[(i + paso + ids.length) % ids.length];
  visor.seleccionar(siguiente);
  sincronizarPieza(siguiente);
}
btnPiezaAnt.addEventListener("click", () => recorrerPiezas(-1));
btnPiezaSig.addEventListener("click", () => recorrerPiezas(1));
// Como «Salir de AR»: pulsar ◀ ▶ no debe disparar un select que recoloque el modelo.
btnPiezaAnt.addEventListener("beforexrselect", (e) => e.preventDefault());
btnPiezaSig.addEventListener("beforexrselect", (e) => e.preventDefault());

// ── Sesión 37: fichas descargables, avisos y Background Sync ───────────────
// Las fichas completas viven en public/modelos/*.json y NO están en el precaché:
// se descargan cuando el usuario lo pide. Los nombres salen del catálogo (Sesión 40).

const btnAvisos = document.querySelector<HTMLButtonElement>("#btn-avisos")!;
const estadoAvisosEl = document.querySelector<HTMLElement>("#estado-avisos")!;
const btnDescargar = document.querySelector<HTMLButtonElement>("#btn-descargar")!;
const barraProgreso = document.querySelector<HTMLProgressElement>("#progreso-descarga")!;
const estadoDescargaEl = document.querySelector<HTMLElement>("#estado-descarga")!;
const tarjetasEl = document.querySelector<HTMLUListElement>("#tarjetas")!;
const fichaAbiertaEl = document.querySelector<HTMLElement>("#ficha-abierta")!;

// Abrir una ficha desde una notificación: el aviso lleva data.url = BASE_URL + "?modelo=ID".
const modeloDestacado = new URLSearchParams(location.search).get("modelo");
let descargados = new Set<string>();

function pintarAvisos() {
  const estado = estadoAvisos();
  estadoAvisosEl.textContent = describirEstadoAvisos(estado);
  btnAvisos.disabled = estado !== "default";
}

function pintarProgreso(hechos: number, total: number) {
  barraProgreso.hidden = false;
  barraProgreso.max = total;
  barraProgreso.value = hechos;
  estadoDescargaEl.textContent =
    hechos === total
      ? `✓ ${hechos} de ${total} fichas guardadas: ya puedes consultarlas sin conexión.`
      : `Descargando fichas: ${hechos} de ${total}…`;
}

async function refrescarDescargados() {
  await dbLista;
  const todas = await obtenerDescargas(db);
  descargados = new Set(todas.filter((d) => d.estado === "listo").map((d) => d.modeloId));
}

function render() {
  tarjetasEl.replaceChildren(
    ...MODELOS_IDS.map((id) => {
      const li = document.createElement("li");
      li.className = "tarjeta";
      li.dataset.modelo = id;
      if (id === modeloDestacado) li.classList.add("destacada");
      const titulo = document.createElement("span");
      titulo.textContent = modeloPorId(id)?.nombre ?? id;
      if (descargados.has(id)) {
        const insignia = document.createElement("span");
        insignia.className = "insignia-offline";
        insignia.textContent = " · disponible sin conexión";
        titulo.append(insignia);
      }
      const btnVer = document.createElement("button");
      btnVer.type = "button";
      btnVer.textContent = "Ver ficha";
      btnVer.addEventListener("click", () => abrirFicha(id));
      li.append(titulo, btnVer);
      return li;
    })
  );
}

async function abrirFicha(id: string) {
  fichaAbiertaEl.hidden = false;
  // Sesión 40: caché «modelos-3d» (sin conexión), red o nada (leerFicha en descargas.ts).
  const ficha = await leerFicha(id);
  if (!ficha) {
    fichaAbiertaEl.textContent = "No se pudo abrir la ficha: no hay conexión y no la descargaste.";
    return;
  }
  const h = document.createElement("h4");
  h.textContent = ficha.nombre;
  const resumen = document.createElement("p");
  resumen.textContent = ficha.resumen;
  const componentes = document.createElement("p");
  const piezas = modeloPorId(id)?.piezas.map((p) => p.nombre) ?? Object.keys(ficha.piezas);
  componentes.textContent = "Componentes: " + piezas.join(", ") + ".";
  const cuando = document.createElement("p");
  cuando.textContent = "Cuándo usarla: " + ficha.cuandoUsarla;
  const riesgo = document.createElement("p");
  riesgo.textContent = "Riesgo principal: " + ficha.riesgo;
  fichaAbiertaEl.replaceChildren(h, resumen, componentes, cuando, riesgo);
  // Abrir la ficha también muestra ese modelo en el visor.
  if (modeloActualId !== id) elegirModelo(id);
}

btnAvisos.addEventListener("click", async () => {
  // El permiso se pide AQUÍ, dentro del clic — no al cargar la página.
  await activarAvisos();
  pintarAvisos();
});

btnDescargar.addEventListener("click", async () => {
  await dbLista;
  await encolarDescargas(db, MODELOS_IDS);
  pintarProgreso(0, MODELOS_IDS.length);
  btnDescargar.disabled = true;
  try {
    let enSegundoPlano = false;
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(ETIQUETA_SYNC);
        enSegundoPlano = true;
        estadoDescargaEl.textContent = "Descarga solicitada: el navegador la completará en cuanto haya conexión.";
      } catch {
        // Tener SyncManager no basta: register() falla (NotAllowedError) si el
        // usuario bloqueó la sincronización en segundo plano para este sitio.
        enSegundoPlano = false;
      }
    }
    if (!enSegundoPlano) {
      // Plan B (Safari, Firefox, o permiso denegado): se descarga desde la página, con la pestaña abierta.
      await descargarPendientes(db, pintarProgreso);
      await refrescarDescargados();
      render();
      if (modeloActualId) refrescarFicha(modeloActualId);
    }
  } catch (err) {
    estadoDescargaEl.textContent = "No se pudo completar la descarga: " + (err instanceof Error ? err.message : String(err));
  } finally {
    btnDescargar.disabled = false;
  }
});

// Mensajes del Service Worker durante el evento sync: la página pinta la barra.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async (event) => {
    const msg = event.data as { tipo?: string; hechos?: number; total?: number } | null;
    if (msg?.tipo === "progreso" && msg.hechos !== undefined && msg.total !== undefined) {
      pintarProgreso(msg.hechos, msg.total);
    } else if (msg?.tipo === "descarga-completa") {
      await refrescarDescargados();
      render();
      if (modeloActualId) refrescarFicha(modeloActualId);
    }
  });
}

// «Atlas 3D instalado»: aquí sí tiene sentido una notificación del sistema,
// porque el usuario acaba de pasar a otra ventana (la app instalada).
window.addEventListener("appinstalled", () => {
  void mostrarAviso("Atlas 3D instalado", "Ya puedes abrir el Atlas desde tu pantalla de inicio.");
});

/** Tras una descarga, vuelve a leer la ficha del modelo actual (sin reconstruir el modelo ni soltar la pieza). */
function refrescarFicha(id: string): void {
  void leerFicha(id).then((f) => {
    if (modeloActualId !== id) return;
    fichaActual = f;
    pintarDetalle();
    pintarPiezaAR();
  });
}

pintarAvisos();
render();
// Sesión 40: el modelo inicial es el de la notificación (?modelo=ID) si existe; si no, el primero del catálogo.
elegirModelo(modeloDestacado && modeloPorId(modeloDestacado) ? modeloDestacado : CATALOGO[0].id);
refrescarDescargados().then(render);
if (modeloDestacado && MODELOS_IDS.includes(modeloDestacado)) {
  tarjetasEl.querySelector(`[data-modelo="${modeloDestacado}"]`)?.scrollIntoView({ block: "center" });
}
