# Single-stage build: this is a small npm-workspaces monorepo (shared,
# server, client) with no native modules to compile, so the usual
# multi-stage "copy dist across stages" dance mostly trades simplicity for
# an image-size saving that doesn't matter on a home VM with room to spare.
# `npm prune --omit=dev` after the build strips the TypeScript/Vite
# toolchain out of the final image without needing a second stage, while
# keeping the npm workspace symlinks (node_modules/@tabletop-judge/shared
# -> ../../shared) intact - those would be easy to break copying
# node_modules across stages piecemeal.
FROM node:22-slim

WORKDIR /app

# Dependencies first, so `npm ci` is cached unless a package.json changed -
# the usual Docker layering trick, source below churns far more often.
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3001

# No HEALTHCHECK directive: docker-compose.yml's healthcheck covers this
# and keeping it in one place avoids the two definitions drifting apart.
CMD ["node", "server/dist/index.js"]
