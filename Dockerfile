FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src/ src/
COPY scripts/ scripts/

RUN npm run build

EXPOSE ${PORT}

CMD ["bash", "scripts/start.sh"]
