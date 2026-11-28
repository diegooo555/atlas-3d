// visor.ts — escena de Three.js del Atlas 3D (Sesión 35).
// Sesión 40: el cubo de prueba se va. El visor muestra un modelo de arquitectura
// (src/modelos/) ya normalizado a 1,6 con la base en -0,8, así que toda la lógica
// de AR de las sesiones 38 y 39 sigue valiendo sin cambios.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { capacidadesDe } from "./xr";
import type { CapacidadesAR } from "./xr";
import { crearGestos } from "./gestos";
import { construirModelo } from "./modelos/constructor";
import type { ModeloConstruido } from "./modelos/constructor";
import type { DefinicionModelo } from "./modelos/tipos";
import { anotar, PASO_FINAL } from "./rastro";

// ── Sesión 39: estado de la colocación en AR ─────────────────────────────────

/** En qué punto está la colocación del objeto. */
export type FaseAR = "buscando" | "listo" | "colocado";

export interface EstadoAR extends CapacidadesAR {
    fase: FaseAR;
    /** true si el objeto está anclado: el sistema sigue corrigiendo su posición. */
    anclado: boolean;
    escala: number; // 1 = el tamaño del modelo (1,6 m); empieza en 0,25
    giroGrados: number;
    /** Centro del objeto en el espacio «local» (metros): x derecha, y arriba, -z adelante. */
    posicion: { x: number; y: number; z: number };
    /** Diagnóstico: cuántas veces se preguntó al hit-test y cuántas respondió con una superficie. */
    consultas: number;
    resultados: number; // consultas en que el sistema devolvió algo
    impactos: number; // consultas con una pose utilizable
    /** true si pasaron varios segundos sin superficie: el toque ya coloca delante de la mirada. */
    sinSuperficie: boolean;
}

export interface OpcionesAR {
    overlay: HTMLElement;
    alCambiar: (estado: EstadoAR) => void;
    alTerminar: () => void;
}

const ESCALA_INICIAL = 0.25; // el modelo de 1,6 m queda en 40 cm
const ESCALA_MIN = 0.1;
const ESCALA_MAX = 1;
const CADA_CUANTOS_FOTOGRAMAS = 2; // el hit-test se consulta un fotograma de cada dos: basta para una retícula fluida
const MS_HASTA_PLAN_B = 6000; // sin superficie tanto tiempo: se avisa y el toque coloca delante de la mirada
const CONSULTAS_SIN_IMPACTO = 8; // consultas seguidas sin superficie antes de ocultar la retícula (evita parpadeos)
const MITAD = 0.8; // medio modelo normalizado: para que apoye la base (y no el centro) en la superficie
const ESCALA_VISTA = 1; // tamaño del modelo en la vista normal
const DISTANCIA_VISTA = 2.4; // distancia de la cámara de la vista normal (cada modelo la ajusta con `distancia`)
const MS_ESPERA_SALIDA = 250; // tras salir de AR, espera antes del primer fotograma normal
const TOQUE_MAX_PX = 8; // un dedo que se mueve más que esto está girando la vista, no tocando
const TOQUE_MAX_MS = 600; // una pulsación más larga que esto no es un toque

export interface Visor {
    /** Fija la rotación objetivo del modelo (radianes). El visor la alcanza suavemente. */
    rotarHacia(rotX: number, rotY: number): void;
    /** true: los sensores mandan (se apaga el ratón/táctil). false: control manual. */
    controlPorSensores(activo: boolean): void;
    /** Rotación actual del modelo, en grados (para mostrarla en pantalla). */
    rotacionActualGrados(): { x: number; y: number };
    /** Sesión 40: cambia el modelo que se muestra (y suelta la pieza elegida). */
    mostrarModelo(def: DefinicionModelo): void;
    /** Sesión 40: resalta una pieza (null: ninguna). No avisa a alTocarPieza. */
    seleccionar(id: string | null): void;
    /** Sesión 40: avisa cuando el usuario elige (o suelta) una pieza tocando el modelo. */
    alTocarPieza(cb: (id: string | null) => void): void;
    /** true: sin color de fondo (se ve el video detrás). false: fondo azul oscuro. */
    fondoTransparente(activo: boolean): void;
    /**
     * Sesiones 38 y 39: conecta el visor a una sesión WebXR immersive-ar ya concedida.
     * Busca superficies (hit-test), coloca el modelo con un toque, lo ancla y activa los gestos.
     * Devuelve las capacidades que de verdad funcionan en esta sesión.
     * opciones.alTerminar se llama cuando la sesión termina (botón «Salir», sistema o error),
     * después de devolver el visor a su estado anterior.
     */
    entrarEnAR(sesion: XRSession, opciones: OpcionesAR): Promise<CapacidadesAR>;
    destruir(): void;
}

