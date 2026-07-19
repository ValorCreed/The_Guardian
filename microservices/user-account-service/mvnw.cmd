@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE_DIR=%~dp0"
set "PROPS=%BASE_DIR%.mvn\wrapper\maven-wrapper.properties"

where mvn >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  mvn %*
  exit /b %ERRORLEVEL%
)

for /f "tokens=1,* delims==" %%A in ('findstr /b "distributionUrl=" "%PROPS%"') do set "DIST_URL=%%B"
if not defined DIST_URL (
  echo distributionUrl is missing from %PROPS% 1>&2
  exit /b 1
)

for %%F in ("%DIST_URL%") do set "ARCHIVE_NAME=%%~nxF"
set "MAVEN_DIR_NAME=%ARCHIVE_NAME:-bin.zip=%"
set "WRAPPER_HOME=%BASE_DIR%.mvn\wrapper\dists"
set "MAVEN_HOME=%WRAPPER_HOME%\%MAVEN_DIR_NAME%"
set "ARCHIVE_PATH=%WRAPPER_HOME%\%ARCHIVE_NAME%"

if not exist "%MAVEN_HOME%\bin\mvn.cmd" (
  if not exist "%WRAPPER_HOME%" mkdir "%WRAPPER_HOME%"
  if not exist "%ARCHIVE_PATH%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri '%DIST_URL%' -OutFile '%ARCHIVE_PATH%'"
    if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
  )
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ARCHIVE_PATH%' -DestinationPath '%WRAPPER_HOME%' -Force"
  if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
)

call "%MAVEN_HOME%\bin\mvn.cmd" %*
exit /b %ERRORLEVEL%
