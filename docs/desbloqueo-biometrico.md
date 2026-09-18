# Desbloqueo biométrico: el diseño, y lo que falta por medir

Documento de trabajo para
[AC23](https://github.com/ProjectEllysia/EllysiaServer/issues/798). Fechado el
**2026-09-18**.

No es todavía un documento de decisión, y conviene decirlo de entrada: **la
decisión depende de un espolón que aún no se ha ejecutado**, el de
[`spikes/webauthn-prf/`](../spikes/webauthn-prf/LEEME.md). Lo que hay aquí es la
arquitectura hasta donde se puede razonar sin medir, y la lista de lo que el
espolón tiene que contestar antes de escribir una línea de la implementación.

Extiende, no reemplaza, a [`sesion-desbloqueada.md`](sesion-desbloqueada.md).

## El problema, que no es el que parece

Desbloquear cuesta ~137 ms. La espera no molesta: **molesta escribir una
contraseña larga varias veces al día**, y esa fricción no se paga en comodidad,
se paga en entropía. Un usuario que teclea su maestra ocho veces al día acaba
eligiendo una maestra más corta, y eso empeora la seguridad real aunque el
diagrama siga igual de bonito.

La invariante que este diseño **no** puede romper, fijada al revisar la sesión:

> La contraseña maestra no se guarda en claro en ninguna parte. Ni en disco, ni
> en memoria más allá de la función que la usa.

## La idea

Que el secreto lo custodie el **sistema operativo**. No es un atajo a la
invariante, es una propiedad distinta: lo que se guarda no queda legible, queda
de forma que sólo se libera tras un gesto que el sistema verifica. Así
desbloquean 1Password y Bitwarden.

La pieza se llama **WebAuthn con la extensión PRF**. Un autenticador de
plataforma —Windows Hello, Touch ID— deriva, a partir de una credencial ligada
al dispositivo y de un *salt* fijo, un secreto reproducible. Con ese secreto se
**envuelve** la `vaultKey` antes de guardarla.

```
                        gesto biométrico
                              │
   Windows Hello ────────────▼──────────► secreto PRF (32 bytes)
                                                │
   disco:  envoltorio = AES-GCM(secreto, vaultKey)
                                                │
                              sin el gesto, esto no se abre
```

Lo que **no** cambia, y es el punto entero:

- La contraseña maestra sigue sin guardarse en ninguna parte.
- El servidor sigue sin ver nada: esto es todo local.
- Lo que se persiste es la clave de **esta** bóveda, envuelta. Rotarla sigue
  siendo un `changePassword`.

## Lo que ya sabemos sin ejecutar el espolón

**WebAuthn no existe en un service worker.** `navigator.credentials` sólo vive
en un documento, y la ceremonia exige además un gesto del usuario. Eso parte el
trabajo en dos procesos y hay que diseñarlo, no descubrirlo:

| Dónde | Qué hace |
|---|---|
| **Popup** (documento) | Pide el gesto, obtiene el secreto PRF |
| **Service worker** | Desenvuelve la `vaultKey` con ese secreto y sigue como hoy |

El secreto cruza entre los dos por `chrome.runtime.sendMessage`, dentro de la
extensión y sin pasar por ninguna página. Es la misma frontera que ya cruza la
contraseña maestra hoy, así que no añade superficie nueva — pero conviene que
esté dicho y no supuesto.

## Lo que el espolón tiene que contestar

1. **¿Puede una página `chrome-extension://` hacer WebAuthn?** WebAuthn exige un
   *RP ID* que sea un dominio, y el origen de una extensión no lo es. Si la
   respuesta es no, la salida conocida es hacer la ceremonia en una página de un
   dominio propio —`app.ellysia.es`— abierta en una pestaña, que devuelva el
   secreto por `postMessage`. Eso haría que **la extensión dependiera del
   dominio para desbloquearse**, que es un coste real y cambia la conversación.
2. **¿Está disponible PRF** en el autenticador de la máquina?
3. **¿Es el secreto estable** entre invocaciones y entre reinicios? Sin eso no
   se puede desenvolver mañana lo que se envolvió hoy.

Las tres van con contraprueba, como en el espolón de Argon2id: un verde que
saldría igual sin lo que se está probando no prueba nada.

## Las decisiones que quedarán abiertas aunque el espolón salga bien

**Qué pasa cuando el usuario cambia o retira su factor biométrico.** Si Hello se
reconfigura, el secreto PRF cambia y el envoltorio deja de abrirse. La
consecuencia de diseño es clara y conviene fijarla antes: **la contraseña
maestra sigue siendo el camino primario**, y lo biométrico es un atajo que puede
desaparecer sin pérdida. Un diseño donde perder la huella signifique perder la
bóveda sería inaceptable.

**Qué garantiza realmente el autenticador.** «Windows Hello» cubre huella, cara
y **PIN**, y un PIN de cuatro dígitos no es una huella. Merece saberse qué se
está aceptando, porque el usuario cree que ha activado biometría.

**Cuánto dura un desbloqueo biométrico.** No tiene por qué ser el mismo tiempo
que uno con la maestra. Si el gesto es barato, el tiempo puede ser más corto, no
más largo — que es lo contrario de lo que la comodidad pediría.

**Qué ve un atacante con acceso al perfil.** Hoy se lleva la bóveda cifrada y
necesita la maestra. Con esto se lleva además un envoltorio que, en teoría, sólo
su dueño abre. Hay que comprobar que es así y no razonarlo: es exactamente la
clase de propiedad que se da por buena y luego resulta depender de una
configuración del equipo.

## Estado

**Bloqueado en el espolón.** Hasta que se ejecute en Chrome real y con las
contrapruebas, esto es una arquitectura razonada, no una decisión tomada, y no
debería implementarse nada.
