@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Instalador USB - Prometheus / Magic Camera Pro
color 0F

:: ================================================================
:: CONFIGURACION
:: ================================================================
set "APP_PACKAGE=com.prometheus.camera"
set "APP_ACTIVITY=.MainActivity"
set "PWA_URL=https://ais-dev-u5qwyn7n2flrtaijftvyrr-27329014204.us-east1.run.app"

:: Directorio donde se encuentra este BAT
set "SCRIPT_DIR=%~dp0"

:: ================================================================
:: INICIO
:: ================================================================
:inicio
cls
echo.
echo =====================================================================
echo          INSTALADOR USB - PROMETHEUS / MAGIC CAMERA PRO
echo =====================================================================
echo.
echo Directorio:
echo %SCRIPT_DIR%
echo.

:: ================================================================
:: 1. DETECTAR ADB
:: ================================================================
call :detectar_adb
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo localizar ADB.
    echo.
    echo Instala Android SDK Platform-Tools desde:
    echo https://developer.android.com/tools/releases/platform-tools
    echo.
    pause
    exit /b 1
)

echo [OK] ADB detectado:
echo      %ADB%
echo.

:: ================================================================
:: 2. COMPROBAR TELEFONO
:: ================================================================
call :comprobar_dispositivo
if errorlevel 1 (
    echo.
    echo ---------------------------------------------------------------------
    echo [AVISO] No hay un dispositivo ADB listo para utilizar.
    echo.
    echo Comprueba:
    echo   1. El telefono esta conectado mediante USB.
    echo   2. La Depuracion USB esta activada.
    echo   3. Has aceptado "Permitir depuracion USB" en el telefono.
    echo   4. El cable USB permite transferencia de datos.
    echo   5. Si aparece como "unauthorized", acepta la huella RSA.
    echo ---------------------------------------------------------------------
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Telefono conectado y autorizado.
echo.

:: ================================================================
:: MENU PRINCIPAL
:: ================================================================
:menu
echo =====================================================================
echo                     MENU PRINCIPAL
echo =====================================================================
echo.
echo   [1] Compilar e instalar APK nativo
echo   [2] Instalar APK existente
echo   [3] Abrir Camara Web Pro (PWA)
echo   [4] Reiniciar ADB
echo   [5] Salir
echo.
echo =====================================================================
set "opcion="
set /p "opcion=Selecciona una opcion [1-5]: "

if "%opcion%"=="1" goto compilar
if "%opcion%"=="2" goto instalar
if "%opcion%"=="3" goto pwa
if "%opcion%"=="4" goto reiniciar_adb
if "%opcion%"=="5" goto salir

echo.
echo [ERROR] Opcion no valida.
timeout /t 2 >nul
goto menu


:: ================================================================
:: OPCION 1 - COMPILAR
:: ================================================================
:compilar
cls
echo.
echo =====================================================================
echo                    COMPILANDO APK
echo =====================================================================
echo.

call :buscar_gradle
if errorlevel 1 (
    echo [ERROR] No se encontro gradlew.bat.
    echo.
    echo Abre el proyecto Android desde Android Studio o ejecuta este
    echo instalador desde la carpeta raiz del proyecto.
    echo.
    pause
    goto menu
)

echo [INFO] Ejecutando Gradle...
echo.

call "%GRADLEW%" assembleDebug
if errorlevel 1 (
    echo.
    echo =====================================================================
    echo [ERROR] LA COMPILACION HA FALLADO
    echo =====================================================================
    echo.
    echo Revisa los errores mostrados por Gradle.
    echo.
    pause
    goto menu
)

echo.
echo =====================================================================
echo [OK] COMPILACION COMPLETADA
echo =====================================================================
echo.

goto instalar


:: ================================================================
:: OPCION 2 - INSTALAR APK
:: ================================================================
:instalar
cls
echo.
echo =====================================================================
echo                       INSTALANDO APK
echo =====================================================================
echo.

call :buscar_apk
if errorlevel 1 (
    echo.
    echo [ERROR] No se encontro app-debug.apk.
    echo.
    echo Rutas comprobadas:
    echo   %SCRIPT_DIR%app\build\outputs\apk\debug\app-debug.apk
    echo   %SCRIPT_DIR%android-project\app\build\outputs\apk\debug\app-debug.apk
    echo.
    echo Utiliza primero la opcion [1] para compilar.
    echo.
    pause
    goto menu
)

echo [OK] APK encontrado:
echo      %APK_PATH%
echo.

echo [INFO] Instalando APK en el telefono...
echo.

"%ADB%" install -r -d "%APK_PATH%"

if errorlevel 1 (
    echo.
    echo =====================================================================
    echo [ERROR] LA INSTALACION DEL APK HA FALLADO
    echo =====================================================================
    echo.
    echo Posibles causas:
    echo   - La aplicacion tiene una firma diferente.
    echo   - Existe una version incompatible instalada.
    echo   - El telefono no permite la instalacion mediante USB.
    echo   - No hay suficiente espacio.
    echo   - El dispositivo se desconecto.
    echo.
    pause
    goto menu
)

echo.
echo =====================================================================
echo [OK] APK INSTALADO CORRECTAMENTE
echo =====================================================================
echo.

echo [INFO] Intentando iniciar la aplicacion...
echo.

"%ADB%" shell am start -n "%APP_PACKAGE%/%APP_ACTIVITY%" >nul 2>&1

if errorlevel 1 (
    echo [AVISO] El APK se instalo correctamente, pero no se pudo
    echo         iniciar automaticamente.
    echo.
    echo Comprueba el package/activity configurado:
    echo %APP_PACKAGE%/%APP_ACTIVITY%
) else (
    echo [OK] Aplicacion iniciada correctamente.
)

echo.
pause
goto menu


:: ================================================================
:: OPCION 3 - PWA
:: ================================================================
:pwa
cls
echo.
echo =====================================================================
echo                  CAMARA WEB PRO - PWA
echo =====================================================================
echo.

echo [INFO] Abriendo la aplicacion web en el telefono...
echo.

"%ADB%" shell am start ^
    -a android.intent.action.VIEW ^
    -d "%PWA_URL%"

if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo abrir la URL en el telefono.
    echo.
    pause
    goto menu
)

