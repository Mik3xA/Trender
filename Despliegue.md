Preparacion para el Entorno de Produccion

Este documento describe las instrucciones finales que se deben preparar para que la aplicacion pase de un entorno de desarrollo local a un servidor en la nube.

1. Gestor de Procesos (PM2)

En produccion, node src/index.js no es suficiente porque si ocurre un error fatal, el servidor se apagara permanentemente.

Instalar PM2 de manera global o como dependencia del proyecto:
npm install pm2 -g

Agregar un nuevo script en package.json:
"start:prod": "pm2 start src/index.js --name 'webhook-api'"

2. Archivo Docker (Opcional pero Recomendado)

Para asegurar que el proyecto se ejecute de manera identica en cualquier maquina, OpenCode debe crear un archivo llamado 'Dockerfile' en la raiz del proyecto con las siguientes directivas generales:

Utilizar una imagen oficial de Node.js (ej. node:18-alpine).

Establecer el directorio de trabajo (/usr/src/app).

Copiar los archivos package*.json y ejecutar npm install --only=production.

Copiar el resto del codigo fuente.

Exponer el puerto definido en la aplicacion (ej. 3000).

Definir el comando de arranque: CMD ["npm", "run", "start:prod"].

3. Manejo de Variables de Entorno en Produccion

Asegurarse de que el archivo .env JAMAS sea subido al control de versiones. El archivo .gitignore debe estar correctamente configurado.

Crear un archivo de muestra llamado .env.example en la raiz del proyecto. Este archivo debe contener las claves de las variables (ej. PORT=, DB_HOST=, API_KEY=) pero sin los valores reales, para que otros desarrolladores sepan que variables necesitan configurar al clonar el repositorio.

4. Revision de Seguridad Final

Asegurarse de que no haya instrucciones 'console.log' con informacion sensible de clientes o contrasenas en el codigo fuente.

Validar que las versiones de los paquetes en package.json no contengan vulnerabilidades conocidas ejecutando:
npm audit