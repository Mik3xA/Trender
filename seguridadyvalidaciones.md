Seguridad y Validacion de Datos

Para que el proyecto sea robusto y pueda ser expuesto a internet sin riesgos inmediatos, es obligatorio implementar capas de seguridad y validacion. OpenCode debe integrar estas especificaciones en la estructura existente.

1. Nuevas Dependencias Requeridas

Ejecutar en la terminal el siguiente comando para instalar las librerias de seguridad:
npm install cors helmet express-validator express-rate-limit

2. Configuracion de CORS (Cross-Origin Resource Sharing)

En el archivo src/app.js, se debe configurar CORS para controlar que dominios tienen permitido consumir la API.

Se debe importar la libreria 'cors'.

Se debe agregar como middleware global: app.use(cors()).

Para un entorno de produccion, la configuracion debe restringirse a dominios especificos a traves de las variables de entorno.

3. Proteccion de Cabeceras HTTP (Helmet)

Helmet ayuda a proteger la aplicacion de algunas vulnerabilidades web conocidas ocultando cabeceras de Express y estableciendo politicas de seguridad.

En src/app.js, importar 'helmet'.

Agregar como middleware antes de las rutas: app.use(helmet()).

4. Limitacion de Peticiones (Rate Limiting)

Para evitar ataques de denegacion de servicio (DDoS) o ataques de fuerza bruta en los webhooks, se debe limitar la cantidad de peticiones que una IP puede hacer.

En src/app.js, configurar 'express-rate-limit'.

Crear una regla que permita un maximo de 100 peticiones por cada ventana de 15 minutos por IP.

Aplicar este limitador especificamente a la ruta '/webhooks'.

5. Validacion de Entradas (express-validator)

Nunca se debe confiar en los datos (payloads) que llegan a los webhooks o endpoints.

En la carpeta src/rutas, antes de llamar al controlador, se deben insertar middlewares de validacion.

Verificar que el cuerpo de la peticion (req.body) contenga los campos minimos esperados.

Si la validacion falla, el sistema debe rechazar la peticion inmediatamente devolviendo un codigo de estado HTTP 400 (Bad Request) y un arreglo detallando que campos faltan o tienen formatos invalidos, sin llegar a ejecutar la logica del controlador.