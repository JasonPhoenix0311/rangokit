# Cómo contribuir

Las contribuciones más útiles ahora son prácticas reales y fallas comunes.

## Reportar una falla

Abre un issue con el enunciado, el circuito, qué esperabas, qué ocurrió y cuál fue la causa real. No incluyas datos personales ni material de examen.

## Agregar una regla

1. Agrega una prueba en `test/` que reproduzca la falla.
2. Agrega la etapa y sus textos en la práctica.
3. Ejecuta `npm test` y `npm run build`.

Una regla debe basarse en un estado medible del simulador. Si no se puede determinar la causa, el sistema debe decirlo y sugerir qué medir. Las explicaciones deben enseñar a diagnosticar y no solo entregar la respuesta.

Al enviar una contribución aceptas publicarla bajo la licencia AGPL-3.0 del proyecto.
