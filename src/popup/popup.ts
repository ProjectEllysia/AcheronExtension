/**
 * El popup: la única interfaz de la extensión, y el gesto que lo desencadena
 * todo.
 *
 * No hay aquí ni criptografía ni acceso a la bóveda. El popup pregunta al
 * service worker y pinta lo que le contesta, y eso es deliberado: el proceso
 * privilegiado es el que decide, y una interfaz que además decidiera sería un
 * segundo sitio donde equivocarse.
 *
 * Que el usuario abra este popup es, además, lo que concede `activeTab` sobre
 * la pestaña. Sin esa apertura la extensión no puede ni mirar dónde está.
 */

import type { Candidate, Request, Response, Status } from '../shared/messages.js'

const screens = ['login', 'mfa', 'unlock', 'vault'] as const
type Screen = (typeof screens)[number]

/** El desafío pendiente de MFA, si el login lo pidió. Vive lo que vive el popup. */
let challengeToken: string | null = null

document.addEventListener('DOMContentLoaded', () => {
  byId<HTMLFormElement>('form-login').addEventListener('submit', guard(doLogin))
  byId<HTMLFormElement>('form-mfa').addEventListener('submit', guard(doMfa))
  byId<HTMLFormElement>('form-unlock').addEventListener('submit', guard(doUnlock))
  byId<HTMLButtonElement>('lock').addEventListener('click', guard(doLock))
  void refresh()
})

/** Pregunta el estado y enseña la pantalla que toque. */
async function refresh(): Promise<void> {
  const status = await send<Status>({ type: 'status' })
  byId('lock').hidden = !status.unlocked

  if (!status.authenticated) return show('login')
  if (!status.unlocked) return show('unlock')

  show('vault')
  await listCandidates(status.host)
}

async function listCandidates(host: string | null): Promise<void> {
  const list = byId<HTMLUListElement>('candidates')
  list.replaceChildren()

  byId('host').textContent = host
    ? `Credenciales para ${host}`
    : 'Esta página no admite autocompletado: sólo se rellena en sitios https.'

  const candidates = host ? await send<Candidate[]>({ type: 'candidates' }) : []
  byId('empty').hidden = !host || candidates.length > 0

  for (const candidate of candidates) {
    list.append(row(candidate))
  }
}

/** Una fila de la lista, construida con el DOM y no con HTML en una cadena. */
function row(candidate: Candidate): HTMLLIElement {
  const item = document.createElement('li')

  const label = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = candidate.title
  const username = document.createElement('span')
  username.textContent = candidate.username
  label.append(title, username)

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Rellenar'
  button.addEventListener('click', guard(async () => {
    await send({ type: 'fill', id: candidate.id })
    // El relleno ya ocurrió en la pestaña; el popup sobra a partir de aquí.
    window.close()
  }))

  item.append(label, button)
  return item
}

/* ── Acciones ───────────────────────────────────────────────────────────── */

async function doLogin(): Promise<void> {
  const result = await send<{ mfaRequired: boolean; challengeToken?: string }>({
    type: 'login',
    username: value('login-username'),
    password: value('login-password'),
  })

  if (result.mfaRequired && result.challengeToken) {
    challengeToken = result.challengeToken
    return show('mfa')
  }
  await refresh()
}

async function doMfa(): Promise<void> {
  if (!challengeToken) return show('login')
  await send({ type: 'login/mfa', challengeToken, code: value('mfa-code') })
  challengeToken = null
  await refresh()
}

async function doUnlock(): Promise<void> {
  await send({ type: 'unlock', masterPassword: value('unlock-password') })
  // El campo se vacía en cuanto deja de hacer falta: el popup puede quedarse
  // abierto y no hay razón para que la maestra siga escrita en un input.
  byId<HTMLInputElement>('unlock-password').value = ''
  await refresh()
}

async function doLock(): Promise<void> {
  await send({ type: 'lock' })
  await refresh()
}

/* ── Fontanería ─────────────────────────────────────────────────────────── */

/**
 * Manda un mensaje al service worker y desenvuelve la respuesta.
 *
 * El error viaja como dato porque `sendMessage` no transporta excepciones: al
 * otro lado, una promesa rechazada llega como un `lastError` sin mensaje útil,
 * y el usuario vería «algo ha fallado» para todo, incluida una contraseña
 * maestra mal tecleada.
 */
async function send<T>(request: Request): Promise<T> {
  const response = (await chrome.runtime.sendMessage(request)) as Response<T>
  if (!response.ok) throw new Error(response.error)
  return response.data
}

/** Envuelve un manejador para que cualquier fallo acabe a la vista del usuario. */
function guard(action: () => Promise<void>) {
  return (event: Event) => {
    event.preventDefault()
    const error = byId('error')
    error.hidden = true
    action().catch((reason: unknown) => {
      error.textContent = reason instanceof Error ? reason.message : String(reason)
      error.hidden = false
    })
  }
}

function show(screen: Screen): void {
  for (const candidate of screens) {
    byId(`screen-${candidate}`).hidden = candidate !== screen
  }
}

function value(id: string): string {
  return byId<HTMLInputElement>(id).value
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Falta el elemento #${id} en el popup`)
  return element as T
}
