/**
 * Dónde vive la bóveda desbloqueada, cuánto dura y qué la cierra.
 *
 * Este fichero es la traducción a código del documento de decisión de #483, y
 * conviene leerlo con él delante (`docs/sesion-desbloqueada.md`). Las cuatro
 * reglas que implementa:
 *
 * 1. La sesión vive en `chrome.storage.session`, que es MEMORIA: ni
 *    `storage.local`, ni IndexedDB, ni `localStorage`. Nada de esto toca disco,
 *    y ésa es la línea que el diseño no cruza.
 * 2. Se guarda la `vaultKey` desenvuelta y nunca la contraseña maestra. Una
 *    contraseña maestra filtrada abre además el correo del usuario, porque las
 *    reutilizan; la `vaultKey` sólo abre esta bóveda y rotarla es un
 *    `changePassword`.
 * 3. `setAccessLevel('TRUSTED_CONTEXTS')` deja este almacén fuera del alcance
 *    de los content scripts.
 * 4. Se cierra por inactividad, por bloqueo del sistema operativo, al cerrar el
 *    navegador (gratis: la sesión se vacía sola) y a mano.
 *
 * El compromiso que esto acepta, dicho de frente: `chrome.storage.session` sólo
 * admite valores serializables, así que la clave deja de ser una `CryptoKey` no
 * extraíble y pasa a ser bytes. Se pierde la no-extraibilidad. Es aceptable
 * porque quien pueda leer este almacén ya ejecuta código DENTRO de la
 * extensión, y desde ahí puede pedirle que descifre la bóveda entera: frente a
 * ese atacante, la clave no extraíble no cambia el desenlace.
 */

import type { VaultJson } from '@projectellysia/acheron-core-js'
import { DEFAULT_LOCK_MINUTES, MAX_LOCK_MINUTES } from '../shared/config.js'

const SESSION_KEY = 'unlocked'
const LOCK_ALARM = 'acheron/lock'

/** La bóveda abierta, tal y como sobrevive a la muerte del service worker. */
export interface UnlockedSession {
  /** Validador del checker; hace falta para reabrir y para rotar la maestra. */
  username: string
  /** La `vaultKey` desenvuelta, en Base64. Nunca la contraseña maestra. */
  vaultKeyB64: string
  /** La bóveda tal y como llegó: los storables siguen cifrados aquí. */
  vault: VaultJson
  /** Revisión del servidor, para la concurrencia optimista de `vaultWrite`. */
  revision: number | null
  /** Último uso, en epoch ms. Lo que el bloqueo por inactividad mide. */
  lastUsedAt: number
}

/**
 * Restringe el almacén de sesión a los contextos privilegiados.
 *
 * Debe llamarse en el arranque del service worker, ANTES de guardar nada. Que
 * esto funcione de verdad es una de las dos cosas que el documento de diseño
 * dejó sin verificar; `test/` no puede comprobarlo y la sonda de
 * `docs/sondas.md` sí.
 */
export async function hardenSessionStorage(): Promise<void> {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
}

/**
 * Devuelve la sesión desbloqueada, o `null` si no hay o ya expiró.
 *
 * Comprueba la caducidad además de confiar en la alarma: el service worker
 * puede despertar por un mensaje antes de que la alarma llegue a dispararse, y
 * en ese hueco una sesión vencida seguiría siendo utilizable.
 */
export async function loadSession(): Promise<UnlockedSession | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY)
  const session = stored[SESSION_KEY] as UnlockedSession | undefined
  if (!session) return null

  const minutes = await lockMinutes()
  if (Date.now() - session.lastUsedAt > minutes * 60_000) {
    await lock()
    return null
  }
  return session
}

/** Guarda la sesión y (re)arma el temporizador de bloqueo. */
export async function saveSession(session: UnlockedSession): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: { ...session, lastUsedAt: Date.now() } })
  await armLockAlarm()
}

/**
 * Marca actividad: re-arma el contador de inactividad sin reescribir la bóveda.
 * Se llama en cada operación que el usuario pide de forma explícita.
 */
export async function touchSession(): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_KEY)
  const session = stored[SESSION_KEY] as UnlockedSession | undefined
  if (!session) return
  await saveSession(session)
}

/** Cierra la bóveda: borra la clave de memoria y desarma la alarma. */
export async function lock(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY)
  await chrome.alarms.clear(LOCK_ALARM)
}

/**
 * Minutos de inactividad configurados, acotados por el techo.
 *
 * La preferencia SÍ va a `storage.local`, porque no es un secreto y debe
 * sobrevivir al cierre del navegador. Lo que nunca va allí es la sesión.
 */
export async function lockMinutes(): Promise<number> {
  const stored = await chrome.storage.local.get('lockMinutes')
  const value = Number(stored.lockMinutes)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LOCK_MINUTES
  return Math.min(value, MAX_LOCK_MINUTES)
}

/**
 * Arma la alarma de bloqueo.
 *
 * Es `chrome.alarms` y no `setTimeout` por la misma razón que existe todo este
 * fichero: el service worker se recicla a los pocos segundos y se llevaría el
 * temporizador por delante, dejando la bóveda abierta sin nadie que la cierre.
 */
async function armLockAlarm(): Promise<void> {
  const minutes = await lockMinutes()
  await chrome.alarms.create(LOCK_ALARM, { delayInMinutes: minutes })
}

/** Conecta los disparadores de bloqueo. Se llama una vez, al cargar el worker. */
export function registerLockTriggers(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === LOCK_ALARM) void lock()
  })

  // Si el usuario bloquea su equipo, la bóveda se bloquea con él.
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === 'locked') void lock()
  })
}
