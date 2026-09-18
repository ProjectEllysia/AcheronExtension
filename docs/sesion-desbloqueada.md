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

## Si alguna sonda falla

El diseño se apoya en el comportamiento **documentado** de dos APIs, no medido. Las comprobaciones
pendientes están en [`sondas.md`](sondas.md). Si `chrome.storage.session` dejara rastro en disco o
`TRUSTED_CONTEXTS` no bloqueara de verdad a un content script, la opción del *offscreen document*
vuelve a la mesa y **esta decisión hay que revisarla entera**, no parchearla.
