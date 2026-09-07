#!/usr/bin/env bash
#
# ================================================================
# PROMETHEUS / MAGIC CAMERA PRO
# INSTALADOR USB PRO — ANDROID
# ================================================================
#
# Uso:
#   ./instalar_usb.sh
#
# Opcional:
#   ./instalar_usb.sh --build
#   ./instalar_usb.sh --install
#   ./instalar_usb.sh --pwa
#   ./instalar_usb.sh --restart-adb
#   ./instalar_usb.sh --diagnostics
#
# ================================================================

set -Eeuo pipefail
IFS=$'\n\t'

# ================================================================
# CONFIGURACIÓN
# ================================================================

readonly APP_PACKAGE="com.prometheus.camera"
readonly APP_ACTIVITY=".MainActivity"
readonly PWA_URL="https://ais-dev-u5qwyn7n2flrtaijftvyrr-27329014204.us-east1.run.app"

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

ADB=""
PROJECT_DIR=""
GRADLE=""
APK=""

# ================================================================
# COLORES
# ================================================================

if [[ -t 1 ]]; then
    readonly C_RESET=$'\033[0m'
    readonly C_BOLD=$'\033[1m'
    readonly C_GREEN=$'\033[32m'
    readonly C_RED=$'\033[31m'
    readonly C_YELLOW=$'\033[33m'
    readonly C_CYAN=$'\033[36m'
    readonly C_BLUE=$'\033[34m'
else
    readonly C_RESET=""
    readonly C_BOLD=""
    readonly C_GREEN=""
    readonly C_RED=""
    readonly C_YELLOW=""
    readonly C_CYAN=""
    readonly C_BLUE=""
fi

# ================================================================
# LOG
# ================================================================

info()  { echo -e "${C_CYAN}[INFO]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[ OK ]${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
error() { echo -e "${C_RED}[ERROR]${C_RESET} $*" >&2; }

die() {
    error "$*"
    exit 1
}

pause_screen() {
    echo
    read -r -p "Presiona ENTER para continuar..."
}

header() {
    clear 2>/dev/null || true
    echo
    echo "====================================================================="
    echo "        PROMETHEUS / MAGIC CAMERA PRO - INSTALADOR USB"
    echo "====================================================================="
    echo
}

# ================================================================
# MANEJO DE ERRORES
# ================================================================

on_error() {
    local line="$1"
    local command="$2"

    echo
    error "Falló una operación."
    error "Línea: $line"
    error "Comando: $command"
    echo
}

trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

# ================================================================
# DETECTAR SISTEMA
# ================================================================

detect_os() {
    case "$(uname -s)" in
        Darwin)
            echo "macOS"
            ;;
        Linux)
            echo "Linux"
            ;;
        *)
            echo "Otro"
            ;;
    esac
}

# ================================================================
# BUSCAR ADB
# ================================================================

find_adb() {

    local candidate

    # 1. PATH
    if command -v adb >/dev/null 2>&1; then
        command -v adb
        return 0
    fi

    # 2. Rutas comunes
    local candidates=(
        "$HOME/Library/Android/sdk/platform-tools/adb"
        "$HOME/Android/Sdk/platform-tools/adb"
        "${ANDROID_HOME:-}/platform-tools/adb"
        "${ANDROID_SDK_ROOT:-}/platform-tools/adb"
    )

    for candidate in "${candidates[@]}"; do
        [[ -x "$candidate" ]] && {
            echo "$candidate"
            return 0
        }
    done

    return 1
}

setup_adb() {

    ADB="$(find_adb)" || {

        echo
        error "No se encontró Android Debug Bridge (ADB)."
        echo
        echo "macOS:"
        echo "  brew install android-platform-tools"
        echo
        echo "Android Studio:"
        echo "  SDK Manager > SDK Tools > Android SDK Platform-Tools"
        echo
        echo "Descarga oficial:"
        echo "  https://developer.android.com/tools/releases/platform-tools"
        echo

        return 1
    }

    ok "ADB:"
    echo "     $ADB"
}

# ================================================================
# INICIAR ADB
# ================================================================

