import './style.css'
import { registerSW } from 'virtual:pwa-register';
import { crearVisor } from "./visor";
import { pedirPermisoOrientacion, hayOrientacionReal, iniciarControlOrientacion } from "./sensores";
import type { ControlOrientacion } from "./sensores";
import { iniciarCamaraDeFondo, detenerCamaraDeFondo, describirErrorCamara } from "./camara";

import {
  abrirBaseDeDatos, marcarModeloVisto, alternarFavorito, obtenerFavoritos,
  derivarClaveDesdeContrasena, guardarNotaDeEstudio, descifrarTexto,
} from './db';

const panel = document.createElement('div');
panel.style.cssText = 'padding:12px;font-family:sans-serif';
panel.innerHTML = `
  <h3>Progreso (IndexedDB) — Sesión 33</h3>
  <button id="ver1">Ver modelo-demo-1</button>
  <button id="ver2">Ver modelo-demo-2</button>
  <button id="fav1">★ Favorito modelo-demo-1</button>
  <button id="listar">Listar favoritos</button>
  <button id="nota">Guardar nota cifrada (demo-1)</button>
  <button id="leer">Leer nota (demo-1)</button>
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

abrirBaseDeDatos().then(db => {
  panel.querySelector('#ver1')!.addEventListener('click', async () => mostrar(await marcarModeloVisto(db, 'modelo-demo-1')));
  panel.querySelector('#ver2')!.addEventListener('click', async () => mostrar(await marcarModeloVisto(db, 'modelo-demo-2')));
  panel.querySelector('#fav1')!.addEventListener('click', async () => mostrar({ favorito: await alternarFavorito(db, 'modelo-demo-1') }));
  panel.querySelector('#listar')!.addEventListener('click', async () => mostrar(await obtenerFavoritos(db)));

  panel.querySelector('#nota')!.addEventListener('click', async () => {
    const pass = prompt('Contraseña para cifrar la nota:') || '';
    const texto = prompt('Escribe tu nota de estudio:') || '';
    const clave = await derivarClaveDesdeContrasena(pass, obtenerSal());
    await guardarNotaDeEstudio(db, clave, 'modelo-demo-1', texto);
    mostrar('Nota guardada cifrada. Revísala en Application → IndexedDB.');
  });

  panel.querySelector('#leer')!.addEventListener('click', async () => {
    const pass = prompt('Contraseña:') || '';
    const clave = await derivarClaveDesdeContrasena(pass, obtenerSal());
    const reg = await new Promise<any>(r => {
      db.transaction('progreso').objectStore('progreso').get('modelo-demo-1').onsuccess = e => r((e.target as IDBRequest).result);
    });
    try { mostrar({ nota: await descifrarTexto(clave, reg.notaCifrada, reg.notaIv) }); }
    catch { mostrar('Contraseña incorrecta: no se pudo descifrar.'); }
  });
});

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.log('SW de Workbox registrado:', swUrl, registration);
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