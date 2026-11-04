FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY . .
RUN mkdir -p uploads && chown -R 1000:1000 /app
USER 1000
ENV PORT=7860
EXPOSE 7860
CMD ["node", "server.js"]
