/**
 * La regla de correspondencia entre una página y una credencial.
 *
 * Es lo que más merece una suite en todo el repositorio, y no porque sea
 * complicado: porque el precio de equivocarse no es simétrico. Una coincidencia
 * de menos hace que el usuario copie y pegue; una de más entrega una contraseña
 * a un sitio que no debía recibirla.
 *
 * La regla, fijada en #484: host exacto, sin subdominios, sólo `https`.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchableTypes, matchesHost, pageHost, storedHost } from '../src/background/matching.ts'

const ACCOUNT = { category: 'accounts', matchKey: 'domain' }

test('el catálogo sólo aporta los tipos que declaran campo comparable', () => {
  const schema = [ACCOUNT, { category: 'creditcards' }, { category: 'securenotes' }]
  assert.deepEqual(matchableTypes(schema), [{ category: 'accounts', matchKey: 'domain' }])
})

test('el host de la página sale sólo de una URL https', () => {
  assert.equal(pageHost('https://github.com/login'), 'github.com')
  assert.equal(pageHost('https://GitHub.com/'), 'github.com')

  // Todo lo demás se descarta sin tener que enumerarlo: http, ficheros
  // locales, las páginas internas de Chrome y las pestañas en blanco.
  assert.equal(pageHost('http://github.com'), null)
  assert.equal(pageHost('file:///C:/tmp/login.html'), null)
  assert.equal(pageHost('chrome://extensions'), null)
  assert.equal(pageHost(undefined), null)
})

test('el campo del storable se acepta con o sin esquema', () => {
  assert.equal(storedHost('github.com'), 'github.com')
  assert.equal(storedHost('  GitHub.com '), 'github.com')
  assert.equal(storedHost('https://github.com/login'), 'github.com')
  assert.equal(storedHost('github.com/login'), 'github.com')

  // Guardado apuntando a un sitio sin cifrar: ofrecerlo sobre https sería
  // adivinar que el usuario quería decir otra cosa.
  assert.equal(storedHost('http://github.com'), null)
  assert.equal(storedHost(''), null)
  assert.equal(storedHost(undefined), null)
  assert.equal(storedHost(42), null)
})

test('coincide el host exacto', () => {
  assert.equal(matchesHost('github.com', { domain: 'github.com' }, 'domain'), true)
  assert.equal(matchesHost('github.com', { domain: 'https://github.com' }, 'domain'), true)
})

test('un subdominio NO coincide, en ninguna de las dos direcciones', () => {
  assert.equal(matchesHost('gist.github.com', { domain: 'github.com' }, 'domain'), false)
  assert.equal(matchesHost('github.com', { domain: 'gist.github.com' }, 'domain'), false)

  // `www` es un subdominio como cualquier otro. Tratarlo aparte sería empezar
  // a hacer excepciones a la regla, y la siguiente excepción ya no sería obvia.
  assert.equal(matchesHost('github.com', { domain: 'www.github.com' }, 'domain'), false)
})

test('un sufijo que no es un dominio propio NO coincide', () => {
  // El ataque clásico contra una comparación por sufijo hecha con `endsWith`.
  assert.equal(matchesHost('notgithub.com', { domain: 'github.com' }, 'domain'), false)
  assert.equal(matchesHost('github.com.evil.example', { domain: 'github.com' }, 'domain'), false)
})

test('un storable sin el campo comparable no coincide con nada', () => {
  assert.equal(matchesHost('github.com', { title: 'Sin dominio' }, 'domain'), false)
  assert.equal(matchesHost('github.com', { domain: '' }, 'domain'), false)
})
