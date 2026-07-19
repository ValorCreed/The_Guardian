FROM eclipse-temurin:26-jdk

WORKDIR /app
COPY target/security-health-service-*.jar app.jar

EXPOSE 8088
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
