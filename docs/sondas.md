# Lo que falta comprobar en Chrome real

El documento de decisión de la sesión se apoya en el comportamiento **documentado** de las APIs de
Chrome, no en el medido, y lo dice él mismo. Antes de dar por buena la extensión hay dos
comprobaciones pendientes. No son formalidades: si alguna falla, la decisión de dónde vive la bóveda
abierta hay que revisarla entera.

La disciplina es la del espolón de [#482](https://github.com/ProjectEllysia/EllysiaServer/issues/482),
que es lo que hizo que su resultado valiera: **cada comprobación lleva su contraprueba**. Un verde
que saldría igual sin la protección que se está probando no prueba nada.

## Sonda 1 — `chrome.storage.session` no toca el disco

**Qué hay que ver.** Que un valor guardado ahí no aparece en el directorio del perfil, y que se
vacía al cerrar el navegador.

1. Con la extensión cargada, desbloquear la bóveda.
2. Desde la consola del service worker, guardar un valor reconocible:
   `chrome.storage.session.set({ sonda: 'ACHERON-SONDA-9F3A' })`.
3. Buscar esa cadena en el directorio del perfil de Chrome (`grep -r` sobre `Default/`). **No debe
   aparecer.**
4. Cerrar el navegador entero, reabrirlo y comprobar que `chrome.storage.session.get('sonda')` viene
   vacío, y que la bóveda pide desbloqueo.

**Contraprueba.** Repetir el paso 2 con `chrome.storage.local.set` y volver a buscar. Esta vez la
cadena **sí** debe aparecer en disco. Si no aparece, la búsqueda está mal hecha y el verde del paso
3 no significa nada.

## Sonda 2 — `TRUSTED_CONTEXTS` bloquea de verdad a un content script

**Qué hay que ver.** Que un script corriendo en una página cualquiera no puede leer el almacén de
sesión.

1. Con la bóveda desbloqueada, abrir una página `https` cualquiera.
2. Desde la consola de la extensión, inyectar en esa pestaña un intento de lectura:
   `chrome.scripting.executeScript({ target: { tabId }, func: () => chrome.storage.session.get(null) })`.
3. El intento **debe fallar**, y hay que anotar **con qué error exacto**.

**Contraprueba.** Repetir con el nivel de acceso por defecto —sin llamar a `setAccessLevel`— y
comprobar que entonces **sí** lee. Sin esto, un fallo en el paso 3 podría venir de cualquier otra
cosa (la pestaña equivocada, un permiso que falta) y se estaría celebrando un error accidental.

## Cómo anotar el resultado

Igual que se hizo en #482: pegar la salida literal de las dos mitades, la que pasa y la que falla.
Un resumen en prosa de un resultado que nadie puede releer no es evidencia.
