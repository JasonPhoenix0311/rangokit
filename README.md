# Rangokit

Simulador abierto de electroneumática que encuentra la falla y explica cómo corregirla.

Rangokit no solo muestra por dónde pasan la corriente y el aire. Prueba el circuito contra lo que pide la práctica, localiza el primer punto interrumpido y entrega ayuda gradual: una pista, el componente y la corrección.

> **Estado:** demo de concepto. Incluye una sola práctica y un circuito fijo. No sustituye la revisión de una instalación real.

## Qué incluye

- Práctica 01: retorno automático con enclavamiento.
- Simulación por pasos de relé, sensor, válvula 5/2 y cilindro de doble efecto.
- Animación de corriente y aire, con modo paso a paso.
- Cualquier cable o manguera se puede soltar para probar el diagnóstico.
- Pistas generadas con reglas verificables. Esta versión no usa IA.
- Si las reglas no explican la falla, lo dice y sugiere qué medir.
- **Editor de proyectos (beta):** arma tu propio sistema neumático, electroneumático o con Arduino Uno. El catálogo se filtra por tipo de sistema, categoría y texto. La revisión detecta errores de cableado, como 24 V en un pin del Arduino o un cortocircuito. La tabla de pines se configura sola según lo que conectes y genera el sketch para el Arduino IDE. Los proyectos se guardan en el navegador y se exportan como archivo.
- **Edición rápida:** clic derecho sobre un componente para girarlo, cambiar el color de un LED o el valor de una resistencia, duplicarlo o borrarlo. Atajos: R gira, Mayús+R gira al revés, Supr borra y las flechas mueven.
- **Resistencias de cualquier valor.** Cuando falta una o su valor es incorrecto, la revisión calcula cuál necesitas con la ley de Ohm, sugiere el valor comercial y te deja agregarla con un botón.
- **Ejecutar en tiempo real:** el botón ▶ Ejecutar simula tu proyecto. Mantienes presionados los pulsadores con el mouse, accionas palancas y mueves potenciómetros, y ves los cables con 24 V o 5 V, el aire en las mangueras, los cilindros moviéndose, los relés y LED encendidos y el Arduino ejecutando tus reglas. La pestaña Ejecución muestra los pines en vivo, los eventos y las simplificaciones del modelo.
- **Rango, el analista:** lee tu proyecto y te dice qué parece que quieres lograr y qué te falta. Si pegas el enunciado de tu tarea, reconoce el tipo de problema y te ayuda paso a paso: pista, componentes, conexiones y ejemplo completo. Si no reconoce el problema, lo dice y te hace preguntas.
- **Platicar con Rango:** una conversación donde explicas tu problema con tus palabras. Rango te dice qué entendió, te pregunta solo lo que le falta (qué se mueve, qué lo activa, cuándo regresa, con qué lo controlas), te explica las opciones si no sabes qué contestar y te propone el proyecto con sus componentes, extras y siguientes pasos. Si no tiene un ejemplo para lo que pides, lo dice. Corre en tu navegador, sin IA generativa: sus respuestas están redactadas de antemano y no entiende preguntas fuera de tema.
- **Aprendizaje automático:** Rango reconoce el problema con un clasificador Naive Bayes que corre en tu navegador. Cuando confirmas su respuesta o eliges otro problema, aprende de tu enunciado y reconoce mejor los siguientes. Lo aprendido se guarda solo en tu navegador y se puede borrar. El modelo solo reconoce el tipo de problema: los errores de cableado los siguen decidiendo reglas fijas.
- **Proyectos en la red:** Rango busca en GitHub proyectos parecidos al problema reconocido, los ordena por parecido y popularidad, y aprende cuáles te sirvieron.

## Uso

Úsalo en línea en **https://jasonphoenix0311.github.io/rangokit/**, o abre `dist/index.html` en un navegador. No necesita instalación ni conexión.

La página no pide cuentas ni envía tus datos a ningún servidor. Tus proyectos y lo que aprende Rango se guardan solo en tu navegador.

La única conexión externa es opcional: la búsqueda de proyectos en GitHub. Se hace solo cuando presionas el botón y envía únicamente las palabras de búsqueda que ves en pantalla, nunca tu enunciado ni tu proyecto. Los proyectos encontrados no están revisados por Rangokit.

### Publicar tu propia copia

Cualquier escuela o docente puede alojar su propia copia:

1. Haz un fork del repositorio en GitHub.
2. En **Settings → Pages**, elige **GitHub Actions** como origen.
3. Cada cambio en `main` corre las pruebas y publica `dist/index.html`.

También puedes subir `dist/index.html` a cualquier servidor web. Si lo modificas y lo ofreces en línea, la AGPL te pide publicar tu código. Para eso pon la dirección de tu repositorio en el campo `repository` de `package.json`, y el build la enlaza en el pie de página.

Para modificarlo, instala Node.js 20 o superior:

```bash
npm test
npm run build
```

## Estructura

| Ruta | Contenido |
|---|---|
| `src/engine.js` | Grafo de conexiones y búsqueda de interrupciones |
| `src/practices/p01.js` | Circuito, simulación y diagnóstico de la práctica |
| `src/ui.js` | Plano interactivo de la práctica |
| `src/editor/` | Editor de proyectos: catálogo, modelo, revisión, Arduino e interfaz |
| `test/` | Pruebas del motor y del editor |
| `scripts/build.mjs` | Genera un solo archivo HTML, sin dependencias |

## Cómo funciona el diagnóstico

1. El circuito se modela como aristas: cables, contactos y mangueras.
2. La práctica define el comportamiento esperado y una cadena de elementos por cada etapa.
3. Se ejecuta un ciclo completo.
4. En la primera etapa que no cumple, el motor recorre la cadena hasta encontrar el primer elemento abierto.
5. Si la cadena está completa y la etapa aun así falla, no adivina: reporta que no pudo determinar la causa y muestra las lecturas de cada punto del tramo.

La simulación usa velocidad constante, sin caída de presión y con válvula de mando directo.

## Contribuir

Las prácticas y fallas reales de laboratorio son lo más valioso. Lee [CONTRIBUTING.md](CONTRIBUTING.md) para saber cómo reportarlas o agregarlas. Los problemas de seguridad se reportan en privado, como explica [SECURITY.md](SECURITY.md). Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md).

## Licencia

Copyright (C) 2026 Erick Ramirez.

Distribuido bajo la [GNU AGPL 3.0](LICENSE). Puedes usar, estudiar, modificar y vender este software. Si distribuyes una versión modificada o la ofreces como servicio en red, debes publicar su código bajo la misma licencia.
