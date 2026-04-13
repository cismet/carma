FROM oven/bun:alpine AS build
WORKDIR /app
COPY services/cidsDataBridge/package.json services/cidsDataBridge/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY services/cidsDataBridge/src ./src
COPY services/cidsDataBridge/tsconfig.json ./
RUN bun build src/index.tsx --outdir dist --target bun --minify

FROM oven/bun:alpine
WORKDIR /app
COPY --from=build /app/dist ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
ENV STORAGE_DIR=/data
VOLUME ["/data"]
CMD ["bun", "run", "index.js"]
