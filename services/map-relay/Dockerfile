FROM node:22-alpine

WORKDIR /app
# The build context is the workspace root, not this directory — that is what
# the nx container executor passes and what every other service here assumes.
COPY services/map-relay/src/server.js .
COPY services/map-relay/src/version.json .

ENV PORT=8080 \
    ALLOW_ORIGIN=* \
    FAST_POLL_MS=250 \
    SLOW_POLL_MS=2000 \
    MAX_WAIT_MS=25000 \
    HOT_MS=60000

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server.js"]
