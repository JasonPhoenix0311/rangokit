# Seguridad

Rangokit es una página estática. Los proyectos y lo que aprende Rango se guardan solo en el navegador de quien lo usa. Hay dos conexiones externas, ambas opcionales. La cuenta de docente envía correo, contraseña y códigos de verificación al servidor de DDTEC (`ddtec.com.mx`, rutas `/phoenix/fenix/v1/rangokit/`); la sesión es un token guardado en el navegador que el resto de Phoenix Office no acepta. La otra es la búsqueda en la API pública de GitHub, que envía solo las palabras de búsqueda visibles. Sus resultados se tratan como contenido no confiable: se escapan y se muestran como enlaces.

Si encuentras un problema de seguridad, como código que se pueda inyectar por medio de un enlace o un archivo, no abras un issue público. Repórtalo en privado desde la pestaña **Security** del repositorio, con la opción **Report a vulnerability**.

Incluye los pasos para reproducirlo y qué podría hacer alguien con él. Responderemos en cuanto podamos.
