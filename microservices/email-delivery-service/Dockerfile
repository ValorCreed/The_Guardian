FROM eclipse-temurin:26-jdk
WORKDIR /app
COPY target/email-delivery-service-*.jar app.jar
EXPOSE 8091
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
