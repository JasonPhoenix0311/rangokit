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
- **Electrónica y protoboard:** protoboard de 12 columnas con rieles + y −, unida por dentro igual que una real. Incluye fuente de 5 V, botón táctil de 4 patas, interruptor, zumbador, sensor de luz (LDR), sensor de temperatura LM35, transistor NPN y motor DC. La revisión avisa si la base del transistor no lleva resistencia o si un motor va directo a un pin.
- **Kit de Arduino:** LED RGB, display de 7 segmentos, joystick, sensor de inclinación y módulos de movimiento (PIR), obstáculos, sonido, llama, campo magnético, nivel de agua, humedad de suelo y temperatura. Los sensores digitales se simulan manteniéndolos presionados y los analógicos con un control deslizante. La revisión exige una resistencia por cada color o segmento.
- **Módulos con librería:** servomotor SG90, sensor ultrasónico HC-SR04 y pantalla LCD 16×2 con módulo I2C. El código generado usa `Servo`, `pulseIn` y `LiquidCrystal_I2C`. Las reglas mueven el servo entre dos ángulos o según una lectura (`map`), comparan la distancia en cm y la pantalla muestra lecturas de pines con `{A0}`. La revisión avisa si falta Trig o Echo, si la pantalla no está en A4 y A5, si un módulo no tiene alimentación o tierra común con el Arduino y si varios servos toman 5 V del Arduino.
- **Laboratorio de energías renovables (beta):** combina generación solar, eólica e hidráulica con máquinas, agua y aire en un mismo proyecto. Además de cables y mangueras hay tres conexiones nuevas: **cable de potencia** (unifilar), **eje** mecánico y **tubería de agua**. Incluye panel solar, aerogenerador, rotor eólico, turbina Pelton, generador, río, controlador de carga MPPT, banco de baterías, inversor, red eléctrica (CFE), interruptor termomagnético, contactor de 24 V, relé de estado sólido para Arduino, multiplicadora, motores de CA y CD, bomba centrífuga, compresor de eje, tanque elevado, cisterna, válvula de paso, riego, interruptor de flotador y cargas (foco, casa, lámpara de CD). Al ejecutar, la pestaña Ejecución tiene controles de sol, viento y caudal del río, un ciclo de día y la opción de acelerar el tiempo de la energía, y muestra generación, consumo, batería, red, energía acumulada por fuente, energía desperdiciada y CO₂ evitado. Se pueden mezclar sistemas: un rotor eólico mueve un compresor que alimenta un cilindro, el Arduino prende una bomba con un SSR según un flotador, o un tanque elevado mueve una turbina (almacenamiento por bombeo). La revisión avisa, por ejemplo, si un panel va directo a la batería, si se mezclan CD y CA, si una tensión no coincide o si un generador necesita multiplicadora, y propone el componente que falta.
- **Tutoriales paso a paso:** en Mis proyectos hay un tutorial por cada tipo de sistema (neumática, electroneumática, Arduino, electrónica y energías renovables). Una tarjeta te dice qué seleccionar del catálogo, qué puertos unir y qué ajustar; lo que debes tocar se marca en la pantalla y cada paso se revisa solo. Al final compruebas que el proyecto funcione en la simulación (presionando el botón o cambiando el sol) y en la vista 3D. Si te atoras, «Hazlo por mí» hace los pasos de armado; los de prueba siempre los haces tú.
- **Vista 2D y 3D (beta):** cada proyecto se ve como esquema (2D) o funcionando en una mesa de trabajo (3D) con el botón **2D | 3D**. Las dos vistas dibujan la misma simulación: en 3D los vástagos salen, las aspas y los ejes giran, los tanques se llenan, las baterías muestran su carga, los focos se encienden y por los tubos de aire, agua y potencia se ve el flujo. Se gira con el mouse, se acerca con la rueda y, durante la ejecución, se presionan pulsadores y palancas directo en 3D. Los modelos son figuras simplificadas: no representan marcas ni medidas reales.
- **Edición rápida:** clic derecho sobre un componente para girarlo, cambiar el color de un LED o el valor de una resistencia, duplicarlo o borrarlo. Atajos: R gira, Mayús+R gira al revés, Supr borra y las flechas mueven.
- **Resistencias de cualquier valor.** Cuando falta una o su valor es incorrecto, la revisión calcula cuál necesitas con la ley de Ohm, sugiere el valor comercial y te deja agregarla con un botón.
- **Ejecutar en tiempo real:** el botón ▶ Ejecutar simula tu proyecto. Mantienes presionados los pulsadores con el mouse, accionas palancas y mueves potenciómetros, y ves los cables con 24 V o 5 V, el aire en las mangueras, los cilindros moviéndose, los relés y LED encendidos y el Arduino ejecutando tus reglas. La pestaña Ejecución muestra los pines en vivo, los eventos y las simplificaciones del modelo.
- **Rango, el analista:** lee tu proyecto y te dice qué parece que quieres lograr y qué te falta. Si pegas el enunciado de tu tarea, reconoce el tipo de problema y te ayuda paso a paso: pista, componentes, conexiones y ejemplo completo. Si no reconoce el problema, lo dice y te hace preguntas.
- **Platicar con Rango:** una conversación donde explicas tu problema con tus palabras. Rango te dice qué entendió, te pregunta solo lo que le falta (qué se mueve, qué lo activa, cuándo regresa, con qué lo controlas), te explica las opciones si no sabes qué contestar y te propone el proyecto con sus componentes, extras y siguientes pasos. Si no tiene un ejemplo para lo que pides, lo dice. Corre en tu navegador, sin IA generativa: sus respuestas están redactadas de antemano y no entiende preguntas fuera de tema.
- **Aprendizaje automático:** Rango reconoce el problema con un clasificador Naive Bayes que corre en tu navegador. Cuando confirmas su respuesta o eliges otro problema, aprende de tu enunciado y reconoce mejor los siguientes. Lo aprendido se guarda solo en tu navegador y se puede borrar. El modelo solo reconoce el tipo de problema: los errores de cableado los siguen decidiendo reglas fijas.
- **Proyectos en la red:** Rango busca en GitHub proyectos parecidos al problema reconocido, los ordena por parecido y popularidad, y aprende cuáles te sirvieron.

