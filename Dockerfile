FROM node:22-alpine
RUN apk add --no-cache cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENTRYPOINT ["node", "src/server.js"]
