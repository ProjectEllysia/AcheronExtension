/**
 * La sesión CON EL SERVIDOR, que no es la misma cosa que la bóveda abierta.
 *
 * Conviene separarlas desde el principio porque protegen cosas distintas. El
 * token de la API sólo da acceso al BLOB CIFRADO: quien lo robe se descarga
 * ciphertext y no puede leer una sola credencial sin la contraseña maestra, que
 * el servidor nunca ha visto. La `vaultKey` de `session.ts`, en cambio, ES la
 * bóveda abierta. Por eso una vive en disco y la otra no.
 *
 * ## Cómo se autentica una extensión contra Ellysia
 *
 * Sin redirecciones. `POST /oauth/token` admite el grant `password`, así que el
 * popup pide usuario y contraseña y canjea tokens directamente; no hay pestaña
 * de autorización que abrir ni `chrome.identity` que configurar. Si la cuenta
 * tiene MFA, la respuesta trae `mfaRequired` y un `challengeToken` que se canjea
 * en `POST /oauth/mfa/verify` con el código TOTP.
 *
 * ## Dónde vive cada token, y por qué
 *
 * - **Access token → `storage.session`** (memoria). Es efímero y se renueva.
 * - **Refresh token → `storage.local`** (disco). Es la decisión discutible de
 *   este fichero y va documentada en `docs/sesion-desbloqueada.md`: obliga a
 *   aceptar que alguien con acceso al perfil puede DESCARGARSE la bóveda
 *   cifrada. No puede leerla —sigue haciendo falta la maestra— y es la misma
 *   exposición que ya tiene la SPA, que guarda su sesión en `localStorage`.
 *   La alternativa, mandarlo también a `storage.session`, cuesta un `local` →
 *   `session` aquí abajo y obliga a teclear usuario y contraseña en cada
 *   arranque del navegador, además de la maestra.
 */

import { API_URL } from '../shared/config.js'

const ACCESS_KEY = 'accessToken'
const REFRESH_KEY = 'refreshToken'
const USERNAME_KEY = 'username'

/** Se lanza cuando ya no hay forma de renovar: el popup debe pedir login. */
export class NotAuthenticatedError extends Error {
  constructor(message = 'No hay sesión con el servidor') {
    super(message)
    this.name = 'NotAuthenticatedError'
  }
}

/** Lo que devuelve un intento de login: tokens, o un desafío de segundo factor. */
export type LoginResult =
  | { mfaRequired: false }
  | { mfaRequired: true; challengeToken: string; methods: string[] }

/**
 * Canjea usuario y contraseña por tokens.
 *
 * Guarda además el nombre de usuario, que no es un secreto y hace falta para
 * abrir la bóveda: el `checker` valida la contraseña maestra comparando contra
 * `hex(SHA-256(username))`. Sin él no se puede desbloquear nada.
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  await chrome.storage.local.set({ [USERNAME_KEY]: username })
  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grantType: 'password', username, password }),
  })
  return consumeTokenResponse(res)
}

/** Canjea el desafío de MFA y el código TOTP por tokens. */
export async function verifyMfa(challengeToken: string, code: string): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/oauth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeToken, code }),
  })
  return consumeTokenResponse(res)
}

/** Olvida los tokens de los dos almacenes. No toca la bóveda: eso es `lock()`. */
export async function logout(): Promise<void> {
  await chrome.storage.session.remove(ACCESS_KEY)
  await chrome.storage.local.remove(REFRESH_KEY)
}

/** El usuario con el que se entró; validador del `checker` de la bóveda. */
export async function currentUsername(): Promise<string> {
  const { [USERNAME_KEY]: username } = await chrome.storage.local.get(USERNAME_KEY)
  if (typeof username !== 'string' || username === '') throw new NotAuthenticatedError()
  return username
}

/** ¿Hay con qué hablar con el servidor, aunque haya que renovar antes? */
export async function isAuthenticated(): Promise<boolean> {
  const { [REFRESH_KEY]: refresh } = await chrome.storage.local.get(REFRESH_KEY)
  return typeof refresh === 'string' && refresh !== ''
}

/**
 * El `apiFetch` que este paquete inyecta en `vaultWrite`.
 *
 * `@projectellysia/acheron-core-js/sync` recibe su cliente HTTP en vez de
 * elegirlo, y por eso la concurrencia optimista del vault funciona desde una
 * extensión sin tocar una línea del motor.
 *
 * Renueva el access token UNA vez ante un 401 y reintenta. Más de una vez sería
 * enmascarar que el refresh ya no sirve, y lo que toca entonces es pedir login.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let res = await send(path, options, await accessToken())
  if (res.status === 401) {
    res = await send(path, options, await refreshAccessToken())
  }
  return res
}

async function send(path: string, options: RequestInit, token: string): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

async function accessToken(): Promise<string> {
  const { [ACCESS_KEY]: token } = await chrome.storage.session.get(ACCESS_KEY)
  if (typeof token === 'string' && token !== '') return token
  return refreshAccessToken()
}

async function refreshAccessToken(): Promise<string> {
  const { [REFRESH_KEY]: refresh } = await chrome.storage.local.get(REFRESH_KEY)
  if (typeof refresh !== 'string' || refresh === '') throw new NotAuthenticatedError()

  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grantType: 'refresh_token', refresh_token: refresh }),
  })
  if (!res.ok) {
    // Un refresh que ya no vale no se reintenta: o caducó, o el usuario cambió
    // la contraseña desde otro cliente. En los dos casos hay que volver a
    // entrar, y dejarlo guardado sólo retrasa el mismo desenlace.
    await logout()
    throw new NotAuthenticatedError(await errorMessage(res, 'La sesión ha caducado'))
  }

  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new NotAuthenticatedError()
  await chrome.storage.session.set({ [ACCESS_KEY]: body.access_token })
  return body.access_token
}

/** Guarda lo que venga de `/oauth/token` o `/oauth/mfa/verify`. */
async function consumeTokenResponse(res: Response): Promise<LoginResult> {
  if (!res.ok) throw new Error(await errorMessage(res, 'No se pudo iniciar sesión'))

  const body = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    mfaRequired?: boolean
    challengeToken?: string
    methods?: string[]
  }

  if (body.mfaRequired && body.challengeToken) {
    return { mfaRequired: true, challengeToken: body.challengeToken, methods: body.methods ?? [] }
  }
  if (!body.access_token || !body.refresh_token) {
    throw new Error('El servidor no devolvió tokens')
  }

  await chrome.storage.session.set({ [ACCESS_KEY]: body.access_token })
  await chrome.storage.local.set({ [REFRESH_KEY]: body.refresh_token })
  return { mfaRequired: false }
}

/** El mensaje que la API pone en `error_description`, si lo hay. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>
    const message = body.error_description ?? body.message ?? body.error
    return typeof message === 'string' ? message : fallback
  } catch {
    return fallback
  }
}
