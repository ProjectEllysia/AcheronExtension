import { defineManifest } from '@crxjs/vite-plugin'

/**
 * El manifiesto MV3 de la extensión.
 *
 * Cada línea de aquí es una decisión tomada en otra parte y verificada antes de
 * escribirse; no hay ninguna puesta «por si acaso». Las referencias son a las
 * issues de ProjectEllysia/EllysiaServer.
 *
 * @param apiUrl  origen de la API de Ellysia; entra tal cual en
 *                `host_permissions`, que debe ser estático en MV3.
 */
export function buildManifest(apiUrl: string) {
  return defineManifest({
    manifest_version: 3,
    name: 'Acheron',
    description: 'Rellena las credenciales de tu bóveda de Acheron. Todo el descifrado ocurre en tu navegador.',
    version: '0.1.0',

    // `type: module` más importación por ruta relativa: el espolón de AC15
    // (#482) fijó esta pareja, y sin ella `hash-wasm` no carga.
    background: {
      service_worker: 'src/background/service-worker.ts',
      type: 'module',
    },

    action: {
      default_popup: 'src/popup/index.html',
      default_title: 'Acheron',
    },

    // La directiva que hace falta es `wasm-unsafe-eval`, y SOLO ésa. El mensaje
    // de error de Chrome sugiere `wasm-eval` y `unsafe-eval`: ninguna de las
    // dos sirve —la segunda está prohibida en MV3 y hace que Chrome rechace la
    // extensión al cargarla—. Queda anotado en #482 para no repetir el camino.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },

    permissions: [
      // La sesión desbloqueada vive en `chrome.storage.session`, en memoria.
      'storage',
      // El temporizador de bloqueo por inactividad. NO vale `setTimeout`: el
      // service worker se recicla y se lo llevaría por delante.
      'alarms',
      // Bloquear la bóveda cuando el usuario bloquea su equipo.
      'idle',
      // Da acceso a la pestaña activa SOLO cuando el usuario abre el popup.
      // Es lo que permite no pedir permiso permanente sobre `https://*/*`, que
      // es lo que pide una extensión de autocompletado al uso.
      'activeTab',
      // Inyectar el rellenador en la pestaña, y sólo tras un gesto explícito.
      'scripting',
    ],

    // El único sitio con el que la extensión habla. Nótese que NO hay permiso
    // de host sobre las páginas del usuario: el acceso a la pestaña lo concede
    // `activeTab` al abrir el popup, y se acaba con ella.
    host_permissions: [`${apiUrl.replace(/\/+$/, '')}/*`],

    // Deliberadamente no hay `content_scripts`. Un content script declarado
    // aquí correría en TODAS las páginas desde que se carga la extensión; el
    // rellenador se inyecta a mano tras el gesto del usuario, que es justo lo
    // que pide el documento de diseño de la sesión (#483).
  })
}
