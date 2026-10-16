# RPG VTT v2 — imagem única: servidor Node 24 (TypeScript nativo) servindo o cliente compilado.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY shared ./shared
COPY server ./server
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
