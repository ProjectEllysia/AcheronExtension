/**
 * Qué campo de un storable es la contraseña y cuál el identificador de acceso.
 *
 * El criterio de cierre de #485 dice, con todas las letras, que «la extensión
 * no contiene ningún nombre de campo escrito a mano». Así que ni `password` ni
 * `username` aparecen aquí como literales: los dos los declara el catálogo.
 *
 * - **La contraseña** es el campo con `secret`. `schema/README.md` de
 *   AcheronCore ya decía que esa marca existe, entre otras cosas, porque «la
 *   extensión de navegador necesita saber cuál es el campo de contraseña para
 *   autocompletarlo sin mostrarlo en claro». Es literalmente para esto.
 * - **El identificador** es `identityKey`, la marca que introdujo
 *   [AC22](https://github.com/ProjectEllysia/EllysiaServer/issues/794).
 *
 * Hasta la 2.3.0 del catálogo, `identityKey` no existía y este fichero lo
 * deducía por descarte: el primer campo que no fuera secreto ni comparable.
 * Daba el resultado correcto, pero dependía del ORDEN de los campos y de que
 * nunca apareciera un segundo campo no secreto, así que se habría roto en
 * silencio —rellenando el campo equivocado— al crecer el catálogo. Ahora no se
 * deduce nada: o el esquema lo declara, o no se rellena.
 */

import type { SchemaType } from '@projectellysia/acheron-core-js'

/** Los dos campos que hacen falta para rellenar un formulario de acceso. */
export interface LoginFields {
  /** Campo con el identificador de acceso, o `null` si el tipo no declara uno. */
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
export function loginFieldsOf(schema: readonly SchemaType[], category: string): LoginFields {
  const type = schema.find((candidate) => candidate.category === category)
  if (!type) return { identityKey: null, secretKey: null }

  return {
    identityKey: type.identityKey ?? null,
    secretKey: type.fields.find((field) => field.secret === true)?.key ?? null,
  }
}
