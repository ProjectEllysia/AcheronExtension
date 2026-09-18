# Acheron Extension — guía operativa

La superficie pública y el porqué de cada permiso están en [`README.md`](README.md). Esto es lo
operativo: qué comandos hay, dónde va cada cosa y qué muerde.

## Comandos

```bash
npm test          # tipos + las suites de test/. Es lo que corre CI
npm run typecheck # sólo tipos
npm run dev       # dist/ con recarga en caliente
npm run build     # dist/ de producción
npm run zip       # el paquete para la Chrome Web Store
```

Node 24+ y un `NPM_TOKEN` con `read:packages` (ver README). Sin el token, `npm install` falla en el
motor criptográfico y no falla en nada más, que despista.

## Dónde va cada cosa

| Quiero… | Dónde |
|---|---|
| Tocar criptografía o añadir un tipo de storable | **En este repositorio, en ningún sitio.** Va a `AcheronCore` |
| Cambiar cuándo una credencial corresponde a una página | `src/background/matching.ts` + su suite |
| Cambiar de qué campo salen usuario y contraseña | **En el esquema de AcheronCore**, no aquí: `identityKey` y `secret`. `src/background/fields.ts` sólo los lee |
| Tocar dónde vive o cuánto dura la bóveda abierta | `src/background/session.ts`, y **antes** `docs/sesion-desbloqueada.md` |
| Hablar con la API de Ellysia | `src/background/auth.ts` (`apiFetch` sale de ahí) |
| Añadir una operación que el popup pide | `src/shared/messages.ts` y el `switch` de `service-worker.ts` |
| Tocar lo que ocurre dentro de la página del usuario | `src/content/autofill.ts` |
| Un permiso nuevo del manifiesto | `src/manifest.config.ts`, con el motivo escrito al lado |

## Arquitectura en una frase

El service worker es el único proceso con claves; el popup pregunta y pinta; el rellenador recibe
dos cadenas y no sabe nada más.

## Cosas que muerden

- **El service worker se muere.** No hay estado en variables de módulo: cada mensaje reconstruye lo
  que necesita desde `chrome.storage.session`. Guardar la bóveda en una variable funciona durante
  treinta segundos y falla después, que es la peor forma de fallar.
- **`setTimeout` no sirve para el bloqueo**, por lo mismo. Es `chrome.alarms`.
- **`autofill.ts` no puede importar nada en tiempo de ejecución.** Lo inyecta
  `chrome.scripting.executeScript`, que carga un script clásico y no un módulo. Importar tipos está
  bien —se borran al compilar—; importar valores rompe la extensión en la página del usuario, no en
  la construcción.
- **La CSP quiere `'wasm-unsafe-eval'`, y sólo ésa.** El mensaje de error de Chrome sugiere
  `wasm-eval` y `unsafe-eval`: la primera es un residuo y la segunda está prohibida en MV3, así que
  ponerla hace que Chrome rechace la extensión entera.
- **`VITE_ELLYSIA_API_URL` entra en el manifiesto.** Cambiarla obliga a reconstruir *y* a recargar la
  extensión en `chrome://extensions`; recargar la página no basta.
- **El catálogo se recibe, no se importa**, en `matching.ts` y `fields.ts`. Es lo que permite que sus
  suites corran sin instalar el motor. Si alguien mete ahí un `import` del paquete, CI deja de poder
  probar la regla de dominios sin tocar GitHub Packages.
- **`@projectellysia/acheron-core-js` se fija a una versión exacta, sin rangos.** En un contrato que
  decide qué campos se cifran, una actualización automática es un cambio que nadie revisó.

## Deuda conocida

Ninguna pendiente. Las tres que había —los tipos del paquete sin reexportar, el `schema.d.ts`
publicado que era un tipo inferido, y la falta de una marca para el identificador de acceso— se
cerraron en el catálogo 2.3.0, y este repositorio las consume en vez de compensarlas: ya no hay
`vault-json.ts` ni deducción por descarte.
