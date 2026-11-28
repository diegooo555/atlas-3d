// modelos/constructor.ts — de datos a mallas (Sesión 40).
// Es el ÚNICO sitio que sabe de Three.js: recibe una DefinicionModelo y devuelve
// la raíz que el visor cuelga de la escena, las mallas que se pueden tocar y dos
// funciones (resaltar y destruir).
import * as THREE from "three";
import { ROLES, COLORES_ENLACE } from "./tipos";
import type { DefinicionModelo, Enlace, Pieza } from "./tipos";

/** Todo modelo cabe en un cubo de este lado, con la base en y = -TAM_NORMALIZADO / 2 (como el cubo de prueba). */
export const TAM_NORMALIZADO = 1.6;

export interface ModeloConstruido {
  /** Raíz ya normalizada: se cuelga de `grupo` en el visor. */
  raiz: THREE.Group;
  /** Altura del centro del modelo ya normalizado (su base está en -0,8). */
  centroY: number;
  /** Mallas de las piezas por id (con `userData.piezaId`): lo que se puede tocar. */
  piezas: Map<string, THREE.Mesh>;
  /** Resalta una pieza y atenúa el resto; null quita el resalte. */
  resaltar(id: string | null): void;
  destruir(): void;
}

interface Flecha {
  enlace: Enlace;
  materiales: THREE.Material[];
}

