# Stage 1: Builder
FROM node:22.15.0-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Stage 2: Nginx
FROM nginx:alpine

# (optional) Clear old static files (but nginx:alpine may have none)
RUN rm -rf /usr/share/nginx/html/*

# Ensure /usr/share/nginx/html exists
RUN mkdir -p /usr/share/nginx/html

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
