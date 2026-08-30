FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/

RUN npm run build

EXPOSE 3000

CMD ["bash", "scripts/start.sh"]