start_adb() {

    "$ADB" start-server >/dev/null 2>&1 ||
        die "No se pudo iniciar el servidor ADB."
}

# ================================================================
# LISTAR DISPOSITIVOS
# ================================================================

list_devices() {
    "$ADB" devices -l
}

# ================================================================
# OBTENER DISPOSITIVOS AUTORIZADOS
# ================================================================

get_authorized_devices() {

    "$ADB" devices |
        awk 'NR > 1 && $2 == "device" {print $1}'
}

# ================================================================
# SELECCIONAR DISPOSITIVO
# ================================================================

select_device() {

    local devices
    mapfile -t devices < <(get_authorized_devices)

    if [[ "${#devices[@]}" -eq 0 ]]; then
        return 1
    fi

    # Un solo teléfono
    if [[ "${#devices[@]}" -eq 1 ]]; then
        export ANDROID_SERIAL="${devices[0]}"
        ok "Dispositivo seleccionado: ${ANDROID_SERIAL}"
        return 0
    fi

    # Varios teléfonos
    echo
    warn "Hay varios dispositivos conectados:"
    echo

    local i=1
    local device

    for device in "${devices[@]}"; do
        echo "  [$i] $device"
        ((i++))
    done

    echo

    local selection
    read -r -p "Selecciona el dispositivo [1-${#devices[@]}]: " selection

    if ! [[ "$selection" =~ ^[0-9]+$ ]] ||
       (( selection < 1 || selection > ${#devices[@]} )); then
        error "Selección inválida."
        return 1
    fi

    export ANDROID_SERIAL="${devices[$((selection-1))]}"

    ok "Dispositivo seleccionado: $ANDROID_SERIAL"
}

# ================================================================
# EJECUTAR ADB SOBRE EL DISPOSITIVO SELECCIONADO
# ================================================================

adb() {

    if [[ -n "${ANDROID_SERIAL:-}" ]]; then
        "$ADB" -s "$ANDROID_SERIAL" "$@"
    else
        "$ADB" "$@"
    fi
}

# ================================================================
# ESTADO DEL DISPOSITIVO
# ================================================================

device_state() {

    "$ADB" devices |
        awk 'NR > 1 && NF >= 2 {print $2}'
}

# ================================================================
# COMPROBAR TELÉFONO
# ================================================================

check_device() {

    start_adb

    local state
    state="$(device_state || true)"

    case "$state" in

        device)
            select_device
            return 0
            ;;

        unauthorized)
            warn "El teléfono está conectado pero no autorizado."
            echo
            echo "Acepta la ventana de autorización RSA en el teléfono."
            return 1
            ;;

        offline)
            warn "El dispositivo está OFFLINE."
            echo
            echo "Desconecta y vuelve a conectar el USB."
            return 1
            ;;

        "")
            warn "No hay ningún dispositivo Android conectado."
            return 1
            ;;

        *)
            warn "Estado ADB: $state"
            return 1
            ;;
    esac
}

# ================================================================
# ESPERAR TELÉFONO
# ================================================================

wait_for_device() {

    echo
    echo "Conecta el teléfono mediante USB."
    echo
    echo "Asegúrate de:"
    echo "  • Activar Opciones de desarrollador."
    echo "  • Activar Depuración USB."
    echo "  • Aceptar la autorización RSA."
    echo "  • Utilizar un cable USB de datos."
    echo

    while true; do

        if check_device; then
            echo
            ok "Teléfono listo."
            return 0
        fi

        echo
        read -r -p "Presiona ENTER para volver a comprobar..."
        echo

    done
}

# ================================================================
# BUSCAR PROYECTO ANDROID
# ================================================================

find_project() {

    local candidate

    local candidates=(
        "$SCRIPT_DIR"
        "$SCRIPT_DIR/android-project"
        "$SCRIPT_DIR/.."
    )

    for candidate in "${candidates[@]}"; do

        if [[ -f "$candidate/gradlew" ]] &&
           [[ -d "$candidate/app" ]]; then

            PROJECT_DIR="$(cd "$candidate" && pwd)"
            GRADLE="$PROJECT_DIR/gradlew"

            ok "Proyecto Android:"
            echo "     $PROJECT_DIR"

            return 0
        fi

    done

    return 1
}

