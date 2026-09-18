/**
 * De dónde salen el identificador y la contraseña que se rellenan.
 *
 * Lo que esta suite vigila no es tanto el resultado como la PROCEDENCIA: que
 * los dos campos los declare el catálogo y no estén escritos a mano, que es el
 * criterio de cierre de #485. Desde la 2.3.0 del catálogo tampoco se deducen:
 * el esquema los declara o no se rellena.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SchemaType } from '@projectellysia/acheron-core-web'
import { loginFieldsOf } from '../src/background/fields.ts'

/** El catálogo real, copiado aquí para fijar el caso que hoy importa. */
const SCHEMA: SchemaType[] = [
  {
    kind: 'account',
    category: 'accounts',
    matchKey: 'domain',
    identityKey: 'username',
    fields: [{ key: 'username' }, { key: 'domain' }, { key: 'password', secret: true }],
  },
  {
    kind: 'securenote',
    category: 'securenotes',
    fields: [{ key: 'content' }],
  },
]

test('en una cuenta, la contraseña es el campo secreto', () => {
  assert.equal(loginFieldsOf(SCHEMA, 'accounts').secretKey, 'password')
})

test('en una cuenta, el identificador es el que declara identityKey', () => {
  assert.equal(loginFieldsOf(SCHEMA, 'accounts').identityKey, 'username')
})

test('un tipo sin identityKey no aporta identificador, y no lo adivina', () => {
  // La versión anterior lo deducía por descarte y aquí habría contestado
  // `content`. Que ahora conteste `null` es el cambio entero: sin marca no se
  // rellena, en vez de rellenar el campo que parezca.
  assert.equal(loginFieldsOf(SCHEMA, 'securenotes').identityKey, null)
})

test('un tipo sin campos secretos no aporta contraseña', () => {
  assert.equal(loginFieldsOf(SCHEMA, 'securenotes').secretKey, null)
})

test('una categoría desconocida no inventa campos', () => {
  assert.deepEqual(loginFieldsOf(SCHEMA, 'nada'), { identityKey: null, secretKey: null })
})
