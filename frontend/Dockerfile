# Stage 1: Builder
FROM node:22.15.0-alpine AS builder

# Use /app to keep things organized (but could use / if you prefer)
WORKDIR /app  

# These will copy to /app/package.json etc.
COPY package*.json ./
RUN npm install

# Copy everything to /app (including your root app.tsx)
COPY . .

# Build outputs to /app/dist (Vite's default relative to WORKDIR)
RUN npm run build

# Stage 2: Nginx
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html  # Now matches build path
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]