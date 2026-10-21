# Avión Party en internet (Render u otro hosting con Docker).
# Compila el mismo servidor Java que usa la app Android y sirve la webapp.
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /src
COPY src ./src
COPY desktop ./desktop
RUN mkdir -p /out && javac -encoding UTF-8 -d /out src/com/franco/avionparty/core/*.java desktop/DesktopMain.java

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /out ./classes
COPY web ./web
# modo internet: cada código de grupo tiene su propio lobby
ENV AVION_CLOUD=1
EXPOSE 10000
CMD ["sh", "-c", "exec java -Xmx200m -Xss512k -cp /app/classes DesktopMain /app/web ${PORT:-10000}"]
