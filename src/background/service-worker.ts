/**
 * El proceso privilegiado: el único sitio donde hay claves y texto en claro.
 *
 * Todo lo que decide algo importante pasa por aquí. En particular, el ORIGEN de
 * la página lo resuelve este fichero preguntándoselo a `chrome.tabs`, y nunca
 * lo aporta quien pide el relleno. Es la regla que hace que un content script
 * que mienta sobre dónde vive no consiga una credencial ajena (#483).
 *
 * El worker se recicla a los pocos segundos de inactividad, así que aquí NO
 * vive estado: cada mensaje reconstruye lo que necesita desde
 * `chrome.storage.session`. Una variable de módulo que guardase la bóveda
 * funcionaría en las pruebas a mano y fallaría en cuanto alguien apartara la
 * vista, que es la peor forma de fallar.
 */

import type { FillMessage, Request, Response } from '../shared/messages.js'
import { isAuthenticated, login, logout, verifyMfa } from './auth.js'
import { pageHost } from './matching.js'
import { hardenSessionStorage, lock, registerLockTriggers, touchSession } from './session.js'
import { candidatesFor, isUnlocked, reveal, unlock } from './vault.js'

// Antes de guardar nada: el almacén de sesión queda fuera del alcance de los
// content scripts. Se repite en los dos arranques porque el nivel de acceso no
// sobrevive a la reinstalación de la extensión.
chrome.runtime.onInstalled.addListener(() => void hardenSessionStorage())
chrome.runtime.onStartup.addListener(() => void hardenSessionStorage())
void hardenSessionStorage()

registerLockTriggers()

chrome.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
  // `handle` es async y el listener no puede serlo: devolver `true` mantiene el
  // canal abierto hasta que la promesa resuelva.
  handle(message).then(sendResponse, (error: unknown) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
  })
  return true
})

async function handle(message: Request): Promise<Response<unknown>> {
  switch (message.type) {
    case 'status':
      return ok({
        authenticated: await isAuthenticated(),
        unlocked: await isUnlocked(),
        host: pageHost((await activeTab())?.url),
      })

    case 'login':
      return ok(await login(message.username, message.password))

    case 'login/mfa':
      return ok(await verifyMfa(message.challengeToken, message.code))

    case 'logout':
      // Cerrar sesión cierra también la bóveda. Lo contrario dejaría una clave
      // viva en memoria sin nadie a quien pertenezca.
      await lock()
      await logout()
      return ok(null)

    case 'unlock':
      await unlock(message.masterPassword)
      return ok(null)

    case 'lock':
      await lock()
      return ok(null)

    case 'candidates': {
      const host = pageHost((await activeTab())?.url)
      if (!host) return ok([])
      await touchSession()
      return ok(await candidatesFor(host))
    }

    case 'fill':
      return ok(await fill(message.id))
  }
}

/**
 * Rellena una credencial en la pestaña activa.
 *
 * Las tres condiciones del diseño se cumplen aquí y no en otro sitio:
 *
 * - **Hay gesto del usuario**: este camino sólo se recorre cuando alguien pulsa
 *   un botón del popup. No hay nada que rellene al cargar una página.
 * - **El origen lo decide este proceso**: `host` sale de `tab.url`, y `reveal`
 *   lo vuelve a comprobar contra el `matchKey` del storable.
 * - **Sale una credencial, no la bóveda**: lo que cruza a la página son dos
 *   cadenas, las del storable que el usuario eligió.
 */
async function fill(id: string): Promise<null> {
  const tab = await activeTab()
  const host = pageHost(tab?.url)
  if (!tab?.id || !host) throw new Error('Esta página no admite autocompletado')

  const credential = await reveal(id, host)
  await touchSession()

  // El rellenador se inyecta ahora, con el permiso que `activeTab` acaba de
  // conceder al abrirse el popup, y no antes. Por eso el manifiesto no declara
  // `content_scripts` ni pide permiso permanente sobre `https://*/*`.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['assets/autofill.js'],
  })

  const message: FillMessage = { type: 'acheron/fill', ...credential }
  const filled = await chrome.tabs.sendMessage(tab.id, message)
  if (filled !== true) throw new Error('No se encontró un formulario de acceso en la página')
  return null
}

/** La pestaña que el usuario está mirando, que es la única que la extensión ve. */
async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function ok<T>(data: T): Response<T> {
  return { ok: true, data }
}
