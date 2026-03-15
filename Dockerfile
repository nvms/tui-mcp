FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENTRYPOINT ["node", "src/server.js"]
