/**
 * Lo que el empaquetado inyecta en tiempo de construcción.
 *
 * `__ELLYSIA_API_URL__` lo define `vite.config.ts` a partir de
 * `VITE_ELLYSIA_API_URL`. Vive aquí, y no leído del entorno en ejecución,
 * porque el mismo valor entra en `host_permissions` del manifiesto: si se
 * pudieran separar, la extensión pediría permiso para un servidor y hablaría
 * con otro.
 */
declare const __ELLYSIA_API_URL__: string

/** Origen de la API de Ellysia, sin barra final. */
export const API_URL: string = __ELLYSIA_API_URL__.replace(/\/+$/, '')

/**
 * Minutos de inactividad tras los que la bóveda se cierra sola.
 *
 * Quince es el valor que fijó el diseño de la sesión (#483), y se sostiene
 * porque re-desbloquear cuesta ~137 ms: la justificación habitual para
 * timeouts largos —que desbloquear duele— aquí no aplica.
 */
export const DEFAULT_LOCK_MINUTES = 15

/**
 * Techo del timeout configurable. No existe un «no bloquear nunca»: eso
 * convierte un robo de equipo desatendido en un robo de todas las credenciales.
 */
export const MAX_LOCK_MINUTES = 120
