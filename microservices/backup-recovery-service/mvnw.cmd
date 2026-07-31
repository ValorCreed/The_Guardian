@echo off
setlocal EnableExtensions

set "BASE_DIR=%~dp0"
set "MAVEN_VERSION=3.9.9"
if defined MAVEN_USER_HOME (
  set "WRAPPER_HOME=%MAVEN_USER_HOME%"
) else (
  set "WRAPPER_HOME=%USERPROFILE%\.m2"
)
set "INSTALL_DIR=%WRAPPER_HOME%\wrapper\dists\apache-maven-%MAVEN_VERSION%"
set "MAVEN_HOME_DIR=%INSTALL_DIR%\apache-maven-%MAVEN_VERSION%"
set "MAVEN_CMD=%MAVEN_HOME_DIR%\bin\mvn.cmd"
set "ARCHIVE=%INSTALL_DIR%\apache-maven-%MAVEN_VERSION%-bin.zip"
set "DIST_URL=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/%MAVEN_VERSION%/apache-maven-%MAVEN_VERSION%-bin.zip"

if exist "%MAVEN_CMD%" goto runMaven

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%ARCHIVE%" (
  echo Downloading Apache Maven %MAVEN_VERSION%...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%DIST_URL%' -OutFile '%ARCHIVE%'"
  if errorlevel 1 goto wrapperError
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%ARCHIVE%' -DestinationPath '%INSTALL_DIR%' -Force"
if errorlevel 1 goto wrapperError

:runMaven
call "%MAVEN_CMD%" -f "%BASE_DIR%pom.xml" %*
exit /b %ERRORLEVEL%

:wrapperError
echo Maven Wrapper could not download or extract Maven. 1>&2
exit /b 1
