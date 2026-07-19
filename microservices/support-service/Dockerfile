FROM eclipse-temurin:26-jdk
WORKDIR /app
COPY target/support-service-*.jar app.jar
EXPOSE 8090
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
