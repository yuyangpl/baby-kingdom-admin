FROM node:20.12.2-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# nginx.conf.template — BACKEND_URL 在容器启动时通过 envsubst 注入
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Cloud Run 使用 8080 端口
EXPOSE 8080
# Nginx 官方镜像自带 docker-entrypoint.sh，会自动对 /etc/nginx/templates/*.template
# 执行 envsubst 并输出到 /etc/nginx/conf.d/，无需手动处理
