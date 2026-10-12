Especificaciones de Servicios y Webhooks

Este documento define la logica interna que debe programarse en los archivos de la carpeta src.

1. Configuracion del Servidor (src/index.js y src/app.js)

app.js debe inicializar express, configurar express.json() para leer cuerpos JSON y montar las rutas (ej. app.use('/api', indexRoutes) y app.use('/webhooks', webhookRoutes)).

index.js debe importar app.js, cargar dotenv y ejecutar app.listen() en el puerto definido en .env (por defecto 3000).

2. Webhooks (src/rutas/webhooks.routes.js)

Debe exponer un metodo POST en la ruta "/recibir".

El proposito de este webhook es recibir cargas utiles (payloads) de sistemas de terceros (por ejemplo, pasarelas de pago o CRMs).

El controlador asociado debe validar que el cuerpo de la peticion no este vacio y responder rapidamente con un estatus 200 OK para confirmar la recepcion al emisor.

3. Servicios (src/servicios/)

db.service.js: Debe exportar una funcion simulada (mock) llamada "guardarDatos(datos)" que reciba un objeto e imprima en consola "Datos guardados en base de datos".

email.service.js: Debe exportar una funcion simulada llamada "enviarAlerta(mensaje)" que imprima en consola "Correo enviado con el mensaje: [mensaje]".

4. Flujo de Controladores (src/controladores/main.controller.js)

Al recibir una peticion en el webhook, el controlador debe:

Extraer los datos del request.

Llamar a guardarDatos() del db.service.

Llamar a enviarAlerta() del email.service.

Retornar { status: "success", message: "Webhook procesado" } al cliente.