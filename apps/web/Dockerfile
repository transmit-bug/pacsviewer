FROM node:18-alpine as build

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
RUN npm install

# Copy source code
COPY apps/web ./apps/web

# Build
WORKDIR /app/apps/web
RUN npm run build

# Production
FROM nginx:alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
