# Espolón: ¿puede Windows Hello guardar la `vaultKey`?

Desechable, como el de Argon2id en MV3. No es una implementación a medias: es un
instrumento para responder una pregunta, y se tira cuando la haya respondido.

Trabaja para [AC23](https://github.com/ProjectEllysia/EllysiaServer/issues/798).

## La pregunta

Hoy el usuario teclea su contraseña maestra cada vez que la bóveda se bloquea.
Se querría que Windows Hello —o Touch ID— bastara, **sin guardar la maestra en
ninguna parte**, que es la invariante que no se toca.

La idea es que el sistema operativo entregue un secreto reproducible y que con
él se *envuelva* la `vaultKey`: en disco quedaría un envoltorio que sin el gesto
biométrico no se abre. Eso es WebAuthn con la extensión **PRF**.

## Lo que hay que averiguar, en orden

**1. ¿Puede una página `chrome-extension://` hacer WebAuthn?** Es la pregunta
que puede matar a las otras dos. WebAuthn exige un *RP ID* que sea un dominio, y
el origen de una extensión no lo es. Si la respuesta es que no, hay que
replantear la arquitectura —ver abajo—, no ajustar parámetros.

**2. ¿Admite PRF el autenticador de la máquina?** Es una extensión opcional.

**3. ¿Es el secreto estable entre invocaciones?** Sin eso no se puede
desenvolver mañana lo que se envolvió hoy, y el plan entero se cae.

## Un resultado que ya tenemos sin ejecutar nada

**WebAuthn no existe en un service worker.** `navigator.credentials` sólo vive
en un documento, y además la ceremonia exige un gesto del usuario. Así que el
descifrado seguirá ocurriendo en el service worker, pero la parte biométrica
tendrá que ocurrir en el popup, y el secreto tendrá que cruzar entre los dos.
Eso ya condiciona el diseño y está en `docs/desbloqueo-biometrico.md`.

## Cómo ejecutarlo

1. `chrome://extensions` → modo desarrollador → **Cargar descomprimida** →
   elegir esta carpeta.
2. Pulsar el icono de la extensión y seguir los cuatro botones **en orden**.
3. Anotar la salida **literal**, la que pasa y la que falla.

Los pasos 3 y 4 son los que hacen que el resultado valga:

- El **paso 3** repite la derivación con el mismo salt. Si el secreto cambia, no
  sirve para envolver nada.
- El **paso 4** es la contraprueba: deriva con un salt distinto y **debe salir
  otro secreto**. Sin ella, un verde en el paso 3 no distinguiría «deriva de
  verdad» de «devuelve siempre la misma constante», que es justo el error que
  dejaría todo lo anterior sin valor.

## Si el paso 1 falla

No es el final, pero sí un diseño distinto y más caro. La salida conocida es
hacer la ceremonia en una página de un **dominio real** que controlemos
—`app.ellysia.es`—, abierta en una pestaña o un iframe, que devuelva el secreto
a la extensión por `postMessage`. Tiene dos consecuencias que habría que tragar:
la extensión pasaría a depender del dominio para desbloquearse, y el secreto
cruzaría una frontera más.

Antes de irse por ahí, conviene anotar el error exacto: `NotAllowedError` y
`SecurityError` apuntan al RP ID, pero no son lo mismo.
