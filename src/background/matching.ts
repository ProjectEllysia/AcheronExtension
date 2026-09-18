/**
 * Qué credencial corresponde a la página que el usuario está viendo.
 *
 * Aquí NO hay ningún nombre de campo escrito a mano, y ése es el punto entero
 * de la issue que creó `matchKey` (#484): el esquema dice qué campo se compara
 * con la URL, y la extensión se limita a obedecerlo. Codificar «el campo se
 * llama `domain`» reintroduciría por la puerta de atrás justo el acoplamiento
 * que el catálogo compartido existe para eliminar.
 *
 * La regla la fijó esa misma issue y la reafirmó el diseño de la sesión (#483):
 *
 *   **Host exacto, sin subdominios, sólo `https`.**
 *
 * Es deliberadamente estricta. Un criterio laxo ofrece credenciales a un sitio
 * que no debería recibirlas, y el precio de equivocarse no es simétrico: una
 * coincidencia de menos hace que el usuario copie y pegue; una de más entrega
 * una contraseña a quien no es.
 */

/**
 * Este módulo NO importa el catálogo: lo recibe. Así la regla de comparación
 * —que es donde está el riesgo— se prueba con un `node --test` sin necesidad de
 * instalar el motor ni montar un navegador. El catálogo de verdad se lo pasa
 * `vault.ts`, que sí lo importa del paquete.
 */

/** Lo que este módulo necesita saber de un tipo del catálogo. */
export interface CatalogueType {
  category: string
  matchKey?: string
}

/** Un tipo que el esquema declara asociable a una página web. */
export interface MatchableType {
  category: string
  matchKey: string
}

/** Filtra del catálogo los tipos que declaran campo comparable con la URL. */
export function matchableTypes(schema: readonly CatalogueType[]): MatchableType[] {
  return schema
    .filter((type) => type.matchKey != null)
    .map((type) => ({ category: type.category, matchKey: type.matchKey as string }))
}

/**
 * El host contra el que se compara, sacado de la URL de una pestaña.
 *
 * Devuelve `null` para cualquier cosa que no sea una página `https` real. Eso
 * descarta de una vez `http`, `file:`, `chrome://`, `chrome-extension://` y las
 * pestañas en blanco, sin necesidad de enumerarlos.
 *
 * @param url  URL de la pestaña, tal y como la da `chrome.tabs`
 */
export function pageHost(url: string | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  return normalizeHost(parsed.hostname)
}

/**
 * El host que declara un storable en su campo `matchKey`.
 *
 * El usuario escribe ese campo a mano, así que llega de todas las formas
 * imaginables: `github.com`, `https://github.com/login`, `GitHub.com `. Se
 * acepta con o sin esquema, pero lo que se compara es siempre el host.
 *
 * Un valor con esquema `http` se rechaza. Si el usuario guardó la credencial
 * apuntando a un sitio sin cifrar, ofrecerla sobre `https` sería adivinar.
 */
export function storedHost(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'https:') return null
      return normalizeHost(parsed.hostname)
    } catch {
      return null
    }
  }

  // Sin esquema: se interpreta como host, pero pasando por `URL` igualmente
  // para que un `example.com/login` pierda la ruta en vez de no coincidir
  // nunca con nada.
  try {
    return normalizeHost(new URL(`https://${trimmed}`).hostname)
  } catch {
    return null
  }
}

/**
 * ¿Corresponde este storable a esta página?
 *
 * @param host   host de la pestaña, ya normalizado por `pageHost`
 * @param item   storable EN CLARO
 * @param matchKey  campo comparable, según el esquema
 */
export function matchesHost(
  host: string,
  item: Record<string, unknown>,
  matchKey: string,
): boolean {
  const declared = storedHost(item[matchKey])
  return declared !== null && declared === host
}

/**
 * Normaliza un host para compararlo: minúsculas y sin el punto final de un
 * nombre absoluto. No toca `www.`: quitarlo sería aceptar un subdominio, que es
 * exactamente lo que la regla excluye.
 */
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}
