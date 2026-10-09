FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: npm 10 runs an implicit node-gyp rebuild for better-sqlite3 (which ships prebuilds and opts out via gypfile:false); skipping scripts avoids needing Python and a compiler. The only package with a real install script is the macOS-only fsevents.
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/build ./build
COPY server.js ./
RUN mkdir -p /app/data
ENV DATABASE_PATH=/app/data/payup.db
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