## Planes

La página **Planes** (`/planes`) muestra los planes previstos para estudiantes, docentes y escuelas. Los precios están sujetos a validación y **aún no se realizan cobros**: Rangokit no pide tarjeta ni datos de facturación, y los estudiantes no necesitan cuenta. El simulador, las prácticas y las pistas por reglas siguen gratis y sin cuenta, y hacer o entregar una práctica que deja un docente nunca cuesta.

## Uso

Úsalo en línea en **https://jasonphoenix0311.github.io/rangokit/**, o abre `dist/index.html` en un navegador. No necesita instalación ni conexión.

Los estudiantes usan Rangokit sin cuenta. Tus proyectos y lo que aprende Rango se guardan solo en tu navegador y nunca se envían a ningún servidor.

**Cuenta de docente (opcional):** el botón **Docentes: entrar** crea o abre una cuenta DDTEC, la misma de Phoenix Office. Solo pide correo y contraseña, y solo envía eso y los códigos de verificación a `ddtec.com.mx`. Por ahora la cuenta guarda tu plan (Docente, gratis); los grupos y las prácticas asignadas llegarán después.

Además de la cuenta de docente, la única conexión externa es opcional: la búsqueda de proyectos en GitHub. Se hace solo cuando presionas el botón y envía únicamente las palabras de búsqueda que ves en pantalla, nunca tu enunciado ni tu proyecto. Los proyectos encontrados no están revisados por Rangokit.

La vista 3D usa [Three.js](https://threejs.org) (licencia MIT), incluido en `vendor/` y publicado junto a la página. Se descarga solo al abrir la vista 3D. Si abres `dist/index.html` directo desde tu disco, el navegador no permite cargar ese archivo local y Rangokit lo descarga de jsDelivr; en ningún caso envía tu proyecto.

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
| `src/editor/escena3d.js`, `src/editor/vista3d.js` | Vista 3D: escena sin dependencias (probada) y dibujo con Three.js |
| `vendor/` | Three.js 0.170 (MIT) para la vista 3D |
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
