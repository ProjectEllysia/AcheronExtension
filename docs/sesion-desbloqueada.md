# La sesión desbloqueada: qué se decidió y qué implementa este repositorio

La decisión NO se tomó aquí. Vive en
[`plans/feature/acheron/extension-sesion-desbloqueada.md`](https://github.com/ProjectEllysia/EllysiaServer/blob/main/plans/feature/acheron/extension-sesion-desbloqueada.md)
de `EllysiaServer`, fechada el 2026-09-05, y es el resultado de
[#483](https://github.com/ProjectEllysia/EllysiaServer/issues/483). Este documento no la repite: dice
**dónde está cada regla en el código** y **qué se ha decidido después**, que es lo que un documento
en el repositorio de la implementación puede aportar sin quedarse atrás del original.

## Las cinco reglas, y dónde viven

| Regla del diseño | Dónde se cumple |
|---|---|
| La sesión vive en `chrome.storage.session` con `TRUSTED_CONTEXTS`; ni `storage.local`, ni IndexedDB, ni `localStorage` | [`session.ts`](../src/background/session.ts) — `hardenSessionStorage`, `loadSession`, `saveSession` |
| Se guarda la `vaultKey` desenvuelta y un instante de último uso. Nunca la contraseña maestra | [`vault.ts`](../src/background/vault.ts) — `unlock`. La maestra muere en esa función |
| Todo el descifrado ocurre en el service worker; el rellenador recibe valores, nunca claves | [`service-worker.ts`](../src/background/service-worker.ts) — `fill`, y [`autofill.ts`](../src/content/autofill.ts), que no importa nada de cripto |
| Rellenar exige gesto, coincidencia de origen resuelta en el proceso privilegiado, y nada de iframes de origen distinto | El gesto: no hay `content_scripts` en el manifiesto. El origen: `pageHost(tab.url)` en el worker y de nuevo en `reveal`. Los iframes: `window.top !== window` en el rellenador |
| Bloqueo por inactividad a los 15 minutos, más `chrome.idle` en `locked`, más bloqueo manual. Configurable con techo | [`session.ts`](../src/background/session.ts) — `armLockAlarm`, `registerLockTriggers`, `lockMinutes` |

Dos detalles de implementación que el diseño no podía prever y conviene dejar escritos:

- **El temporizador es `chrome.alarms`, no `setTimeout`.** El worker se recicla y se llevaría el
  temporizador por delante, dejando la bóveda abierta sin nadie que la cierre. Es el mismo problema
  que motiva el documento entero, reapareciendo en el mecanismo que lo resuelve.
- **`loadSession` comprueba la caducidad además de confiar en la alarma.** El worker puede despertar
  por un mensaje antes de que la alarma se dispare, y en ese hueco una sesión vencida seguiría
  siendo utilizable.

## Lo que este repositorio ha decidido de más

El documento de #483 decide dónde vive **la bóveda abierta**. No decide dónde vive **la sesión con
el servidor**, que es otra cosa, y la extensión necesita las dos. Queda decidido aquí, y se señala
en vez de esconderse porque nadie lo revisó todavía:

> **El *refresh token* se guarda en `chrome.storage.local`, es decir, en disco.** El *access token*
> va a `storage.session`, como todo lo demás.

Las razones, y el precio:

- Lo que ese token abre es **el blob cifrado, no la bóveda**. Quien lo robe se descarga ciphertext y
  no puede leer una sola credencial sin la contraseña maestra, que el servidor nunca ha visto.
- Es **la misma exposición que ya tiene la SPA**, que guarda su sesión en `localStorage`. La
  extensión no introduce una superficie nueva para el usuario que use las dos.
- La alternativa —mandarlo también a `storage.session`— obliga a **teclear usuario y contraseña en
  cada arranque del navegador**, además de la maestra. Dos secretos por arranque es la clase de
  fricción que empuja a la gente hacia contraseñas maestras más cortas, y eso empeora la seguridad
  real aunque mejore la del diagrama.

El precio, dicho entero: alguien con acceso al perfil de Chrome puede **descargarse la bóveda
cifrada** y atacarla sin prisa, fuera de línea. Argon2id con 64 MiB y 3 pasadas es lo que separa eso
de un robo de credenciales, y es una defensa real, pero es *la* defensa. Cambiar la decisión cuesta
un `local` → `session` en [`auth.ts`](../src/background/auth.ts).

### Revisada y aceptada — 2026-09-18

La decisión se revisó y **se mantiene**. El motivo es el de arriba, dicho en corto: sin ella, el
usuario tendría que escribir su usuario y su contraseña de Ellysia cada vez que enciende el
ordenador, además de la maestra.

La revisión fijó además el límite que no se cruza, y conviene que esté escrito porque es más
estricto que «no guardar la maestra en disco»:

> **La contraseña maestra no se guarda en claro en ninguna parte.** Ni en disco, ni en memoria más
> allá de la función que la usa.

Eso ya se cumple hoy, y no por casualidad. La maestra entra por el formulario del popup, viaja al
service worker, se usa para derivar la clave y **muere en `unlock()`**; el campo del formulario se
vacía en cuanto deja de hacer falta. Lo que sobrevive es la `vaultKey`, que es otra cosa: abre esta
bóveda y nada más, y rotarla es un `changePassword`. Una maestra filtrada, en cambio, abre además
el correo del usuario, porque las contraseñas se reutilizan.

### La puerta que queda abierta: desbloqueo biométrico

Lo único que podría justificar guardar algo más duradero es que estuviera **protegido por el
sistema operativo**: Windows Hello, Touch ID o el equivalente de cada plataforma. Es como
desbloquean 1Password y Bitwarden, y no es un atajo sino una propiedad distinta — el secreto no
está «guardado en claro», está guardado de forma que sólo se libera tras un gesto que el sistema
verifica.

La vía técnica existe y tiene nombre: **WebAuthn con la extensión PRF**. Un autenticador de
plataforma —que en Windows es Hello— deriva un secreto estable y reproducible, y con él se
*envuelve* la `vaultKey` antes de guardarla. En disco no queda la clave sino un envoltorio que sin
el gesto biométrico no se abre.

No se ha implementado, y no debería colarse como un cambio pequeño: **altera la decisión de este
documento**, porque introduce persistencia en disco de material criptográfico, y eso merece su
propio análisis. En particular, hay que responder qué pasa cuando el usuario cambia o retira su
factor biométrico, y qué garantiza realmente el autenticador en cada plataforma. Merece una issue
propia con un espolón, como se hizo con Argon2id en MV3.

## Si alguna sonda falla

El diseño se apoya en el comportamiento **documentado** de dos APIs, no medido. Las comprobaciones
pendientes están en [`sondas.md`](sondas.md). Si `chrome.storage.session` dejara rastro en disco o
`TRUSTED_CONTEXTS` no bloqueara de verdad a un content script, la opción del *offscreen document*
vuelve a la mesa y **esta decisión hay que revisarla entera**, no parchearla.
