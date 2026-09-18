/**
 * Qué campo de un storable es la contraseña y cuál el identificador de acceso.
 *
 * El criterio de cierre de #485 dice, con todas las letras, que «la extensión
 * no contiene ningún nombre de campo escrito a mano». Así que ni `password` ni
 * `username` aparecen aquí como literales: los dos se DEDUCEN del catálogo.
 *
 * ## La contraseña: `secret`
 *
 * Sale limpia. `schema/README.md` de AcheronCore ya dice que `secret` es
 * propiedad del dato y no de la pantalla, y que existe, entre otras cosas,
 * porque «la extensión de navegador necesita saber cuál es el campo de
 * contraseña para autocompletarlo sin mostrarlo en claro». Es literalmente para
 * esto.
 *
 * ## El identificador: por descarte, y eso es una carencia del esquema
 *
 * Aquí no hay marca. Se deduce quitando el campo comparable con la URL
 * (`matchKey`) y los secretos, y quedándose con el primero que sobre. Para
 * `account` —hoy el único tipo asociable a una web— eso da `username`, que es
 * lo correcto, pero el razonamiento es frágil: depende del ORDEN de los campos
 * y de que no aparezca nunca un segundo campo no secreto.
 *
 * Lo honesto es decir que **al esquema le falta una marca**, hermana de
 * `matchKey`, que declare qué campo es el identificador de acceso. Mientras no
 * exista, esta función es la conjetura mejor razonada posible, y está aislada
 * en un fichero de veinte líneas para que sustituirla sea trivial el día que la
 * marca llegue.
 */

/**
 * Lo que esta función necesita saber de un tipo del catálogo.
 *
 * `secret` se declara `boolean` y no `true` porque es lo que el paquete
 * publica: su `schema.d.ts` no es el que está escrito a mano en AcheronCore
 * —donde sí dice `secret?: true`— sino uno que `tsc` infiere del `.js` y que lo
 * pisa al compilar. Apretar más el tipo aquí sólo consigue que no encaje.
 */
export interface CatalogueType {
  category: string
  matchKey?: string
  fields: readonly { key: string; secret?: boolean }[]
}

/** Los dos campos que hacen falta para rellenar un formulario de acceso. */
export interface LoginFields {
  /** Campo con el identificador de acceso, o `null` si el tipo no tiene. */
  identityKey: string | null
  /** Campo con la contraseña, o `null` si el tipo no guarda ninguna. */
  secretKey: string | null
}

/**
 * Resuelve los campos de acceso de una categoría.
 *
 * Recibe el catálogo en vez de importarlo, por la misma razón que `matching.ts`:
 * así se prueba sin instalar el motor ni levantar un navegador.
 */
export function loginFieldsOf(schema: readonly CatalogueType[], category: string): LoginFields {
  const type = schema.find((candidate) => candidate.category === category)
  if (!type) return { identityKey: null, secretKey: null }

  const secret = type.fields.find((field) => field.secret === true)
  const identity = type.fields.find(
    (field) => field.secret !== true && field.key !== type.matchKey,
  )

  return { identityKey: identity?.key ?? null, secretKey: secret?.key ?? null }
}
