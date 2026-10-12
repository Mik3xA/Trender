Sistema de Trazabilidad y Manejo de Errores

Una aplicacion backend no debe detener su ejecucion (crashear) cuando ocurre un error inesperado, y todo lo que sucede debe quedar registrado para su posterior analisis.

1. Nuevas Dependencias Requeridas

Para el registro de actividad (logging), instalar la siguiente dependencia:
npm install morgan

2. Registro de Peticiones HTTP (Morgan)

En src/app.js, importar 'morgan'.

Configurar morgan como middleware global usando el formato 'dev' para el entorno de desarrollo.

Esto permitira ver en la terminal cada peticion que entra (ej. POST /webhooks/recibir 200 15ms), lo cual es critico para diagnosticar si los webhooks externos estan llegando correctamente al servidor.

3. Manejador de Errores Centralizado

OpenCode debe crear un mecanismo para atrapar todos los errores y responder de forma estandarizada.

Crear un nuevo archivo: src/controladores/error.controller.js.

Este archivo debe exportar un middleware de manejo de errores de Express, el cual siempre recibe 4 parametros: (err, req, res, next).

En src/app.js, este middleware debe ser el ultimo en ser declarado, justo antes del final del archivo y despues de todas las rutas.

La funcion del manejador centralizado es interceptar cualquier error lanzado en la aplicacion, imprimir los detalles en la consola (console.error) y devolver al cliente una respuesta JSON con el codigo de estado HTTP 500 (Internal Server Error) y un mensaje generico, ocultando la informacion sensible del stack trace en entornos de produccion.

4. Manejo de Rutas Inexistentes (404)

Justo antes del manejador de errores centralizado en src/app.js, crear un middleware que atrape todas las peticiones a rutas que no esten definidas.

Debe retornar un codigo HTTP 404 (Not Found) y un mensaje JSON indicando que el recurso solicitado no existe.