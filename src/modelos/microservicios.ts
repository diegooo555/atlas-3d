// modelos/microservicios.ts — microservicios con API Gateway y bus de mensajes, como datos (Sesión 40).
// La idea que el dibujo debe transmitir: una base de datos POR servicio (no hay un cilindro compartido)
// y un bus que desacopla: Pedidos publica, el bus entrega a Pagos, y Pedidos no conoce a Pagos.
// Sesión 41: en un teléfono real «publica» pisaba a «Bus de mensajes» y «Cliente» quedaba cortado abajo.
// El bus pasa su rótulo arriba (deja libre la franja de las flechas) y el Cliente al frente, un poco más cerca,
// con la cámara algo más lejos. Mejora, no resuelve: con rótulos que miran a la cámara, algún ángulo chocará.
import type { DefinicionModelo } from "./tipos";

export const MICROSERVICIOS: DefinicionModelo = {
  id: "microservicios",
  nombre: "Microservicios",
  resumen: "Servicios pequeños e independientes, cada uno con sus datos, detrás de una sola puerta de entrada.",
  elevacion: 40,
  distancia: 1.15,
  piezas: [
    { id: "cliente", nombre: "Cliente", rol: "actor", forma: "esfera", pos: [0, 0, 4.8], tam: [1.1, 1.1, 1.1], rotulo: "frente", resumen: "La aplicación web o móvil que hace las peticiones." },
    { id: "gateway", nombre: "API Gateway", rol: "coordinacion", forma: "caja", pos: [0, 0, 2.6], tam: [12, 0.7, 1.1], rotulo: "frente", resumen: "Puerta de entrada única: recibe la petición y la reparte al servicio que corresponde." },
    { id: "usuarios", nombre: "Usuarios", rol: "logica", forma: "caja", pos: [-5.2, 0, -0.6], tam: [2.4, 1, 1.4], rotulo: "frente", resumen: "Cuentas, perfiles y permisos. Un servicio pequeño con una sola responsabilidad." },
    { id: "pedidos", nombre: "Pedidos", rol: "logica", forma: "caja", pos: [-1.7, 0, -0.6], tam: [2.4, 1, 1.4], rotulo: "frente", resumen: "Crea y sigue los pedidos. Avisa de lo que pasa publicando eventos." },
    { id: "bus", nombre: "Bus de mensajes", rol: "infra", forma: "caja", pos: [1.8, 0, -0.6], tam: [2.4, 0.6, 1.4], rotulo: "arriba", resumen: "Reparte eventos entre servicios sin que el emisor conozca a los receptores." },
    { id: "pagos", nombre: "Pagos", rol: "logica", forma: "caja", pos: [5.2, 0, -0.6], tam: [2.4, 1, 1.4], rotulo: "frente", resumen: "Cobra los pedidos. Se entera de ellos por el bus, no por una llamada de Pedidos." },
    { id: "bd-usuarios", nombre: "BD Usuarios", rol: "datos", forma: "cilindro", pos: [-5.2, 0, -3.6], tam: [1.6, 1, 1.6], resumen: "La base de datos propia de Usuarios: ningún otro servicio la toca." },
    { id: "bd-pedidos", nombre: "BD Pedidos", rol: "datos", forma: "cilindro", pos: [-1.7, 0, -3.6], tam: [1.6, 1, 1.6], resumen: "La base de datos propia de Pedidos." },
    { id: "bd-pagos", nombre: "BD Pagos", rol: "datos", forma: "cilindro", pos: [5.2, 0, -3.6], tam: [1.6, 1, 1.6], resumen: "La base de datos propia de Pagos." },
  ],
  enlaces: [
    // Sin etiqueta a propósito: el rótulo «petición» caía justo sobre el nombre del Gateway.
    { de: "cliente", a: "gateway", tipo: "llamada" },
    { de: "gateway", a: "usuarios", tipo: "llamada" },
    { de: "gateway", a: "pedidos", tipo: "llamada" },
    { de: "gateway", a: "pagos", tipo: "llamada" },
    { de: "usuarios", a: "bd-usuarios", tipo: "llamada" },
    { de: "pedidos", a: "bd-pedidos", tipo: "llamada" },
    { de: "pagos", a: "bd-pagos", tipo: "llamada" },
    { de: "pedidos", a: "bus", etiqueta: "publica", tipo: "evento" },
    { de: "bus", a: "pagos", etiqueta: "entrega", tipo: "evento" },
  ],
};
