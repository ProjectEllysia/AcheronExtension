/**
 * El rellenador: lo único de esta extensión que corre en una página ajena.
 *
 * Se escribe asumiendo que la página es hostil, porque puede serlo. De ahí que
 * aquí no haya criptografía, ni tokens, ni acceso a `chrome.storage`: lo único
 * que este código llega a ver son dos cadenas que el proceso privilegiado le
 * manda después de que el usuario haya pulsado un botón, y sólo las de la
 * credencial que eligió.
 *
 * Se inyecta bajo demanda con `chrome.scripting.executeScript`, así que puede
 * ejecutarse dos veces en la misma página si el usuario rellena dos veces; por
 * eso registra su listener una sola vez.
 */

import type { FillMessage } from '../shared/messages.js'

declare global {
  interface Window {
    __acheronFillReady?: true
  }
}

if (!window.__acheronFillReady) {
  window.__acheronFillReady = true

  chrome.runtime.onMessage.addListener((message: FillMessage, _sender, sendResponse) => {
    if (message.type !== 'acheron/fill') return undefined

    // Nada de rellenar dentro de un iframe de otro origen: es la vía clásica de
    // robo de credenciales por clickjacking, y una página puede incrustar el
    // formulario de cualquiera. Si no somos el marco principal, no se rellena.
    if (window.top !== window) {
      sendResponse(false)
      return undefined
    }

    sendResponse(fill(message.username, message.password))
    return undefined
  })
}

/** Rellena el primer par identificador/contraseña visible. Devuelve si lo logró. */
function fill(username: string, password: string): boolean {
  const passwordField = visible(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  )
  if (!passwordField) return false

  setValue(passwordField, password)

  const identityField = identityFieldFor(passwordField)
  if (identityField) setValue(identityField, username)

  return true
}

/**
 * El campo de identificador que acompaña a una contraseña.
 *
 * Se busca hacia ATRÁS desde la contraseña, dentro del mismo formulario, y se
 * coge el último candidato anterior a ella. Es lo que hace que funcione en los
 * formularios que traen también un buscador o un campo de cupón: el texto que
 * de verdad acompaña a la contraseña es el que la precede inmediatamente.
 */
function identityFieldFor(passwordField: HTMLInputElement): HTMLInputElement | null {
  const scope: ParentNode = passwordField.form ?? document
  const inputs = [...scope.querySelectorAll<HTMLInputElement>('input')]
  const passwordIndex = inputs.indexOf(passwordField)

  for (let index = passwordIndex - 1; index >= 0; index -= 1) {
    const input = inputs[index]
    if (!input || !isVisible(input)) continue
    if (['text', 'email', 'tel', ''].includes(input.type.toLowerCase())) return input
  }
  return null
}

/**
 * Escribe un valor y avisa a la página.
 *
 * Asignar `.value` a secas no dispara nada, y los formularios hechos con Vue,
 * React o Angular no se enteran: el botón de enviar se queda deshabilitado y el
 * usuario ve un campo relleno que la página cree vacío. Los dos eventos son lo
 * que lo arregla.
 */
function setValue(field: HTMLInputElement, value: string): void {
  field.focus()
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function visible(fields: NodeListOf<HTMLInputElement>): HTMLInputElement | null {
  for (const field of fields) {
    if (isVisible(field)) return field
  }
  return null
}

/** Descarta los campos ocultos, que en un formulario de acceso son trampas o restos. */
function isVisible(field: HTMLInputElement): boolean {
  if (field.disabled || field.readOnly || field.type === 'hidden') return false
  const rect = field.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}
