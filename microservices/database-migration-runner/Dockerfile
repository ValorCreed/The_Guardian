# syntax=docker/dockerfile:1.7

FROM maven:3.9-eclipse-temurin-26-alpine AS build
WORKDIR /workspace

COPY pom.xml ./
RUN mvn -B -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package \
    && mvn -B -DskipTests dependency:copy-dependencies \
         -DincludeScope=runtime \
         -DoutputDirectory=target/dependency \
    && JAR="$(find target -maxdepth 1 -type f -name '*.jar' ! -name '*.jar.original' | head -n 1)" \
    && test -n "$JAR" \
    && cp "$JAR" /workspace/migration-runner.jar

FROM eclipse-temurin:26-jre-alpine
RUN addgroup -S guardian \
    && adduser -S guardian -G guardian

WORKDIR /app
COPY --from=build --chown=guardian:guardian /workspace/migration-runner.jar /app/migration-runner.jar
COPY --from=build --chown=guardian:guardian /workspace/target/dependency /app/lib

USER guardian
ENTRYPOINT ["java", "-cp", "/app/migration-runner.jar:/app/lib/*", "com.vault.theguardian.migration.DatabaseMigrationRunner"]