# ================================================================
# BUSCAR APK
# ================================================================

find_apk() {

    local candidates=(
        "$SCRIPT_DIR/app/build/outputs/apk/debug/app-debug.apk"
        "$SCRIPT_DIR/android-project/app/build/outputs/apk/debug/app-debug.apk"
        "$SCRIPT_DIR/../app/build/outputs/apk/debug/app-debug.apk"
    )

    local candidate

    for candidate in "${candidates[@]}"; do

        if [[ -f "$candidate" ]]; then
            APK="$(cd "$(dirname "$candidate")" && pwd)/$(basename "$candidate")"
            return 0
        fi

    done

    # Búsqueda adicional
    while IFS= read -r -d '' candidate; do
        APK="$candidate"
        return 0
    done < <(
        find "$SCRIPT_DIR" \
            -type f \
            -name "app-debug.apk" \
            -print0 \
            2>/dev/null
    )

    return 1
}

# ================================================================
# PREPARAR GRADLE
# ================================================================

prepare_gradle() {

    find_project || {
        error "No se encontró un proyecto Android válido."
        echo
        echo "Se necesita:"
        echo "  gradlew"
        echo "  app/"
        echo
        return 1
    }

    if [[ ! -x "$GRADLE" ]]; then
        info "Concediendo permisos de ejecución a gradlew..."
        chmod +x "$GRADLE"
    fi
}

# ================================================================
# COMPILAR
# ================================================================

build_apk() {

    prepare_gradle || return 1

    echo
    echo "---------------------------------------------------------------------"
    info "Compilando APK Debug..."
    echo "---------------------------------------------------------------------"
    echo

    (
        cd "$PROJECT_DIR"
        "$GRADLE" assembleDebug
    )

    echo

    ok "Compilación completada."

    find_apk || {
        error "La compilación terminó pero no se encontró app-debug.apk."
        return 1
    }

    ok "APK generado:"
    echo "     $APK"
}

# ================================================================
# INSTALAR APK
# ================================================================

install_apk() {

    local apk="${1:-}"

    if [[ -z "$apk" ]]; then
        find_apk || {
            error "No se encontró app-debug.apk."
            echo
            echo "Ejecuta primero la compilación."
            return 1
        }

        apk="$APK"
    fi

    [[ -f "$apk" ]] ||
        die "APK inexistente: $apk"

    echo
    info "APK seleccionado:"
    echo "     $apk"
    echo

    info "Instalando..."

    if ! adb install -r -d "$apk"; then

        echo
        error "No se pudo instalar el APK."
        echo
        echo "Posibles causas:"
        echo "  • Firma diferente a la aplicación instalada."
        echo "  • Versión incompatible."
        echo "  • Espacio insuficiente."
        echo "  • Dispositivo desconectado."
        echo "  • Restricciones de instalación USB."
        echo

        return 1
    fi

    echo
    ok "APK instalado correctamente."

    launch_app
}

# ================================================================
# INICIAR APLICACIÓN
# ================================================================

launch_app() {

    echo
    info "Iniciando Prometheus..."

    if adb shell am start \
        -n "${APP_PACKAGE}/${APP_ACTIVITY}" \
        >/dev/null 2>&1; then

        ok "Aplicación iniciada."
        echo "     ${APP_PACKAGE}/${APP_ACTIVITY}"

    else

        warn "No se pudo iniciar automáticamente la aplicación."
        echo
        echo "Configuración actual:"
        echo "  Package : $APP_PACKAGE"
        echo "  Activity: $APP_ACTIVITY"
        echo

    fi
}

# ================================================================
# ABRIR PWA
# ================================================================

open_pwa() {

    echo
    info "Abriendo Camera Web Pro..."
    echo

    adb shell am start \
        -a android.intent.action.VIEW \
        -d "$PWA_URL"

    echo
    ok "PWA abierta en el navegador."
    echo
    echo "Para instalarla:"
    echo "  1. Abre el menú del navegador."
    echo "  2. Selecciona \"Instalar aplicación\"."
    echo "     o \"Añadir a pantalla de inicio\"."
}

