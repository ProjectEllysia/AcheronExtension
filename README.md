# Acheron Extension

La extensión de navegador de Acheron: rellena las credenciales de la bóveda en la página que el
usuario está viendo, descifrándolas en su propio navegador.

Acheron es la bóveda de credenciales de Ellysia. El servidor es *zero-knowledge*: guarda un blob
cifrado que no sabe leer, y la contraseña maestra nunca sale del cliente. Esta extensión no cambia
nada de eso —sólo añade un cliente más—, y por eso **no contiene criptografía propia**: la toma de
[`AcheronCore`](https://github.com/ProjectEllysia/AcheronCore), igual que la SPA y que la app
Android. Ese era el objetivo del proyecto entero: llegar hasta aquí sin escribir una tercera copia
del motor ni una quinta del catálogo.

## Qué hay aquí, y qué no

| | |
|---|---|
| **Criptografía** | Ninguna. Viene de `@projectellysia/acheron-core-web`, versión exacta |
| **Catálogo de tipos** | Ninguno. Viene del mismo paquete, que lo trae dentro |
| **Nombres de campo** | Ninguno escrito a mano. Se deducen del catálogo ([`fields.ts`](src/background/fields.ts)) |
| **Lo propio de este repositorio** | El manifiesto MV3, el ciclo de vida de la sesión, la regla de correspondencia página↔credencial y el rellenador |

Si alguna vez hace falta tocar cripto o añadir un tipo de storable, el sitio es `AcheronCore`, no
este repositorio. Un cambio criptográfico hecho aquí sería, por definición, un cambio que la app
Android no conoce.

## Cómo funciona, de un vistazo

```
popup  ──mensaje──▶  service worker  ──credencial──▶  rellenador (página)
                          │
                          ├── chrome.storage.session   la bóveda abierta (memoria)
                          └── api.ellysia.es           el blob cifrado
```

El **service worker** es el único proceso con claves y texto en claro. El **popup** pregunta y
pinta. El **rellenador** se inyecta en la página sólo cuando el usuario pulsa «Rellenar», recibe
dos cadenas y no tiene acceso ni a la bóveda ni al almacén de sesión.

Tres decisiones sostienen la seguridad del conjunto, y las tres están razonadas en
[`docs/sesion-desbloqueada.md`](docs/sesion-desbloqueada.md):

1. **La bóveda abierta vive en memoria y nunca en disco.** `chrome.storage.session` con
   `TRUSTED_CONTEXTS`, jamás `storage.local` ni IndexedDB.
2. **El origen lo decide el proceso privilegiado.** El host sale de `chrome.tabs`, no de quien pide
   el relleno, y se vuelve a comprobar antes de descifrar.
3. **Rellenar exige un gesto.** No hay `content_scripts` en el manifiesto: nada corre en una página
   hasta que el usuario pulsa un botón.

## Requisitos

- **Node 24+.** Ejecuta TypeScript directamente, y de ahí que las suites de `test/` no compilen nada.
- **Acceso al paquete.** `@projectellysia/acheron-core-web` está en GitHub Packages y hoy sigue
  publicado como **privado**, y su repositorio vinculado sigue siendo el archivado
  `AcheronCoreWeb` aunque las versiones salgan ya de `AcheronCore`. Hace falta un token con
  `read:packages` en la variable `NPM_TOKEN`:

  ```bash
  gh auth refresh -s read:packages
  export NPM_TOKEN=$(gh auth token)
  ```

## Desarrollo

```bash
cp .env.example .env        # apunta VITE_ELLYSIA_API_URL a tu API
npm install
npm test                    # tipos + las reglas de correspondencia y de campos
npm run dev                 # construye en dist/ y recarga en caliente
```

Y luego, en Chrome: `chrome://extensions` → modo desarrollador → **Cargar descomprimida** → elegir
`dist/`.

La URL de la API entra en `host_permissions`, que MV3 exige declarar de forma estática. Cambiarla
obliga a reconstruir **y a recargar la extensión**, y eso es correcto: es un cambio de permisos, no
de configuración.

## El manifiesto, línea por línea

Cada permiso está aquí porque algo concreto lo necesita. Lo que no aparece es tan deliberado como lo
que aparece:

| Declaración | Por qué |
|---|---|
| `'wasm-unsafe-eval'` en la CSP | Argon2id es WebAssembly. **Sólo** esta directiva sirve: `unsafe-eval` está prohibido en MV3 y `wasm-eval` es un residuo, aunque el mensaje de error de Chrome sugiera las dos |
| `service_worker` con `type: module` | Lo fijó el espolón de viabilidad, y obliga a empaquetar: un worker de tipo módulo no resuelve especificadores desnudos |
| `storage` | La sesión desbloqueada, en memoria |
| `alarms` | El bloqueo por inactividad. No vale `setTimeout`: el worker se recicla y se lo llevaría |
| `idle` | Bloquear la bóveda cuando el usuario bloquea su equipo |
| `activeTab` + `scripting` | Acceso a la pestaña **sólo** mientras el popup está abierto, e inyección del rellenador bajo demanda |
| `host_permissions` | Únicamente la API de Ellysia |
| **Ningún `content_scripts`** | Declararlo haría correr código en todas las páginas desde el arranque. Es lo que hace una extensión de autocompletado al uso, y es justo lo que el diseño de la sesión excluye |
| **Ningún permiso sobre `https://*/*`** | No hace falta: `activeTab` lo concede el gesto del usuario, y se acaba con la pestaña |

## Estado

Esto cierra [AC18](https://github.com/ProjectEllysia/EllysiaServer/issues/485), la última issue del
proyecto [Acheron — Motor compartido y extensión web](https://github.com/orgs/ProjectEllysia/projects/6),
hasta el punto que esa issue marca: la extensión cargada sin empaquetar. Quedan fuera, con issues
propias, la publicación en la Chrome Web Store y el soporte de Firefox.

Lo que **todavía no se ha verificado en Chrome real** está listado en
[`docs/sondas.md`](docs/sondas.md). Son dos comprobaciones que el documento de diseño dejó
pendientes a propósito, y hasta que se hagan, este README describe un diseño y no una medición.
