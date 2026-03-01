FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_OTTER_URL=http://localhost:8080
ENV VITE_OTTER_URL=${VITE_OTTER_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY .docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
