// ===== IndexedDB del Atlas 3D — Sesión 33 =====
export interface RegistroProgreso {
    modeloId: string;
    favorito: boolean;
    ultimaVisita: number | null;
    notaCifrada: ArrayBuffer | null;
    notaIv: Uint8Array | null;
}

export function abrirBaseDeDatos(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        // Sesión 37: versión 2, con el almacén nuevo «descargas».
        const peticion = indexedDB.open('atlas3d-progreso-db', 2);
        peticion.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            // Migración por tramos (Sesión 22/26): quien viene de la v1 conserva su
            // progreso y solo recibe lo nuevo.
            if (event.oldVersion < 1) {
                const store = db.createObjectStore('progreso', { keyPath: 'modeloId' });
                store.createIndex('porFavorito', 'favorito', { unique: false });
                store.createIndex('porUltimaVisita', 'ultimaVisita', { unique: false });
            }
            if (event.oldVersion < 2) {
                db.createObjectStore('descargas', { keyPath: 'modeloId' });
            }
        };
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
    });
}

function registroVacio(modeloId: string): RegistroProgreso {
    return { modeloId, favorito: false, ultimaVisita: null, notaCifrada: null, notaIv: null };
}

export function marcarModeloVisto(db: IDBDatabase, modeloId: string): Promise<RegistroProgreso> {
    return new Promise((resolve, reject) => {
        const store = db.transaction('progreso', 'readwrite').objectStore('progreso');
        const peticion = store.get(modeloId);
        peticion.onsuccess = () => {
            const registro: RegistroProgreso = peticion.result || registroVacio(modeloId);
            registro.ultimaVisita = Date.now();
            const escritura = store.put(registro); // put(): crea o actualiza
            escritura.onsuccess = () => resolve(registro);
            escritura.onerror = () => reject(escritura.error);
        };
        peticion.onerror = () => reject(peticion.error);
    });
}

export function alternarFavorito(db: IDBDatabase, modeloId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const store = db.transaction('progreso', 'readwrite').objectStore('progreso');
        const peticion = store.get(modeloId);
        peticion.onsuccess = () => {
            const registro: RegistroProgreso = peticion.result || registroVacio(modeloId);
            registro.favorito = !registro.favorito;
            const escritura = store.put(registro);
            escritura.onsuccess = () => resolve(registro.favorito);
            escritura.onerror = () => reject(escritura.error);
        };
        peticion.onerror = () => reject(peticion.error);
    });
}

export function obtenerFavoritos(db: IDBDatabase): Promise<RegistroProgreso[]> {
    return new Promise((resolve) => {
        const resultado: RegistroProgreso[] = [];
        const store = db.transaction('progreso', 'readonly').objectStore('progreso');
        // IndexedDB no acepta booleanos como clave de índice, así que se recorre y se filtra
        store.openCursor().onsuccess = (event) => {
            const c = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (c) { if (c.value.favorito) resultado.push(c.value); c.continue(); }
            else resolve(resultado);
        };
    });
}

// ===== Cifrado (funciones de la Sesión 22, sin cambios de fondo) =====
export async function derivarClaveDesdeContrasena(contrasena: string, sal: Uint8Array): Promise<CryptoKey> {
    const materialBase = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: sal as BufferSource, iterations: 100000, hash: 'SHA-256' },
        materialBase,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function cifrarTexto(clave: CryptoKey, texto: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, new TextEncoder().encode(texto));
    return { cifrado, iv };
}

export async function descifrarTexto(clave: CryptoKey, cifrado: ArrayBuffer, iv: Uint8Array): Promise<string> {
    const datos = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, clave, cifrado);
    return new TextDecoder().decode(datos);
}

export async function guardarNotaDeEstudio(db: IDBDatabase, clave: CryptoKey, modeloId: string, texto: string): Promise<void> {
    const { cifrado, iv } = await cifrarTexto(clave, texto); // se cifra ANTES de abrir la transacción
    const store = db.transaction('progreso', 'readwrite').objectStore('progreso');
    const registro: RegistroProgreso =
        (await new Promise<RegistroProgreso | undefined>(r => { store.get(modeloId).onsuccess = e => r((e.target as IDBRequest).result); }))
        || registroVacio(modeloId);
    registro.notaCifrada = cifrado;
    registro.notaIv = iv;
    return new Promise((resolve, reject) => {
        const escritura = store.put(registro);
        escritura.onsuccess = () => resolve();
        escritura.onerror = () => reject(escritura.error);
    });
}

// ===== Cola de descargas de fichas — Sesión 37 =====
export interface Descarga {
    modeloId: string;
    estado: 'pendiente' | 'listo';
}

/** Anota (o reinicia a «pendiente») la descarga de varios modelos. */
export function encolarDescargas(db: IDBDatabase, ids: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('descargas', 'readwrite');
        const store = tx.objectStore('descargas');
        ids.forEach((modeloId) => store.put({ modeloId, estado: 'pendiente' } satisfies Descarga));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export function obtenerDescargas(db: IDBDatabase): Promise<Descarga[]> {
    return new Promise((resolve, reject) => {
        const peticion = db.transaction('descargas', 'readonly').objectStore('descargas').getAll();
        peticion.onsuccess = () => resolve(peticion.result as Descarga[]);
        peticion.onerror = () => reject(peticion.error);
    });
}

export function marcarDescargaLista(db: IDBDatabase, modeloId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('descargas', 'readwrite');
        tx.objectStore('descargas').put({ modeloId, estado: 'listo' } satisfies Descarga);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
