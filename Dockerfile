FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/app/data/vatly12.db \
    COOKIE_SECURE=true \
    TRUST_PROXY=true

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
