FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM deps AS dev
# In dev, docker-compose bind-mounts the source directory over /app,
# so no COPY is needed here. The CMD is overridden in docker-compose.yml.
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
