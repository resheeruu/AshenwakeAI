FROM eclipse-temurin:21-jre

WORKDIR /lavalink

RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -L \
    -o /lavalink/Lavalink.jar \
    https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar

RUN mkdir -p /lavalink/plugins && \
    curl -L \
    -o /lavalink/plugins/youtube-plugin.jar \
    https://github.com/lavalink-devs/youtube-source/releases/latest/download/youtube-plugin.jar

COPY application.yml /lavalink/application.yml

EXPOSE 2333

CMD ["java", "-jar", "Lavalink.jar"]
