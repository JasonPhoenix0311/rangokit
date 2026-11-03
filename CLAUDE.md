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
- `scripts/build.mjs`: une todo en un solo HTML. Cada módulo queda en su propio ámbito; un archivo nuevo se agrega a `MODULES` después de sus dependencias.
- `test/`: pruebas del motor y del editor.

## Reglas del proyecto

- La detección de fallas sale de reglas verificables sobre el estado del simulador.
- La IA, cuando exista, solo explicará hallazgos del simulador. Nunca decidirá por sí sola la falla.
- Rango reconoce el tipo de problema con un clasificador Naive Bayes que corre en el navegador (`learn.js`), entrenado con `TRAINING` y con lo que el estudiante confirma. El modelo solo reconoce y ordena; los errores de cableado los deciden reglas fijas. Si la evidencia es poca, Rango dice que no reconoce el problema y hace preguntas.
- Todo ejemplo nuevo de Rango lleva enunciados de entrenamiento, palabras de búsqueda y pruebas que confirmen que se arma sin errores y que funciona en la simulación.
- Privacidad: el enunciado y los proyectos nunca salen del navegador. La búsqueda en GitHub es opcional, la inicia el estudiante y solo envía las palabras de búsqueda visibles y editables. Los resultados externos se muestran como enlaces sin verificar.
- Si no se puede determinar la causa, el sistema debe decirlo y sugerir qué medir.
- Toda regla de falla nueva lleva una prueba.
- Las ayudas son graduales: pista, componente y corrección.
- Mantén el proyecto sin dependencias mientras sea posible.
- La simulación debe declarar sus simplificaciones. No prometas que un circuito real funcionará.

## Alcance actual

Versión 0.1: demo de una sola práctica, más un editor de proyectos libres en beta. El editor arma circuitos neumáticos, electroneumáticos y con Arduino Uno, revisa el cableado con reglas fijas, genera el sketch y simula el proyecto en tiempo real con simplificaciones declaradas en `sim.js` y en la interfaz. El resto del prototipo funcional (diagnóstico de fallas en proyectos libres, 10 a 15 fallas reales y 3 prácticas) depende de la validación con estudiantes y docentes.
