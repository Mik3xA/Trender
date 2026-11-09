# Imagen del backend (API). El frontend Angular se construye y sirve aparte.
FROM node:22-bookworm-slim
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package*.json ./
# bcrypt y better-sqlite3 usan binarios precompilados para linux/glibc.
RUN npm ci --omit=dev
COPY src ./src
# dev.db y uploads/ viven en un volumen: docker run -v trender-data:/data ...
ENV DATABASE_URL=/data/trender.db UPLOADS_DIR=/data/uploads
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