# ================================================================
# REINICIAR ADB
# ================================================================

restart_adb() {

    info "Reiniciando ADB..."

    "$ADB" kill-server >/dev/null 2>&1 || true
    sleep 1

    "$ADB" start-server >/dev/null 2>&1 ||
        die "No se pudo iniciar ADB."

    ok "ADB reiniciado."
}

# ================================================================
# DIAGNÓSTICO
# ================================================================

diagnostics() {

    echo
    echo "====================================================================="
    echo "                         DIAGNÓSTICO ADB"
    echo "====================================================================="
    echo

    echo "Sistema:"
    echo "  $(detect_os)"
    echo

    echo "ADB:"
    echo "  $ADB"
    echo

    echo "Versión:"
    "$ADB" version
    echo

    echo "Dispositivos:"
    list_devices
    echo

    if [[ -n "${ANDROID_SERIAL:-}" ]]; then

        echo "Dispositivo seleccionado:"
        echo "  $ANDROID_SERIAL"
        echo

        echo "Modelo:"
        adb shell getprop ro.product.model 2>/dev/null || true

        echo
        echo "Fabricante:"
        adb shell getprop ro.product.manufacturer 2>/dev/null || true

        echo
        echo "Android:"
        adb shell getprop ro.build.version.release 2>/dev/null || true

    fi
}

# ================================================================
# MENÚ
# ================================================================

menu() {

    while true; do

        header

        echo "Dispositivo:"
        echo "  ${ANDROID_SERIAL:-No seleccionado}"
        echo

        echo "  [1] Compilar e instalar APK"
        echo "  [2] Instalar APK existente"
        echo "  [3] Abrir Camera Web Pro (PWA)"
        echo "  [4] Diagnóstico ADB"
        echo "  [5] Reiniciar ADB"
        echo "  [6] Volver a detectar teléfono"
        echo "  [7] Salir"
        echo

        local option

        read -r -p "Selecciona una opción [1-7]: " option

        case "$option" in

            1)
                build_apk &&
                install_apk
                pause_screen
                ;;

            2)
                install_apk
                pause_screen
                ;;

            3)
                open_pwa
                pause_screen
                ;;

            4)
                diagnostics
                pause_screen
                ;;

            5)
                restart_adb
                pause_screen
                ;;

            6)
                wait_for_device
                pause_screen
                ;;

            7)
                echo
                ok "Instalador finalizado."
                echo
                exit 0
                ;;

            *)
                warn "Opción inválida."
                sleep 1
                ;;

        esac

    done
}

# ================================================================
# ARGUMENTOS DE LÍNEA DE COMANDOS
# ================================================================

run_command() {

    case "${1:-}" in

        --build)
            build_apk
            ;;

        --install)
            install_apk
            ;;

        --pwa)
            open_pwa
            ;;

        --restart-adb)
            restart_adb
            ;;

        --diagnostics)
            diagnostics
            ;;

        --help|-h)
            echo
            echo "Uso:"
            echo "  ./instalar_usb.sh                 Menú interactivo"
            echo "  ./instalar_usb.sh --build        Compilar APK"
            echo "  ./instalar_usb.sh --install      Instalar APK"
            echo "  ./instalar_usb.sh --pwa          Abrir PWA"
            echo "  ./instalar_usb.sh --restart-adb  Reiniciar ADB"
            echo "  ./instalar_usb.sh --diagnostics  Diagnóstico"
            echo
            ;;

        "")
            menu
            ;;

        *)
            error "Argumento desconocido: $1"
            echo
            echo "Usa --help para ver las opciones."
            exit 1
            ;;

    esac
}

# ================================================================
# MAIN
# ================================================================

main() {

    header

    info "Inicializando instalador..."
    echo

    setup_adb || exit 1

    echo

    if ! check_device; then
        wait_for_device
    fi

    echo

    ok "Sistema preparado."
    echo

    run_command "${1:-}"
}

main "$@"
