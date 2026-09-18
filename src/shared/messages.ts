/**
 * El protocolo entre el popup, el service worker y el rellenador.
 *
 * Está declarado en un solo sitio a propósito: es la frontera por la que podría
 * escaparse una credencial, y conviene poder leer de un vistazo TODO lo que
 * cruza. La regla que impone esta lista es la del diseño de la sesión (#483):
 * ningún mensaje devuelve la bóveda entera ni una clave; el que sale hacia una
 * página lleva los valores de UN storable, el que el usuario eligió.
 */

/** Un candidato para la pestaña activa, tal y como lo ve el popup. */
export interface Candidate {
  /** `internalId` del storable dentro de la bóveda. */
  id: string
  /** Título en claro, para que el usuario reconozca cuál es cuál. */
  title: string
  /** Identificador de acceso en claro. La contraseña NO viaja hasta el relleno. */
  username: string
}

/** Estado que el popup necesita para decidir qué pantalla pintar. */
export interface Status {
  authenticated: boolean
  unlocked: boolean
  /** Host de la pestaña activa, o `null` si no es una página `https`. */
  host: string | null
}

/** Lo que el popup pide al service worker. */
export type Request =
  | { type: 'status' }
  | { type: 'login'; username: string; password: string }
  | { type: 'login/mfa'; challengeToken: string; code: string }
  | { type: 'logout' }
  | { type: 'unlock'; masterPassword: string }
  | { type: 'lock' }
  | { type: 'candidates' }
  | { type: 'fill'; id: string }

/**
 * Lo que contesta. El error viaja como dato y no como excepción porque
 * `chrome.runtime.sendMessage` no transporta excepciones: lo que cruza es JSON,
 * y una promesa rechazada al otro lado llega como un `lastError` sin mensaje
 * útil.
 */
export type Response<T> = { ok: true; data: T } | { ok: false; error: string }

/** Lo único que el service worker manda hacia una página: una credencial. */
export interface FillMessage {
  type: 'acheron/fill'
  username: string
  password: string
}