/** Desde el centro de la pieza, camina en la dirección `dir` (unitaria) hasta tocar su borde. */
function puntoDeBorde(p: Pieza, centro: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 {
  const [w, h, d] = p.tam;
  let t: number;
  if (p.forma === "esfera") {
    t = w / 2;
  } else if (p.forma === "cilindro") {
    const radial = Math.hypot(dir.x, dir.z);
    const tRadial = radial > 1e-6 ? w / 2 / radial : Infinity;
    const tAxial = Math.abs(dir.y) > 1e-6 ? h / 2 / Math.abs(dir.y) : Infinity;
    t = Math.min(tRadial, tAxial);
  } else {
    const k = Math.max(Math.abs(dir.x) / w, Math.abs(dir.y) / h, Math.abs(dir.z) / d);
    t = 0.5 / k;
  }
  return centro.clone().addScaledVector(dir, t);
}

/** Un rótulo: un Sprite (siempre mira a la cámara) con el texto dibujado en un canvas 2D. */
function crearRotulo(texto: string, altura: number, pequeno = false): THREE.Sprite {
  const px = pequeno ? 40 : 56;
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d")!;
  const fuente = `600 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = fuente;
  const ancho = Math.ceil(ctx.measureText(texto).width) + px;
  lienzo.width = ancho;
  lienzo.height = Math.round(px * 1.7);
  ctx.font = fuente; // cambiar el tamaño del canvas borra el contexto
  ctx.fillStyle = "rgba(11, 18, 32, 0.82)";
  const r = lienzo.height / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, lienzo.width, lienzo.height, r);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(texto, lienzo.width / 2, lienzo.height / 2 + 2);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthTest: false }));
  sprite.renderOrder = 10; // siempre encima: el texto debe poder leerse
  sprite.scale.set((lienzo.width / lienzo.height) * altura, altura, 1);
  return sprite;
}

/** Lado mayor del modelo en sus propias unidades (solo piezas: rótulos y flechas no cuentan). */
function ladoMayor(piezas: Pieza[]): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of piezas) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.pos[i] - p.tam[i] / 2);
      max[i] = Math.max(max[i], p.pos[i] + p.tam[i] / 2);
    }
  }
  return Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}

const EJE_Y = new THREE.Vector3(0, 1, 0);

export function construirModelo(def: DefinicionModelo): ModeloConstruido {
  // `solido` (piezas y base) es lo que se mide; `decorado` (rótulos y flechas) no cuenta para el tamaño.
  const interior = new THREE.Group();
  const solido = new THREE.Group();
  const decorado = new THREE.Group();
  interior.add(solido, decorado);
  const piezas = new Map<string, THREE.Mesh>();
  const flechas: Flecha[] = [];
  // Rótulos y flechas crecen con el modelo: ni texto diminuto en uno grande ni gigante en uno chico.
  const k = ladoMayor(def.piezas) / 6;

  // ── Una malla por pieza ──
  for (const p of def.piezas) {
    const [w, h, d] = p.tam;
    const geometria =
      p.forma === "esfera" ? new THREE.SphereGeometry(w / 2, 32, 20) : p.forma === "cilindro" ? new THREE.CylinderGeometry(w / 2, w / 2, h, 36) : new THREE.BoxGeometry(w, h, d);
    const color = ROLES[p.rol].color;
    // transparent desde el principio: el resaltado baja la opacidad sin recompilar el material.
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, transparent: true, emissive: color, emissiveIntensity: 0 });
    const malla = new THREE.Mesh(geometria, material);
    malla.position.set(...p.pos);
    malla.userData.piezaId = p.id;
    if (p.forma === "caja") {
      const aristas = new THREE.LineSegments(new THREE.EdgesGeometry(geometria), new THREE.LineBasicMaterial({ color: 0x0b1220 }));
      malla.add(aristas);
    }
    solido.add(malla);
    piezas.set(p.id, malla);

    const rotulo = crearRotulo(p.nombre, 0.4 * k);
    if (p.rotulo === "frente") rotulo.position.set(p.pos[0], p.pos[1], p.pos[2] + d / 2 + 0.05);
    else if (p.rotulo === "abajo") rotulo.position.set(p.pos[0], p.pos[1] - h / 2 - 0.45 * k, p.pos[2]);
    else rotulo.position.set(p.pos[0], p.pos[1] + h / 2 + 0.45 * k, p.pos[2]);
    decorado.add(rotulo);
  }

  // ── La base: una placa oscura bajo todo el modelo (en AR, lo que descansa sobre la mesa) ──
  const cajaPiezas = new THREE.Box3().setFromObject(solido);
  const tamPiezas = cajaPiezas.getSize(new THREE.Vector3());
  const centroPiezas = cajaPiezas.getCenter(new THREE.Vector3());
  const grosor = 0.2 * k;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(tamPiezas.x + 1.2 * k, grosor, tamPiezas.z + 1.2 * k),
    new THREE.MeshStandardMaterial({ color: 0x1b2540, roughness: 0.8 })
  );
  base.position.set(centroPiezas.x, cajaPiezas.min.y - 0.15 * k - grosor / 2, centroPiezas.z);
  solido.add(base);

  // ── Flechas: un cilindro (cuerpo) y un cono (punta), de borde a borde ──
  const porId = new Map(def.piezas.map((p) => [p.id, p]));
  const radio = 0.05 * k;
  const largoPunta = 0.4 * k;
  for (const enlace of def.enlaces) {
    const de = porId.get(enlace.de);
    const a = porId.get(enlace.a);
    if (!de || !a) continue; // un enlace a una pieza inexistente se ignora (error de datos)
    const desvio = new THREE.Vector3(...(enlace.desvio ?? [0, 0, 0]));
    const cDe = new THREE.Vector3(...de.pos).add(desvio);
    const cA = new THREE.Vector3(...a.pos).add(desvio);
    const dir = cA.clone().sub(cDe).normalize();
    const inicio = puntoDeBorde(de, cDe, dir).addScaledVector(dir, 0.08 * k);
    const fin = puntoDeBorde(a, cA, dir.clone().negate()).addScaledVector(dir, -0.08 * k);
    const largo = inicio.distanceTo(fin);
    if (largo <= largoPunta) continue; // piezas casi pegadas: no cabe una flecha

    const material = new THREE.MeshBasicMaterial({ color: COLORES_ENLACE[enlace.tipo], transparent: true });
    const orientacion = new THREE.Quaternion().setFromUnitVectors(EJE_Y, dir);
    const largoCuerpo = largo - largoPunta;
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, largoCuerpo, 12), material);
    cuerpo.quaternion.copy(orientacion);
    cuerpo.position.copy(inicio).addScaledVector(dir, largoCuerpo / 2);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(radio * 3, largoPunta, 16), material);
    punta.quaternion.copy(orientacion);
    punta.position.copy(fin).addScaledVector(dir, -largoPunta / 2);
    decorado.add(cuerpo, punta);
    const materiales: THREE.Material[] = [material];
    if (enlace.etiqueta) {
      const rotulo = crearRotulo(enlace.etiqueta, 0.3 * k, true);
      rotulo.position.copy(inicio).lerp(fin, 0.5).add(new THREE.Vector3(0, 0.3 * k, 0));
      decorado.add(rotulo);
      materiales.push(rotulo.material);
    }
    flechas.push({ enlace, materiales });
  }

  // Normalizar: caber en TAM_NORMALIZADO, centrado en x/z y con la base en y = -TAM/2.
  const medida = new THREE.Box3().setFromObject(solido);
  const tamano = medida.getSize(new THREE.Vector3());
  const centro = medida.getCenter(new THREE.Vector3());
  const escala = TAM_NORMALIZADO / Math.max(tamano.x, tamano.y, tamano.z);
  interior.scale.setScalar(escala);
  interior.position.set(-centro.x * escala, -TAM_NORMALIZADO / 2 - medida.min.y * escala, -centro.z * escala);
  const raiz = new THREE.Group();
  raiz.add(interior);
  // Se calcula aquí, donde se conocen las medidas (una Box3 sobre el objeto ya escalado mide en el mundo y sale descentrada).
  const centroY = -TAM_NORMALIZADO / 2 + (tamano.y * escala) / 2;

  function resaltar(id: string | null) {
    for (const [pid, malla] of piezas) {
      const m = malla.material as THREE.MeshStandardMaterial;
      const activa = id === null || pid === id;
      m.opacity = activa ? 1 : 0.28;
      m.depthWrite = activa;
      m.emissiveIntensity = id !== null && pid === id ? 0.55 : 0;
    }
    for (const f of flechas) {
      const toca = id === null || f.enlace.de === id || f.enlace.a === id;
      for (const m of f.materiales) m.opacity = toca ? 1 : 0.15;
    }
  }

  function destruir() {
    // Geometrías, materiales y texturas de los rótulos viven en la GPU: hay que soltarlos a mano.
    const materiales = new Set<THREE.Material>();
    raiz.traverse((o) => {
      // Los Sprites comparten una geometría interna de Three.js: esa no se suelta.
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
      const mat = (o as THREE.Mesh).material;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => materiales.add(m));
    });
    for (const m of materiales) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
    piezas.clear();
  }

  return { raiz, centroY, piezas, resaltar, destruir };
}
