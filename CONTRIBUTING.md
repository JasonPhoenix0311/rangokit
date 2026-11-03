# Cómo contribuir

Las contribuciones más útiles ahora son prácticas reales y fallas comunes.

Al participar aceptas seguir el [código de conducta](CODE_OF_CONDUCT.md).

## Reportar una falla

Abre un issue con el enunciado, el circuito, qué esperabas, qué ocurrió y cuál fue la causa real. No incluyas datos personales ni material de examen.

## Preparar tu entorno

Solo necesitas Node.js 20 o superior. El proyecto no tiene dependencias, así que no hace falta `npm install`.

```bash
git clone <tu fork>
cd rangokit
npm test
npm run build
```

Abre `dist/index.html` en el navegador para ver tus cambios.

## Enviar un cambio

1. Crea una rama a partir de `main`.
2. Haz el cambio y agrega sus pruebas.
3. Ejecuta `npm test` y `npm run build`, e incluye `dist/index.html` en el commit.
4. Abre un pull request y llena la lista de revisión.

Cada pull request corre las pruebas y revisa que `dist/index.html` esté al día.

## Estilo

- Textos de la interfaz, documentación y mensajes en español de México.
- Sin dependencias externas, mientras sea posible.
- El motor (`src/engine.js`) no debe conocer ninguna práctica en particular.

## Agregar una regla

1. Agrega una prueba en `test/` que reproduzca la falla.
2. Agrega la etapa y sus textos en la práctica.
3. Ejecuta `npm test` y `npm run build`.

Una regla debe basarse en un estado medible del simulador. Si no se puede determinar la causa, el sistema debe decirlo y sugerir qué medir. Las explicaciones deben enseñar a diagnosticar y no solo entregar la respuesta.

Al enviar una contribución aceptas publicarla bajo la licencia AGPL-3.0 del proyecto.
