FROM node:20-bookworm-slim

# Install Chromium, build tools for native modules (better-sqlite3), fonts, and ffmpeg
RUN apt-get update && apt-get install -y \
    chromium \
    procps \
    ca-certificates \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    ffmpeg \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --production && npm rebuild better-sqlite3 --build-from-source

COPY . .

# Ensure persistent data directory exists
RUN mkdir -p /app/data

# Expose Web Dashboard Port
EXPOSE 3000

CMD ["node", "index.js"]
