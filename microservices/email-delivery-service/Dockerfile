# syntax=docker/dockerfile:1.7

FROM maven:3.9-eclipse-temurin-26-alpine AS build
WORKDIR /workspace

COPY pom.xml ./
RUN mvn -B -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package \
    && JAR="$(find target -maxdepth 1 -type f -name '*.jar' ! -name '*.jar.original' | head -n 1)" \
    && test -n "$JAR" \
    && cp "$JAR" /workspace/app.jar

FROM eclipse-temurin:26-jre-alpine
RUN apk add --no-cache curl \
    && addgroup -S guardian \
    && adduser -S guardian -G guardian

WORKDIR /app
COPY --from=build --chown=guardian:guardian /workspace/app.jar /app/app.jar

ENV PORT=8091
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=20.0 -XX:+UseSerialGC -Djava.security.egd=file:/dev/./urandom"

EXPOSE 8091
USER guardian

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
    CMD curl --fail --silent --show-error "http://127.0.0.1:${PORT}/actuator/health" || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
