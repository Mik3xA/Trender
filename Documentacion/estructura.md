Estructura de Carpetas y Archivos

Esta es la arquitectura base que debe ser replicada en el entorno de trabajo. El proyecto consta de 14 archivos iniciales organizados de la siguiente manera.

mi-proyecto/
|-- documentacion/
|   |-- 01-tutorial-desde-cero.md
|   |-- 02-herramientas.md
|   |-- 03-estructura.md
|   |-- 04-comandos.md
|   |-- 05-servicios-webhooks.md
|
|-- src/
|   |-- index.js                (Archivo principal que levanta el servidor Express)
|   |-- app.js                  (Configuracion de middlewares y conexion de rutas principales)
|   |-- rutas/
|   |   |-- index.routes.js     (Manejador de rutas estandar de la aplicacion)
|   |   |-- webhooks.routes.js  (Rutas exclusivas para recibir notificaciones HTTP POST externas)
|   |-- controladores/
|   |   |-- main.controller.js  (Funciones que procesan las peticiones de las rutas)
|   |-- servicios/
|   |   |-- email.service.js    (Funciones aisladas para envio de notificaciones o correos)
|   |   |-- db.service.js       (Configuracion y funciones para consultar la base de datos)
|
|-- .env                        (Definicion de PORT y credenciales. No se sube al repositorio)
|-- .gitignore                  (Debe incluir node_modules y .env)
|-- package.json                (Manifiesto del proyecto generado por npm)