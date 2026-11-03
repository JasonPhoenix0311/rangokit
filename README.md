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

## Uso

Úsalo en línea en **https://jasonphoenix0311.github.io/rangokit/**, o abre `dist/index.html` en un navegador. No necesita instalación ni conexión.

La página no pide cuentas, no guarda tu progreso, no envía datos a ningún servidor y no descarga nada de fuera.

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
| `src/ui.js` | Plano interactivo |
| `test/` | Pruebas del motor |
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

Copyright (C) 2026 Mariano Ernesto Ramírez Lozano.

Distribuido bajo la [GNU AGPL 3.0](LICENSE). Puedes usar, estudiar, modificar y vender este software. Si distribuyes una versión modificada o la ofreces como servicio en red, debes publicar su código bajo la misma licencia.
