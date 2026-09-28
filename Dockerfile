# Veronica as a container: one small Node.js server + a SQLite file on a volume.
# (The recommended host, Render, builds from render.yaml and does not need this file.
#  It is here for running Veronica on any other Docker host or a home server.)
#
#   docker build -t veronica .
#   docker run -d -p 3000:3000 -v veronica-data:/data \
#     -e APP_PASSWORD='choose-a-long-password' -e TZ='America/Chicago' veronica

# Build stage: the full Node image already has the compilers some packages may need.
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: small image, runs as the unprivileged "node" user.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/veronica.db
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/server/index.js"]
