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

## Uso

Abre `dist/index.html` en un navegador. No necesita instalación.

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

La simulación usa velocidad constante, sin caída de presión y con válvula de mando directo.

## Licencia

Copyright (C) 2026 Mariano Ernesto Ramírez Lozano.

Distribuido bajo la [GNU AGPL 3.0](LICENSE). Puedes usar, estudiar, modificar y vender este software. Si distribuyes una versión modificada o la ofreces como servicio en red, debes publicar su código bajo la misma licencia.
