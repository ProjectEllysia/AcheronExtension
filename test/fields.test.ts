/**
 * De dónde salen el identificador y la contraseña que se rellenan.
 *
 * Lo que esta suite vigila no es tanto el resultado como la PROCEDENCIA: que
 * los dos campos se deduzcan del catálogo y no estén escritos a mano, que es el
 * criterio de cierre de #485.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loginFieldsOf } from '../src/background/fields.ts'

/** El catálogo real, copiado aquí para fijar el caso que hoy importa. */
const SCHEMA = [
  {
    category: 'accounts',
    matchKey: 'domain',
    fields: [{ key: 'username' }, { key: 'domain' }, { key: 'password', secret: true as const }],
  },
  {
    category: 'securenotes',
    fields: [{ key: 'content' }],
  },
]

test('en una cuenta, la contraseña es el campo secreto', () => {
  assert.equal(loginFieldsOf(SCHEMA, 'accounts').secretKey, 'password')
})

test('en una cuenta, el identificador es el no secreto que no es el comparable', () => {
  assert.equal(loginFieldsOf(SCHEMA, 'accounts').identityKey, 'username')
})

test('un tipo sin campos secretos no aporta contraseña', () => {
  assert.deepEqual(loginFieldsOf(SCHEMA, 'securenotes'), {
    identityKey: 'content',
    secretKey: null,
  })
})

test('una categoría desconocida no inventa campos', () => {
  assert.deepEqual(loginFieldsOf(SCHEMA, 'nada'), { identityKey: null, secretKey: null })
})
