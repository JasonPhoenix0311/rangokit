# Rangokit

Simulador abierto de electroneumática para estudiantes. Simula el circuito, detecta la falla y da pistas graduales. Usa español de México en la interfaz, documentación y mensajes.

## Comandos

- `npm test`: pruebas del motor.
- `npm run build`: genera `dist/index.html`.

Ejecuta ambos antes de dar un cambio por terminado.

## Estructura

- `src/engine.js`: motor genérico. No debe conocer prácticas específicas.
- `src/practices/`: circuito, simulación y diagnóstico de cada práctica.
- `src/ui.js`, `src/styles.css`, `src/index.template.html`: interfaz de la práctica guiada.
- `src/editor/`: editor de proyectos libres. `catalog.js` (componentes y filtros), `project.js` (modelo y revisión del cableado), `arduino.js` (tabla de pines, revisión y generación del sketch), `calc.js` (ley de Ohm y valores comerciales), `rango.js` (Rango: análisis del proyecto, reconocimiento de problemas y ejemplos verificados), `learn.js` (clasificador Naive Bayes local), `web.js` (búsqueda opcional en GitHub), `sim.js` (simulación en tiempo real de los proyectos libres), `dialog.js` (conversación guiada con Rango) y `ui.js` (interfaz). Estilos en `src/editor.css`.
- Los módulos con librería o protocolo propio usan modos de pin automáticos (`servo`, `trig`, `distance`, `i2c`) declarados en `PIN_MODES` con `auto: true`; `generateSketch` agrega sus librerías.
- Las uniones internas de un componente (columnas y rieles de la protoboard, patas del botón táctil) se declaran con `bus` en `catalog.js`; `internalEdges` (`project.js`) las agrega a las redes y a la simulación.
- Laboratorio de energías renovables: `catalog-energia.js` (componentes, parámetros editables en `energy.params` y tipos de conexión `pot`, `eje` y `agua`) y `energia.js` (balance de potencia por bus, ejes con multiplicadoras, agua con tanques, ambiente, tablero y revisión `reviewEnergy`). `sim.js` llama a `createEnergy` y `stepEnergy`; las simplificaciones están en `ENERGY_SIMPLIFICATIONS` y se muestran en la interfaz. `param(component, key)` en `catalog.js` lee un parámetro con su valor por omisión y sus límites.
- Tutoriales: `tutorial.js` define un proyecto de prueba por sistema con pasos declarativos (agregar, conectar, ajustar, regla, revisar, ejecutar, probar, ambiente y 3D). Cada paso se revisa con una regla (`stepDone`) y los de armado tienen `applyStep` («Hazlo por mí»). Un sistema nuevo necesita su tutorial; la prueba en `test/tutorial.test.js` lo recorre completo, incluida la simulación.
- Vista 3D: `escena3d.js` describe la escena sin WebGL (modelos de cada componente con figuras básicas, acomodo desde el plano, recorrido de conexiones y `pose` a partir de `view(sim)`) y tiene pruebas; `vista3d.js` la dibuja con Three.js y solo lee el estado de la simulación, nunca simula por su cuenta. Todo componente nuevo necesita su caso en `model()` (si no, sale como caja). Three.js es la única dependencia: está copiada en `vendor/` (no se instala con npm), el build la copia a `dist/vendor/` y se carga con `import()` solo al abrir la vista 3D. El build no entiende `import { a as b }`.
- `src/account.js` (cliente de la cuenta de docente, sin DOM) y `src/account-ui.js` (botón y diálogo). El servidor es el de Phoenix Office: rutas `/fenix/v1/rangokit/*` en el repositorio Phoenix-Office.
- `src/plans.js`: configuración central de planes, consulta del plan de una cuenta (`planOf`, `includes`, `canUse`) y migración del campo `plan`. `src/plans-page.js` y `src/plans.css` generan la página estática `/planes`. No hay cobros: toda función nueva de pago se declara con `available: false`.
- `scripts/build.mjs`: une todo en un solo HTML y genera `dist/planes/index.html`. Cada módulo queda en su propio ámbito; un archivo nuevo se agrega a `MODULES` después de sus dependencias.
- `test/`: pruebas del motor y del editor.

## Reglas del proyecto

- La detección de fallas sale de reglas verificables sobre el estado del simulador.
- La IA, cuando exista, solo explicará hallazgos del simulador. Nunca decidirá por sí sola la falla.
- Rango reconoce el tipo de problema con un clasificador Naive Bayes que corre en el navegador (`learn.js`), entrenado con `TRAINING` y con lo que el estudiante confirma. El modelo solo reconoce y ordena; los errores de cableado los deciden reglas fijas. Si la evidencia es poca, Rango dice que no reconoce el problema y hace preguntas.
- Todo ejemplo nuevo de Rango lleva enunciados de entrenamiento, palabras de búsqueda y pruebas que confirmen que se arma sin errores y que funciona en la simulación.
- Privacidad: el enunciado y los proyectos nunca salen del navegador. La cuenta es solo para docentes y opcional: envía únicamente correo, contraseña y códigos de verificación al servidor de DDTEC. El simulador, las prácticas y las pistas nunca piden cuenta. La búsqueda en GitHub es opcional, la inicia el estudiante y solo envía las palabras de búsqueda visibles y editables. Los resultados externos se muestran como enlaces sin verificar.
- Si no se puede determinar la causa, el sistema debe decirlo y sugerir qué medir.
- Toda regla de falla nueva lleva una prueba.
- Las ayudas son graduales: pista, componente y corrección.
- Mantén el proyecto sin dependencias mientras sea posible. La excepción es Three.js para la vista 3D, copiado en `vendor/` y cargado solo al abrirla.
- La simulación debe declarar sus simplificaciones. No prometas que un circuito real funcionará.

## Alcance actual

Versión 0.1: demo de una sola práctica, más un editor de proyectos libres en beta. El editor arma circuitos neumáticos, electroneumáticos, con Arduino Uno (incluidos servo, ultrasónico y pantalla LCD I2C) electrónicos en protoboard y sistemas de energías renovables (potencia, ejes y agua), revisa el cableado con reglas fijas, genera el sketch y simula el proyecto en tiempo real con simplificaciones declaradas en `sim.js` y en la interfaz. El resto del prototipo funcional (diagnóstico de fallas en proyectos libres, 10 a 15 fallas reales y 3 prácticas) depende de la validación con estudiantes y docentes.
