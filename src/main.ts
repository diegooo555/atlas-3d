import './style.css'
import heroImg from './assets/hero.png'
import typescriptLogo from './assets/typescript.svg'
import viteLogo from './assets/vite.svg'
import { setupCounter } from './counter.ts'

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

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<section id="center">
  <div class="hero">
    <img src="${heroImg}" class="base" width="170" height="179">
    <img src="${typescriptLogo}" class="framework" alt="TypeScript logo"/>
    <img src="${viteLogo}" class="vite" alt="Vite logo" />
  </div>
  <div>
    <h1>Get started</h1>
    <p>Edit <code>src/main.ts</code> and save to test <code>HMR</code></p>
  </div>
  <button id="counter" type="button" class="counter"></button>
</section>

<div class="ticks"></div>

<section id="next-steps">
  <div id="docs">
    <svg class="icon" role="presentation" aria-hidden="true"><use href="/icons.svg#documentation-icon"></use></svg>
    <h2>Documentation</h2>
    <p>Your questions, answered</p>
    <ul>
      <li>
        <a href="https://vite.dev/" target="_blank">
          <img class="logo" src="${viteLogo}" alt="" />
          Explore Vite
        </a>
      </li>
      <li>
        <a href="https://www.typescriptlang.org" target="_blank">
          <img class="button-icon" src="${typescriptLogo}" alt="">
          Learn more
        </a>
      </li>
    </ul>
  </div>
  <div id="social">
    <svg class="icon" role="presentation" aria-hidden="true"><use href="/icons.svg#social-icon"></use></svg>
    <h2>Connect with us</h2>
    <p>Join the Vite community</p>
    <ul>
      <li><a href="https://github.com/vitejs/vite" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="/icons.svg#github-icon"></use></svg>GitHub</a></li>
      <li><a href="https://chat.vite.dev/" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="/icons.svg#discord-icon"></use></svg>Discord</a></li>
      <li><a href="https://x.com/vite_js" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="/icons.svg#x-icon"></use></svg>X.com</a></li>
      <li><a href="https://bsky.app/profile/vite.dev" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="/icons.svg#bluesky-icon"></use></svg>Bluesky</a></li>
    </ul>
  </div>
</section>

<div class="ticks"></div>
<section id="spacer"></section>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

// Registro del Service Worker — Sesión 28.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => console.log("SW registrado:", reg.scope))
    .catch((err) => console.error("Error al registrar SW:", err));
}