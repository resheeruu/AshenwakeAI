FROM eclipse-temurin:21-jre

WORKDIR /lavalink

COPY Lavalink.jar /lavalink/Lavalink.jar
COPY application.yml /lavalink/application.yml

EXPOSE 2333

CMD ["java", "-jar", "Lavalink.jar"]
