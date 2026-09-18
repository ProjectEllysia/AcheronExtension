/**
 * Espolón desechable: ¿puede una página de extensión MV3 derivar un secreto
 * estable con Windows Hello, y sirve ese secreto para envolver la vaultKey?
 *
 * Contesta tres preguntas, en este orden, y la primera puede matar a las otras
 * dos:
 *
 *   1. ¿Puede una página `chrome-extension://` hacer WebAuthn? Históricamente
 *      no: WebAuthn exige un RP ID que sea un dominio, y el origen de una
 *      extensión no lo es. Si la respuesta es no, hay que replantear la
 *      arquitectura entera (ver el LEEME), no ajustar parámetros.
 *   2. ¿Está disponible la extensión PRF, que es la que entrega el secreto?
 *   3. ¿Es ese secreto ESTABLE entre invocaciones? Sin eso no se puede
 *      desenvolver mañana lo que se envolvió hoy, y todo el plan se cae.
 *
 * Nótese dónde corre esto: en una PÁGINA, no en el service worker.
 * `navigator.credentials` no existe en un worker, y además WebAuthn exige un
 * gesto del usuario. Ése es ya un resultado del espolón y condiciona el diseño.
 */

const salida = document.getElementById('salida')
const CLAVE = 'credencialId'

/** El salt fija QUÉ secreto se deriva. Constante: el mismo salt, el mismo secreto. */
const SALT = new TextEncoder().encode('acheron:vault-key-wrapping:v1')
/** Salt distinto, solo para la contraprueba del paso 4. */
const SALT_OTRO = new TextEncoder().encode('acheron:otro-proposito')

function log(texto, clase = '') {
  const linea = document.createElement('div')
  if (clase) linea.className = clase
  linea.textContent = texto
  salida.append(linea)
}

const hex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

const b64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
const deB64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))

/* ── 1. Registrar ─────────────────────────────────────────────────────── */

document.getElementById('registrar').addEventListener('click', async () => {
  salida.replaceChildren()
  log(`Origen de esta página: ${location.origin}`, 'nota')

  if (!window.PublicKeyCredential) {
    return log('✗ No existe PublicKeyCredential: WebAuthn no está disponible aquí.', 'mal')
  }

  // rp.id omitido a propósito: el navegador usa entonces el origen efectivo.
  // Si el origen de una extensión no vale como RP ID, ES AQUÍ donde falla, y
  // ése es el resultado que buscamos — no un parámetro que haya que afinar.
  try {
    const credencial = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Acheron (espolón)' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'espolon@acheron',
          displayName: 'Espolón',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          // Windows Hello, Touch ID: el autenticador del propio equipo.
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        extensions: { prf: {} },
      },
    })

    const resultados = credencial.getClientExtensionResults()
    log('✓ La página pudo registrar una credencial de plataforma.', 'ok')
    log(`  credencial: ${credencial.id.slice(0, 24)}…`, 'nota')

    if (resultados.prf?.enabled === true) {
      log('✓ El autenticador admite PRF.', 'ok')
    } else {
      log(`✗ PRF NO disponible (prf=${JSON.stringify(resultados.prf)}).`, 'mal')
      log('  Sin PRF no hay secreto que derivar: esta vía no sirve.', 'mal')
    }

    await chrome.storage.local.set({ [CLAVE]: b64(credencial.rawId) })
    log('Credencial guardada. Pulsa el paso 2.', 'nota')
  } catch (error) {
    log(`✗ Falló el registro: ${error.name} — ${error.message}`, 'mal')
    log('  Si es NotAllowedError o SecurityError, lo más probable es que el', 'nota')
    log('  origen chrome-extension:// no valga como RP ID. Ver el LEEME.', 'nota')
  }
})

/* ── 2, 3 y 4. Derivar ────────────────────────────────────────────────── */

async function derivar(salt, etiqueta) {
  const guardado = (await chrome.storage.local.get(CLAVE))[CLAVE]
  if (!guardado) return log('Primero el paso 1.', 'mal')

  try {
    const aserto = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: deB64(guardado) }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt } } },
      },
    })

    const prf = aserto.getClientExtensionResults().prf
    if (!prf?.results?.first) {
      return log(`✗ ${etiqueta}: el autenticador no devolvió secreto PRF.`, 'mal')
    }

    const secreto = hex(prf.results.first)
    log(`${etiqueta}: ${secreto}`, 'ok')
    return secreto
  } catch (error) {
    log(`✗ ${etiqueta}: ${error.name} — ${error.message}`, 'mal')
  }
}

document.getElementById('derivar').addEventListener('click', async () => {
  const secreto = await derivar(SALT, 'secreto (salt de Acheron)')
  if (secreto) window.__primero = secreto
})

document.getElementById('repetir').addEventListener('click', async () => {
  const otra = await derivar(SALT, 'secreto, segunda vez')
  if (!otra || !window.__primero) return
  // La pregunta que decide si esto sirve: sin estabilidad no se puede
  // desenvolver mañana lo que se envolvió hoy.
  log(
    otra === window.__primero
      ? '✓ ESTABLE: el mismo salt da el mismo secreto.'
      : '✗ NO ESTABLE: el secreto cambia. Esta vía no sirve para envolver nada.',
    otra === window.__primero ? 'ok' : 'mal',
  )
})

document.getElementById('contraprueba').addEventListener('click', async () => {
  const otro = await derivar(SALT_OTRO, 'secreto con OTRO salt')
  if (!otro || !window.__primero) return
  // Sin esto, un verde en el paso 3 no distinguiría "deriva de verdad" de
  // "devuelve siempre la misma constante", que es exactamente el error que
  // haría inútil todo lo anterior.
  log(
    otro !== window.__primero
      ? '✓ CORRECTO: otro salt da otro secreto, así que se deriva de verdad.'
      : '✗ SOSPECHOSO: dos salts distintos dan el MISMO secreto. No es un PRF.',
    otro !== window.__primero ? 'ok' : 'mal',
  )
})

document.getElementById('limpiar').addEventListener('click', async () => {
  await chrome.storage.local.remove(CLAVE)
  delete window.__primero
  salida.replaceChildren()
  log('Borrado. El paso 1 empieza de cero.', 'nota')
})