export function crearVisor(contenedor: HTMLElement): Visor {
    const escena = new THREE.Scene();
    const COLOR_FONDO = new THREE.Color(0x0b1220);
    escena.background = COLOR_FONDO;

    const camara = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camara.position.set(0, 0, DISTANCIA_VISTA);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    contenedor.append(renderer.domElement);

    escena.add(new THREE.AmbientLight(0xffffff, 0.6));
    const luz = new THREE.DirectionalLight(0xffffff, 1.2);
    luz.position.set(3, 4, 5);
    escena.add(luz);

    // Dos niveles: `raiz` sigue a la superficie o al ancla (lo manda el sistema);
    // `grupo` es el objeto con lo que decide el usuario (mover, girar, escalar).
    const raiz = new THREE.Group();
    const grupo = new THREE.Group();
    grupo.scale.setScalar(ESCALA_VISTA);
    raiz.add(grupo);
    escena.add(raiz);

    const controles = new OrbitControls(camara, renderer.domElement);
    controles.enableDamping = true;

    let objetivoX = 0;
    let objetivoY = 0;
    let porSensores = false;

    function ajustarTamano() {
        // Durante la sesión XR el tamaño del canvas lo decide el visor XR, no la página.
        if (renderer.xr.isPresenting) return;
        const ancho = contenedor.clientWidth || 320;
        const alto = Math.round(ancho * 0.6);
        renderer.setSize(ancho, alto);
        camara.aspect = ancho / alto;
        camara.updateProjectionMatrix();
    }
    ajustarTamano();
    window.addEventListener("resize", ajustarTamano);

    let animacion = 0;
    function bucle() {
        animacion = requestAnimationFrame(bucle);
        if (porSensores) {
            // Interpolación: alcanza el objetivo poco a poco (filtra el temblor del sensor).
            grupo.rotation.x += (objetivoX - grupo.rotation.x) * 0.15;
            grupo.rotation.y += (objetivoY - grupo.rotation.y) * 0.15;
        }
        controles.update();
        renderer.render(escena, camara);
    }
    bucle();

    // ── Sesión 38: realidad aumentada con WebXR ──────────────────────────────
    const aGrados = (r: number) => Math.round((r * 180) / Math.PI);
    let sesionAR: XRSession | null = null;

    // ── Sesión 40: el modelo que se muestra y la pieza elegida ──────────────
    let modelo: ModeloConstruido | null = null;
    let centroY = 0; // altura del centro del modelo normalizado
    let piezaElegida: string | null = null;

    function mostrarModelo(def: DefinicionModelo) {
        if (modelo) {
            grupo.remove(modelo.raiz);
            modelo.destruir();
        }
        modelo = construirModelo(def);
        grupo.add(modelo.raiz);
        centroY = modelo.centroY;
        piezaElegida = null;
        if (!sesionAR) {
            modelo.raiz.position.y = -centroY; // en la vista normal el modelo gira alrededor de su centro; en AR, apoyado por la base
            grupo.rotation.set(0, 0, 0);
            const elev = ((def.elevacion ?? 30) * Math.PI) / 180;
            const dist = DISTANCIA_VISTA * (def.distancia ?? 1);
            camara.position.set(0, dist * Math.sin(elev), dist * Math.cos(elev));
            controles.target.set(0, 0, 0);
            controles.update();
        }
    }

    function seleccionar(id: string | null) {
        if (!modelo) return;
        piezaElegida = id !== null && modelo.piezas.has(id) ? id : null;
        modelo.resaltar(piezaElegida);
    }

    // ── Sesión 40: elegir una pieza tocándola (solo fuera de AR) ──
    const rayoToque = new THREE.Raycaster();
    let avisarToque: ((id: string | null) => void) | null = null;
    let inicioToque: { x: number; y: number; t: number } | null = null;
    const lienzo = renderer.domElement;
    const alPulsar = (ev: PointerEvent) => {
        inicioToque = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    };
    const alSoltar = (ev: PointerEvent) => {
        const ini = inicioToque;
        inicioToque = null;
        // Un arrastre (girar la vista) no es un toque: se mide cuánto se movió el dedo.
        if (!ini || sesionAR || !modelo) return;
        if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > TOQUE_MAX_PX || performance.now() - ini.t > TOQUE_MAX_MS) return;
        const caja = lienzo.getBoundingClientRect();
        rayoToque.setFromCamera(new THREE.Vector2(((ev.clientX - caja.left) / caja.width) * 2 - 1, -((ev.clientY - caja.top) / caja.height) * 2 + 1), camara);
        const impactos = rayoToque.intersectObjects([...modelo.piezas.values()], false);
        const id = (impactos[0]?.object.userData.piezaId as string | undefined) ?? null;
        seleccionar(id === piezaElegida ? null : id); // volver a tocar la misma pieza la suelta
        avisarToque?.(piezaElegida);
    };
    lienzo.addEventListener("pointerdown", alPulsar);
    lienzo.addEventListener("pointerup", alSoltar);

    async function entrarEnAR(sesion: XRSession, opciones: OpcionesAR): Promise<CapacidadesAR> {
        cancelAnimationFrame(animacion); // en AR NO manda requestAnimationFrame: manda el reloj del visor XR
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType("local");
        try {
            await renderer.xr.setSession(sesion);
        } catch (err) {
            // Si el visor XR no pudo tomar la sesión, el visor normal vuelve a andar.
            renderer.xr.enabled = false;
            bucle();
            throw err;
        }
        sesionAR = sesion;
        const caps = capacidadesDe(sesion);

        const fondoPrevio = escena.background;
        escena.background = null; // la cámara real es el fondo: no se pinta nada detrás
        controles.enabled = false;

        // ── Estado de la colocación ──
        let fase: FaseAR = caps.hitTest ? "buscando" : "colocado";
        let ancla: XRAnchor | null = null;
        let escala = ESCALA_INICIAL;
        let consultas = 0;
        let resultados = 0;
        let impactosVistos = 0;
        let sinSuperficie = false;
        let ultimaPose = performance.now(); // cuándo fue la última vez que el hit-test encontró algo
        let ultimoImpacto: XRRigidTransform | null = null; // pose de la superficie bajo el centro de la pantalla
        let cuadro = 0; // fotogramas XR: el hit-test se consulta uno de cada CADA_CUANTOS_FOTOGRAMAS
        let sinImpacto = 0; // consultas seguidas sin superficie

        const estado = (): EstadoAR => {
            raiz.updateMatrixWorld(true);
            const p = grupo.getWorldPosition(new THREE.Vector3());
            return {
                ...caps,
                fase,
                anclado: ancla !== null,
                escala,
                giroGrados: ((aGrados(grupo.rotation.y) % 360) + 360) % 360,
                posicion: { x: p.x, y: p.y, z: p.z },
                consultas,
                resultados,
                impactos: impactosVistos,
                sinSuperficie,
            };
        };
        const avisar = () => opciones.alCambiar(estado());

        // `raiz` deja de calcular su matriz sola: se la damos nosotros desde la superficie o el ancla.
        raiz.matrixAutoUpdate = false;
        if (modelo) modelo.raiz.position.y = 0; // en AR el modelo se apoya por la base (en -0,8), como el cubo
        grupo.position.set(0, MITAD * escala, 0); // la base apoya en la superficie
        grupo.scale.setScalar(escala);
        grupo.rotation.set(0, 0, 0);
        if (caps.hitTest) {
            raiz.visible = false; // hasta colocarlo, solo se ve la retícula
        } else {
            // Plan B sin hit-test: el modelo a 1,5 m delante, un poco por debajo de la vista.
            raiz.matrix.makeTranslation(0, -0.5, -1.5);
            raiz.visible = true;
        }

        // ── Hit-test: un rayo desde el centro de la pantalla («viewer») ──
        let fuente: XRHitTestSource | null = null;
        if (caps.hitTest) {
            try {
                const espacioViewer = await sesion.requestReferenceSpace("viewer");
                try {
                    // «plane» exige que el sistema haya reconocido un plano (tarda y falla en superficies lisas);
                    // «point» acepta también puntos de característica sueltos: el anillo sale casi de inmediato.
                    fuente = (await sesion.requestHitTestSource?.({ space: espacioViewer, entityTypes: ["plane", "point"] })) ?? null;
                } catch {
                    fuente = (await sesion.requestHitTestSource?.({ space: espacioViewer })) ?? null; // el navegador no admite «point»
                }
            } catch {
                fuente = null;
            }
            if (!fuente) {
                caps.hitTest = false; // lo concedió pero no funciona: plan B
                fase = "colocado";
                raiz.visible = true;
                raiz.matrix.makeTranslation(0, -0.5, -1.5);
            }
        }

        // Retícula: un anillo verde que se pega a la superficie que el hit-test encuentra.
        const reticula = new THREE.Mesh(
            new THREE.RingGeometry(0.1, 0.13, 40).rotateX(-Math.PI / 2), // acostado: su cara mira hacia arriba
            new THREE.MeshBasicMaterial({ color: 0x4ade80 })
        );
        reticula.matrixAutoUpdate = false; // su matriz viene entera del hit-test
        reticula.visible = false;
        escena.add(reticula);

        // ── Colocar con un toque ──
        let turno = 0; // numera los toques: si llegan dos seguidos, solo vale el último
        async function colocar(frame: XRFrame) {
            const referencia = renderer.xr.getReferenceSpace();
            if (!referencia) return;
            const mio = ++turno;
            let impacto: XRRigidTransform | null = null;
            const hayImpacto = fuente !== null && reticula.visible && ultimoImpacto !== null;
            if (fuente && !hayImpacto && !sinSuperficie) return; // no hay superficie: no se coloca en el aire (todavía)
            if (hayImpacto) {
                impacto = ultimoImpacto;
                raiz.matrix.copy(reticula.matrix); // el modelo aparece donde está la retícula
            } else {
                // Plan B (sin hit-test, o sin superficie tras varios segundos): delante de la mirada actual, a 1,5 m.
                const posicion = new THREE.Vector3().setFromMatrixPosition(camara.matrixWorld);
                const delante = camara.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
                posicion.addScaledVector(delante, 1.5);
                posicion.y -= 0.5;
                raiz.matrix.makeTranslation(posicion.x, posicion.y, posicion.z);
            }
            grupo.position.set(0, MITAD * escala, 0); // vuelve al centro de la nueva posición
            raiz.visible = true;
            fase = "colocado";
            // ── Ancla: el sistema recuerda ESE punto del mundo real y lo sigue corrigiendo ──
            ancla?.delete(); // al volver a colocar, la ancla anterior ya no sirve
            ancla = null;
            avisar();
            if (impacto && caps.anclas) {
                try {
                    const nueva = await frame.createAnchor!(impacto, referencia);
                    if (mio !== turno || !sesionAR) nueva.delete(); // llegó tarde: otro toque o la sesión ya terminó
                    else ancla = nueva;
                } catch {
                    ancla = null; // el navegador rechazó anclar: el objeto queda fijo en el espacio «local»
                }
                avisar();
            }
        }

        // ── Gestos: mover, girar y escalar ──
        const rayo = new THREE.Raycaster();
        const plano = new THREE.Plane();
        const desfase = new THREE.Vector2();
        const tmp = new THREE.Vector3();
        function mover(clientX: number, clientY: number, primero: boolean) {
            if (fase !== "colocado") return;
            // Pantalla → rayo → punto donde ese rayo corta el plano de la superficie.
            rayo.setFromCamera(new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1), camara);
            raiz.updateMatrixWorld(true);
            const normal = new THREE.Vector3(0, 1, 0).transformDirection(raiz.matrixWorld);
            plano.setFromNormalAndCoplanarPoint(normal, tmp.setFromMatrixPosition(raiz.matrixWorld));
            const punto = rayo.ray.intersectPlane(plano, new THREE.Vector3());
            if (!punto) return; // el rayo no baja hasta el plano (miras al cielo)
            const local = raiz.worldToLocal(punto);
            // En el primer movimiento se recuerda a cuánto del centro del objeto tocó el dedo, para que no salte.
            if (primero) desfase.set(grupo.position.x - local.x, grupo.position.z - local.z);
            grupo.position.x = local.x + desfase.x;
            grupo.position.z = local.z + desfase.y;
            avisar();
        }
        const gestos = crearGestos(opciones.overlay, {
            alMover: mover,
            alGirar(rad) {
                if (fase !== "colocado") return;
                grupo.rotation.y += rad;
                avisar();
            },
            alEscalar(factor) {
                if (fase !== "colocado") return;
                escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala * factor));
                grupo.scale.setScalar(escala);
                grupo.position.y = MITAD * escala; // la base sigue apoyada
                avisar();
            },
        });

        sesion.addEventListener("select", (ev) => {
            if (gestos.huboGesto()) return; // un arrastre no cuenta como «tocar para colocar»
            void colocar((ev as XRInputSourceEvent).frame);
        });

        // ── El bucle XR: retícula y ancla, fotograma a fotograma ──
        renderer.setAnimationLoop((_t, frame) => {
            const referencia = renderer.xr.getReferenceSpace();
            if (frame && referencia) {
                if (fuente && cuadro++ % CADA_CUANTOS_FOTOGRAMAS === 0) {
                    const impactos = frame.getHitTestResults(fuente);
                    const pose = impactos.length ? impactos[0].getPose(referencia) : null;
                    consultas++;
                    if (impactos.length) resultados++;
                    if (pose) impactosVistos++;
                    if (consultas % 30 === 0) avisar(); // refresca el diagnóstico (el overlay lo limita a 5 veces por segundo)
                    if (pose) {
                        sinImpacto = 0;
                        sinSuperficie = false;
                        ultimaPose = performance.now();
                        reticula.visible = true;
                        reticula.matrix.fromArray(pose.transform.matrix);
                        ultimoImpacto = pose.transform;
                        if (fase === "buscando") {
                            fase = "listo";
                            avisar();
                        }
                    } else if (++sinImpacto >= CONSULTAS_SIN_IMPACTO) {
                        // Una superficie que aparece y desaparece cada fotograma haría parpadear el texto del overlay.
                        reticula.visible = false;
                        ultimoImpacto = null;
                        if (fase === "listo") {
                            fase = "buscando";
                            avisar();
                        }
                    }
                    if (!pose && fase === "buscando" && !sinSuperficie && performance.now() - ultimaPose > MS_HASTA_PLAN_B) {
                        sinSuperficie = true; // el texto de ayuda cambia y el toque ya coloca
                        avisar();
                    }
                }
                // Con ancla, la posición de `raiz` la corrige el sistema fotograma a fotograma.
                if (ancla && frame.trackedAnchors?.has(ancla)) {
                    const poseAncla = frame.getPose(ancla.anchorSpace, referencia);
                    if (poseAncla) raiz.matrix.fromArray(poseAncla.transform.matrix);
                }
            }
            renderer.render(escena, camara);
        });

        anotar("activa");
        sesion.addEventListener(
            "end",
            () => {
                // Cada paso se anota ANTES de hacerlo: si la pestaña muere, el último nombre dice dónde.
                anotar("fin-1-bucle");
                renderer.setAnimationLoop(null);
                renderer.xr.enabled = false;
                sesionAR = null;
                gestos.destruir();
                anotar("fin-2-fuente");
                try { fuente?.cancel(); } catch { /* la sesión ya terminó */ }
                anotar("fin-3-ancla");
                try { ancla?.delete(); } catch { /* idem */ }
                anotar("fin-4-escena");
                escena.remove(reticula);
                reticula.geometry.dispose();
                (reticula.material as THREE.Material).dispose();
                escena.background = fondoPrevio;
                controles.enabled = !porSensores;
                raiz.matrixAutoUpdate = true;
                raiz.matrix.identity();
                raiz.visible = true;
                grupo.position.set(0, 0, 0);
                grupo.scale.setScalar(ESCALA_VISTA);
                if (modelo) modelo.raiz.position.y = -centroY;
                grupo.rotation.set(0, 0, 0);
                opciones.alTerminar();
                // El primer fotograma normal NO se dibuja en el mismo instante en que el navegador desmonta
                // la cámara y el visor XR: se espera un momento para que termine de soltar sus recursos.
                anotar("fin-5-espera");
                window.setTimeout(() => {
                    if (sesionAR) return; // ya empezó otra sesión AR: el bucle lo lleva ella
                    anotar("fin-6-tamano");
                    ajustarTamano(); // el visor XR cambió el tamaño del canvas
                    anotar("fin-7-bucle");
                    bucle(); // vuelve el requestAnimationFrame normal
                    anotar(PASO_FINAL);
                }, MS_ESPERA_SALIDA);
            },
            { once: true }
        );

        avisar();
        return caps;
    }

    return {
        rotarHacia(x, y) {
            objetivoX = x;
            objetivoY = y;
        },
        controlPorSensores(activo) {
            porSensores = activo;
            controles.enabled = !activo;
            if (!activo) grupo.rotation.set(0, 0, 0);
        },
        rotacionActualGrados() {
            return { x: aGrados(grupo.rotation.x), y: aGrados(grupo.rotation.y) };
        },
        fondoTransparente(activo) {
            escena.background = activo ? null : COLOR_FONDO;
        },
        mostrarModelo,
        seleccionar,
        alTocarPieza(cb) {
            avisarToque = cb;
        },
        entrarEnAR,
        destruir() {
            void sesionAR?.end();
            cancelAnimationFrame(animacion);
            window.removeEventListener("resize", ajustarTamano);
            lienzo.removeEventListener("pointerdown", alPulsar);
            lienzo.removeEventListener("pointerup", alSoltar);
            modelo?.destruir();
            controles.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}