echo.
echo [OK] Aplicacion web abierta.
echo.
echo Para instalarla como PWA:
echo   1. Abre el menu del navegador.
echo   2. Selecciona "Instalar aplicacion" o "Anadir a pantalla de inicio".
echo.

pause
goto menu


:: ================================================================
:: OPCION 4 - REINICIAR ADB
:: ================================================================
:reiniciar_adb
cls
echo.
echo =====================================================================
echo                       REINICIANDO ADB
echo =====================================================================
echo.

"%ADB%" kill-server
if errorlevel 1 (
    echo [AVISO] No se pudo detener ADB correctamente.
)

timeout /t 1 >nul

"%ADB%" start-server
if errorlevel 1 (
    echo [ERROR] No se pudo iniciar el servidor ADB.
    echo.
    pause
    goto menu
)

echo.
echo [OK] Servidor ADB reiniciado.
echo.

call :comprobar_dispositivo
if errorlevel 1 (
    echo [AVISO] El telefono no esta disponible o no esta autorizado.
) else (
    echo [OK] Telefono detectado correctamente.
)

echo.
pause
goto menu


:: ================================================================
:: FUNCION - DETECTAR ADB
:: ================================================================
:detectar_adb

set "ADB="

:: Primero buscar ADB en PATH
where adb.exe >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%A in ('where adb.exe 2^>nul') do (
        set "ADB=%%A"
        goto :adb_encontrado
    )
)

:: Android SDK habitual
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
    goto :adb_encontrado
)

:: Posible instalacion alternativa del SDK
if exist "%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe" (
    set "ADB=%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe"
    goto :adb_encontrado
)

exit /b 1


:adb_encontrado
echo [OK] ADB encontrado.
exit /b 0


:: ================================================================
:: FUNCION - COMPROBAR DISPOSITIVO
:: ================================================================
:comprobar_dispositivo

set "DEVICE_STATE="

"%ADB%" start-server >nul 2>&1

for /f "skip=1 tokens=1,2" %%A in ('"%ADB%" devices 2^>nul') do (
    if "%%B"=="device" (
        set "DEVICE_STATE=device"
        goto :dispositivo_ok
    )
)

exit /b 1


:dispositivo_ok
exit /b 0


:: ================================================================
:: FUNCION - BUSCAR GRADLE
:: ================================================================
:buscar_gradle

set "GRADLEW="

:: Gradle en la misma carpeta del BAT
if exist "%SCRIPT_DIR%gradlew.bat" (
    set "GRADLEW=%SCRIPT_DIR%gradlew.bat"
    exit /b 0
)

:: Gradle dentro de android-project
if exist "%SCRIPT_DIR%android-project\gradlew.bat" (
    set "GRADLEW=%SCRIPT_DIR%android-project\gradlew.bat"
    exit /b 0
)

:: Gradle un nivel por encima
if exist "%SCRIPT_DIR%..\gradlew.bat" (
    set "GRADLEW=%SCRIPT_DIR%..\gradlew.bat"
    exit /b 0
)

exit /b 1


:: ================================================================
:: FUNCION - BUSCAR APK
:: ================================================================
:buscar_apk

set "APK_PATH="

:: Ruta normal
if exist "%SCRIPT_DIR%app\build\outputs\apk\debug\app-debug.apk" (
    set "APK_PATH=%SCRIPT_DIR%app\build\outputs\apk\debug\app-debug.apk"
    exit /b 0
)

:: Proyecto dentro de android-project
if exist "%SCRIPT_DIR%android-project\app\build\outputs\apk\debug\app-debug.apk" (
    set "APK_PATH=%SCRIPT_DIR%android-project\app\build\outputs\apk\debug\app-debug.apk"
    exit /b 0
)

:: Proyecto un nivel superior
if exist "%SCRIPT_DIR%..\app\build\outputs\apk\debug\app-debug.apk" (
    set "APK_PATH=%SCRIPT_DIR%..\app\build\outputs\apk\debug\app-debug.apk"
    exit /b 0
)

exit /b 1


:: ================================================================
:: SALIR
:: ================================================================
:salir
echo.
echo =====================================================================
echo              INSTALADOR FINALIZADO
echo =====================================================================
echo.
echo Gracias por utilizar Prometheus / Magic Camera Pro.
echo.
exit /b 0
