FROM eclipse-temurin:26-jdk

WORKDIR /app
COPY target/backup-recovery-service-*.jar app.jar

EXPOSE 8086
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
