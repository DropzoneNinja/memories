FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Vite bakes VITE_* vars into the bundle at build time, not runtime — a
# plain `environment:` entry in docker-compose.yml has no effect here
# (the built dist/ is already static by the time the container starts).
# Must be passed as a build ARG (see docker-compose.yml's `build.args`).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 5173
CMD ["npm", "run", "preview"]
