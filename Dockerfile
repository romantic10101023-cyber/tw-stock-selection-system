FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY server.mjs README.md ./
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "server.mjs"]
