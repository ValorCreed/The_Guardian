FROM eclipse-temurin:26-jdk

WORKDIR /app

COPY target/user-account-service-*.jar app.jar

EXPOSE 8087

ENTRYPOINT ["java", "-jar", "app.jar"]
