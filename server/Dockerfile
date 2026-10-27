FROM node:22-alpine
WORKDIR /app
COPY server.mjs store.mjs package.json ./
ENV PORT=8787 DATA_DIR=/data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "server.mjs"]
