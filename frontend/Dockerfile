# Stage 1: Builder
FROM node:22.18.0-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Runtime configuration
#ARG VITE_BACKEND_URL=http://13.53.122.130:3000
#ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

# 👇 Pass the ARG to the build process for Vite
RUN echo "VITE_BACKEND_URL=$VITE_BACKEND_URL" > .env && npm run build

# Stage 2: Nginx
FROM nginx:alpine

# (optional) Clear old static files (but nginx:alpine may have none)
RUN rm -rf /usr/share/nginx/html/*

# Ensure /usr/share/nginx/html exists
RUN mkdir -p /usr/share/nginx/html

# Copy built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy the custom nginx.conf to replace the default one
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf


EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
