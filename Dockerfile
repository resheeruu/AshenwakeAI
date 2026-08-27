FROM node:22-slim AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg lsb-release ffmpeg && \
    curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | \
      gpg --dearmor -o /usr/share/keyrings/adoptium.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" > \
      /etc/apt/sources.list.d/adoptium.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends temurin-21-jre && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/
COPY lavalink/application.yml lavalink/application.yml

RUN mkdir -p lavalink/plugins && \
    curl -fSL -o lavalink/Lavalink.jar \
      "https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar" && \
    curl -fSL -o lavalink/plugins/youtube-plugin-1.18.2.jar \
      "https://github.com/lavalink-devs/youtube-plugin/releases/download/1.18.2/youtube-plugin-1.18.2.jar"

RUN npm run build

EXPOSE 2333

CMD ["bash", "scripts/render-start.sh"]
