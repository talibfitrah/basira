# ---------- بصيرة: صورة إنتاج ----------
ARG BASE=node:22-bookworm-slim
FROM ${BASE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${BASE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build

FROM ${BASE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    NODE_NO_WARNINGS=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/arabic.mjs /app/src/lib/sqlite.mjs ./src/lib/
COPY --from=build /app/node_modules/bcryptjs ./node_modules/bcryptjs
# يعمل بمستخدم الحاوية الافتراضي حتى يكتب في مجلد data المربوط على Synology دون ضبط صلاحيات
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
