Comandos para Levantar el Proyecto

Estos son los comandos exactos que deben ejecutarse en la terminal, en la raiz del proyecto (carpeta mi-proyecto), para construir el entorno.

1. Inicializacion

Crear el archivo package.json con la configuracion por defecto:
npm init -y

2. Instalacion de Paquetes

Instalar el framework y el gestor de variables de entorno:
npm install express dotenv

Instalar la herramienta de recarga en caliente para desarrollo:
npm install --save-dev nodemon

3. Configuracion del package.json

Se debe modificar el archivo package.json generado para incluir el script de arranque.
Buscar la seccion "scripts" y agregar:
"dev": "nodemon src/index.js",
"start": "node src/index.js"

4. Arranque del Servidor

Una vez creados los archivos fuente (src/index.js y src/app.js), levantar el proyecto con:
npm run dev