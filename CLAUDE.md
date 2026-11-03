# Rangokit

Simulador abierto de electroneumática para estudiantes. Simula el circuito, detecta la falla y da pistas graduales. Usa español de México en la interfaz, documentación y mensajes.

## Comandos

- `npm test`: pruebas del motor.
- `npm run build`: genera `dist/index.html`.

Ejecuta ambos antes de dar un cambio por terminado.

## Estructura

- `src/engine.js`: motor genérico. No debe conocer prácticas específicas.
- `src/practices/`: circuito, simulación y diagnóstico de cada práctica.
- `src/ui.js`, `src/styles.css`, `src/index.template.html`: interfaz.
- `scripts/build.mjs`: une todo en un solo HTML.
- `test/`: pruebas del motor.

## Reglas del proyecto

- La detección de fallas sale de reglas verificables sobre el estado del simulador.
- La IA, cuando exista, solo explicará hallazgos del simulador. Nunca decidirá por sí sola la falla.
- Si no se puede determinar la causa, el sistema debe decirlo y sugerir qué medir.
- Toda regla de falla nueva lleva una prueba.
- Las ayudas son graduales: pista, componente y corrección.
- Mantén el proyecto sin dependencias mientras sea posible.
- La simulación debe declarar sus simplificaciones. No prometas que un circuito real funcionará.

## Alcance actual

Versión 0.1: demo de una sola práctica. El prototipo funcional (editor, motor general, 10 a 15 fallas reales y 3 prácticas) depende de la validación con estudiantes y docentes.
