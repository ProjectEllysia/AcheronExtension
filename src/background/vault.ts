/**
 * Abrir la bóveda y sacar de ella exactamente una credencial.
 *
 * Toda la criptografía de este fichero viene del paquete: no hay aquí ni una
 * primitiva reimplementada, ni un nombre de campo escrito a mano. Ése era el
 * objetivo del proyecto entero —que la extensión no fuera la tercera copia del
 * motor ni la quinta del catálogo—, así que si alguna vez hace falta añadir
 * cripto aquí, el sitio correcto es `AcheronCore`, no este repositorio.
 */

import {
  STORABLE_SCHEMA,
  OpenVault,
  WrongPasswordError,
  aesGcmDecrypt,
  b64decode,
  deriveKey,
  validateChecker,
} from '@projectellysia/acheron-core-js'
import type { Candidate } from '../shared/messages.js'
import type { EncryptedStorable, VaultJson } from '@projectellysia/acheron-core-js'
import { apiFetch, currentUsername } from './auth.js'
import { loginFieldsOf } from './fields.js'
import { matchesHost, matchableTypes } from './matching.js'
import { loadSession, saveSession, type UnlockedSession } from './session.js'

/** Los tipos del catálogo que se pueden asociar a una página. Hoy, sólo `account`. */
const MATCHABLE = matchableTypes(STORABLE_SCHEMA)

/** Se lanza cuando se pide algo de la bóveda y está cerrada. */
export class LockedError extends Error {
  constructor(message = 'La bóveda está bloqueada') {
    super(message)
    this.name = 'LockedError'
  }
}

/**
 * Descarga la bóveda, valida la contraseña maestra y deja la sesión abierta.
 *
 * Cuesta ~137 ms medidos en Chrome real durante el espolón de #482, con los
 * parámetros de producción (Argon2id, 64 MiB, 3 pasadas). El número importa
 * porque es el que permite bloquear a los 15 minutos sin que duela.
 */
export async function unlock(masterPassword: string): Promise<void> {
  const username = await currentUsername()
  const vault = await fetchVault()

  const derivedKey = await deriveKey(masterPassword, vault.algorithm)
  if (!(await validateChecker(derivedKey, vault.checker, username))) {
    throw new WrongPasswordError('La contraseña maestra no es correcta')
  }

  // Lo que se guarda es la vaultKey DESENVUELTA, en Base64. Es el compromiso
  // que documenta `session.ts`: deja de ser una `CryptoKey` no extraíble, pero
  // no toca el disco. La contraseña maestra muere aquí, en esta función.
  const vaultKeyB64 = await aesGcmDecrypt(derivedKey, vault.vaultKey)

  await saveSession({
    username,
    vaultKeyB64,
    vault,
    revision: typeof vault.revision === 'number' ? vault.revision : null,
    lastUsedAt: Date.now(),
  })
}

/** ¿Hay una bóveda abierta ahora mismo? */
export async function isUnlocked(): Promise<boolean> {
  return (await loadSession()) !== null
}

/**
 * Las credenciales que corresponden a un host, con la contraseña FUERA.
 *
 * El popup necesita pintar una lista para que el usuario elija, y para eso le
 * basta el título y el identificador de acceso. La contraseña no sale de aquí
 * hasta que hay una elección concreta, y entonces sale por `reveal`.
 */
export async function candidatesFor(host: string): Promise<Candidate[]> {
  const { open, session } = await reopen()
  const found: Candidate[] = []

  for (const { category, matchKey } of MATCHABLE) {
    const items = (session.vault[category] as Record<string, unknown>[] | undefined) ?? []
    for (const item of items) {
      const plain = await open.decryptStorable(category, item as EncryptedStorable)
      if (!matchesHost(host, plain, matchKey)) continue

      const { identityKey } = loginFieldsOf(STORABLE_SCHEMA, category)
      found.push({
        id: String(item.id ?? ''),
        title: plain.title,
        username: identityKey ? String(plain[identityKey] ?? '') : '',
      })
    }
  }
  return found
}

/**
 * Descifra UNA credencial, la que el usuario eligió, para un host concreto.
 *
 * El `host` no es decorativo ni viene de quien pide el relleno: lo resuelve el
 * service worker desde la pestaña real y se vuelve a comprobar aquí. Es la
 * regla de que «el origen decide, y lo decide el proceso privilegiado»: un
 * content script que mienta sobre dónde vive no consigue una credencial ajena.
 */
export async function reveal(
  id: string,
  host: string,
): Promise<{ username: string; password: string }> {
  const { open, session } = await reopen()

  for (const { category, matchKey } of MATCHABLE) {
    const items = (session.vault[category] as Record<string, unknown>[] | undefined) ?? []
    const item = items.find((candidate) => String(candidate.id ?? '') === id)
    if (!item) continue

    const plain = await open.decryptStorable(category, item as EncryptedStorable)
    if (!matchesHost(host, plain, matchKey)) break

    const { identityKey, secretKey } = loginFieldsOf(STORABLE_SCHEMA, category)
    return {
      username: identityKey ? String(plain[identityKey] ?? '') : '',
      password: secretKey ? String(plain[secretKey] ?? '') : '',
    }
  }

  throw new Error('Esa credencial no corresponde a esta página')
}

/**
 * Reconstruye el manejador de bóveda desde la sesión.
 *
 * Se rehace en cada operación en vez de conservarse porque el service worker se
 * recicla: guardar el objeto en una variable de módulo funcionaría durante unos
 * segundos y fallaría después, que es la peor forma de fallar.
 */
async function reopen(): Promise<{ open: OpenVault; session: UnlockedSession }> {
  const session = await loadSession()
  if (!session) throw new LockedError()

  const vaultKey = await crypto.subtle.importKey(
    'raw',
    b64decode(session.vaultKeyB64),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
  return { open: new OpenVault(session.vault, vaultKey), session }
}

/** `GET /acheron/vault`: el blob cifrado, tal y como el servidor lo guarda. */
async function fetchVault(): Promise<VaultJson> {
  const res = await apiFetch('/acheron/vault')
  if (!res.ok) {
    if (res.status === 404) throw new Error('Este usuario todavía no tiene bóveda')
    throw new Error('No se pudo descargar la bóveda')
  }
  return (await res.json()) as VaultJson
}
