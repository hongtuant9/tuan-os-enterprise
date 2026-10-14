FROM node:22-alpine
WORKDIR /app
COPY bizviora/selfhost/phase1/package.json /app/package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY bizviora/core/src /app/core/src
COPY bizviora/selfhost/phase1/src /app/src
USER node
EXPOSE 8080
CMD ["node","src/server.mjs"]
