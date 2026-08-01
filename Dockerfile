FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4317

CMD ["node", "bin/participant", "serve", "--repo", "/workspace", "--port", "4317"]
