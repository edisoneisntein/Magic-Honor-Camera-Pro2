import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Smartphone, 
  Laptop, 
  Check, 
  X, 
  Sparkles, 
  ShieldCheck, 
  ExternalLink, 
  Share2, 
  Layers, 
  Cpu, 
  AlertCircle,
  FileDown,
  RotateCcw,
  Usb,
  Terminal,
  Copy,
  CheckCheck,
  Play
} from 'lucide-react';
import { SoundEffects } from '../services/soundEffects';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  isStandalone: boolean;
}

export const InstallModal: React.FC<InstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  isStandalone,
}) => {
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('android');
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);
  const [activeTab, setActiveTab] = useState<'direct' | 'usb' | 'guide' | 'download'>('usb');
  const [isInIframe, setIsInIframe] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // Detect if inside iframe
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  if (!isOpen) return null;

  // Trigger Native PWA install prompt via deferredPrompt
  const handleInstallToSystem = async () => {
    SoundEffects.playTick();
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
          setInstallResult('accepted');
          SoundEffects.playFocusBeep();
        } else {
          setInstallResult('dismissed');
        }
      } catch (err) {
        console.error('Error invoking native PWA install prompt:', err);
        setInstallResult('dismissed');
      } finally {
        setInstalling(false);
      }
    } else {
      if (isInIframe) {
        // Open top-level URL so native browser prompt triggers directly
        window.open(window.location.href, '_blank', 'noopener,noreferrer');
      } else {
        // Switch to device specific guide
        setActiveTab('guide');
      }
    }
  };

  // Generate and download an offline self-contained HTML launcher
  const handleDownloadLauncher = () => {
    SoundEffects.playTick();
    const currentUrl = window.location.href;
    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Magic Camera Pro - Lanzador</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #ffffff; font-family: -apple-system, system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
    .card { background: #141414; border: 1px solid #333; border-radius: 24px; padding: 32px 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }
    .badge { display: inline-block; background: rgba(255,149,0,0.2); border: 1px solid rgba(255,149,0,0.4); color: #FF9500; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; letter-spacing: 1px; }
    h1 { font-size: 24px; margin: 0 0 8px 0; font-weight: 800; }
    p { color: #888888; font-size: 13px; margin: 0 0 24px 0; }
    .btn { display: block; background: #FF9500; color: #000000; padding: 16px 24px; border-radius: 16px; font-weight: 800; text-decoration: none; font-size: 15px; box-shadow: 0 0 20px rgba(255,149,0,0.4); transition: transform 0.1s ease; }
    .btn:active { transform: scale(0.98); }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">HONOR Magic8 Lite &bull; MagicOS 10</div>
    <h1>📷 Magic Camera Pro</h1>
    <p>Cámara profesional IA con sensor 108MP, RAW DNG y controles manuales reales.</p>
    <a class="btn" href="${currentUrl}">Iniciar Cámara Pro</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "${currentUrl}";
    }, 400);
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Magic_Camera_Pro_Launcher.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate and download Web App Manifest package
  const handleDownloadManifest = () => {
    SoundEffects.playTick();
    const manifestData = {
      name: "Magic Camera Pro - HONOR Magic8 Lite",
      short_name: "Magic Cam Pro",
      description: "Cámara profesional IA para HONOR Magic8 Lite con MagicOS 10.",
      start_url: window.location.origin,
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      version: "1.0.0",
      features: ["108MP Sensor", "RAW DNG", "Manual ISO/Shutter", "Cinema Scopes", "AI Ultra"]
    };

    const blob = new Blob([JSON.stringify(manifestData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'magic_camera_pro_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    SoundEffects.playTick();
    setTimeout(() => setCopiedText(null), 2500);
  };

  const handleDownloadUsbBat = () => {
    SoundEffects.playTick();
    const currentUrl = window.location.href;
    const content = `@echo off
chcp 65001 > nul
title Instalador USB - Prometheus / Magic Camera Pro
cls
echo =====================================================================
echo      INSTALADOR VIA USB - PROMETHEUS / MAGIC CAMERA PRO
echo =====================================================================
echo.

where adb >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe" (
        set "ADB=%LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe"
    ) else (
        echo [ERROR] No se encontro 'adb' en el sistema ni en Android SDK.
        echo Descarga Platform-Tools de Android: https://developer.android.com/tools/releases/platform-tools
        pause
        exit /b 1
    )
) else (
    set "ADB=adb"
)

echo [1/3] Detectando telefono conectado por cable USB...
%ADB% devices
echo.

echo [2/3] Abriendo Camara Pro en tu telefono conectado...
%ADB% shell am start -a android.intent.action.VIEW -d "${currentUrl}"
echo.
echo [3/3] ¡Enlace transmitido con exito a tu telefono!
echo En tu celular, toca los tres puntos (⋮) de Chrome y selecciona "Instalar aplicacion".
echo.
pause
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'instalar_usb.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadUsbSh = () => {
    SoundEffects.playTick();
    const currentUrl = window.location.href;
    const content = `#!/bin/bash
set -e
echo "====================================================================="
echo "     INSTALADOR VIA USB - PROMETHEUS / MAGIC CAMERA PRO"
echo "====================================================================="
if ! command -v adb &> /dev/null; then
    if [ -f "$HOME/Library/Android/sdk/platform-tools/adb" ]; then
        ADB="$HOME/Library/Android/sdk/platform-tools/adb"
    elif [ -f "$HOME/Android/Sdk/platform-tools/adb" ]; then
        ADB="$HOME/Android/Sdk/platform-tools/adb"
    else
        echo "[ERROR] No se encontro 'adb'. Instala android-platform-tools con: brew install android-platform-tools"
        exit 1
    fi
else
    ADB="adb"
fi

echo "[1/2] Dispositivos USB conectados:"
$ADB devices
echo ""
echo "[2/2] Abriendo aplicacion en el telefono..."
$ADB shell am start -a android.intent.action.VIEW -d "${currentUrl}"
echo "¡Completado! App abierta en el dispositivo."
`;
    const blob = new Blob([content], { type: 'text/x-sh' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'instalar_usb.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      id="modal-install-app"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-fadeIn font-mono select-none"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-[#0C0C0C]/95 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4 bg-linear-to-r from-neutral-900 via-neutral-900 to-black">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF9500]/20 border border-[#FF9500]/40 text-[#FF9500]">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider text-white">
                INSTALADOR DE CÁMARA PRO
              </h2>
              <p className="text-[10px] text-white/50">
                HONOR Magic8 Lite &bull; MagicOS 10 WebAPK / PWA
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              SoundEffects.playTick();
              onClose();
            }}
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            title="Cerrar instalador"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="px-5 pt-4 pb-2">
          {isStandalone ? (
            <div className="flex items-center gap-2.5 rounded-2xl bg-green-500/15 border border-green-500/30 p-3 text-green-400">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <div className="text-xs">
                <div className="font-bold">¡Aplicación ya instalada en el sistema!</div>
                <div className="text-[10px] text-green-300/80">Ejecutándose en modo nativo a pantalla completa sin marcos de navegador.</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-2xl bg-[#FF9500]/15 border border-[#FF9500]/30 p-3 text-[#FF9500]">
              <Sparkles className="h-5 w-5 shrink-0" />
              <div className="text-xs">
                <div className="font-bold">Instalación Nativa Disponible</div>
                <div className="text-[10px] text-[#FF9500]/80">Acceso directo en la pantalla de inicio con soporte offline y latencia cero.</div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 px-5 pt-2 gap-1 text-xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => { SoundEffects.playTick(); setActiveTab('usb'); }}
            className={`pb-2.5 px-3 font-bold transition-all border-b-2 flex items-center gap-1.5 shrink-0 ${
              activeTab === 'usb'
                ? 'border-[#FF9500] text-[#FF9500]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Usb className="h-3.5 w-3.5" />
            <span>Vía USB / ADB</span>
          </button>
          <button
            onClick={() => { SoundEffects.playTick(); setActiveTab('direct'); }}
            className={`pb-2.5 px-3 font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'direct'
                ? 'border-[#FF9500] text-[#FF9500]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            Instalar PWA
          </button>
          <button
            onClick={() => { SoundEffects.playTick(); setActiveTab('guide'); }}
            className={`pb-2.5 px-3 font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'guide'
                ? 'border-[#FF9500] text-[#FF9500]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            Guía Dispositivos
          </button>
          <button
            onClick={() => { SoundEffects.playTick(); setActiveTab('download'); }}
            className={`pb-2.5 px-3 font-bold transition-all border-b-2 shrink-0 ${
              activeTab === 'download'
                ? 'border-[#FF9500] text-[#FF9500]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            Descargables
          </button>
        </div>

        {/* Tab 0: USB / ADB Direct Cable Installation */}
        {activeTab === 'usb' && (
          <div className="p-5 space-y-4 max-h-80 overflow-y-auto scrollbar-none">
            {/* Header Alert */}
            <div className="rounded-2xl bg-[#FF9500]/10 border border-[#FF9500]/30 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#FF9500]">
                <Usb className="h-4 w-4 shrink-0" />
                <span>Instalación por Cable USB a Teléfono Conectado</span>
              </div>
              <p className="text-[11px] text-white/70 leading-relaxed">
                Sigue estos pasos para instalar o abrir la app directamente en tu teléfono HONOR / Android conectado por cable a esta computadora:
              </p>
            </div>

            {/* Step 1: Phone Setup */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-[10px] text-amber-300 font-extrabold">1</span>
                <span>Configurar tu Teléfono (HONOR MagicOS / Android)</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-white/80 text-[11px]">
                <li>Ve a <strong>Ajustes &gt; Acerca del teléfono</strong> y presiona <strong>7 veces seguidas</strong> sobre <em>"Número de compilación"</em>.</li>
                <li>Ve a <strong>Ajustes &gt; Sistema y actualizaciones &gt; Opciones de desarrollador</strong> y activa:
                  <div className="mt-1 ml-4 space-y-0.5 text-amber-200/90 font-mono text-[10px]">
                    <div>&bull; <strong>Depuración USB</strong> (Habilitar)</div>
                    <div>&bull; <strong>Instalar aplicaciones vía USB</strong> (Habilitar)</div>
                  </div>
                </li>
                <li>Conecta el cable USB en modo <strong>"Transferencia de archivos"</strong> (MTP).</li>
                <li>En la pantalla de tu móvil aparecerá un aviso: marca <strong>"Permitir siempre desde este equipo"</strong> y pulsa <strong>Aceptar</strong>.</li>
              </ol>
            </div>

            {/* Step 2: 1-Click Automated Scripts */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2.5 text-xs">
              <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400/20 text-[10px] text-cyan-300 font-extrabold">2</span>
                <span>Scripts de Instalación Automática (1 Clic)</span>
              </div>
              <p className="text-[11px] text-white/70">
                Descarga el script en tu PC, haz doble clic y se encargará de detectar tu celular conectado e instalar la aplicación:
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleDownloadUsbBat}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>instalar_usb.bat (Windows)</span>
                  </div>
                  <Download className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                </button>

                <button
                  onClick={handleDownloadUsbSh}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 shrink-0 text-cyan-400" />
                    <span>instalar_usb.sh (Mac / Linux)</span>
                  </div>
                  <Download className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                </button>
              </div>
            </div>

            {/* Step 3: Terminal Commands with 1-Click Copy */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2.5 text-xs">
              <div className="font-bold text-green-400 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-400/20 text-[10px] text-green-300 font-extrabold">3</span>
                <span>Comandos ADB Manuales (Terminal)</span>
              </div>
              
              <div className="space-y-2">
                {/* Check Devices */}
                <div className="bg-black/60 rounded-xl p-2.5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="overflow-hidden">
                    <div className="text-[9px] text-white/40">1. Verificar que tu móvil esté detectado:</div>
                    <code className="text-amber-300 text-xs font-mono">adb devices</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard('adb devices')}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                    title="Copiar comando"
                  >
                    {copiedText === 'adb devices' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Open in phone browser */}
                <div className="bg-black/60 rounded-xl p-2.5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="overflow-hidden">
                    <div className="text-[9px] text-white/40">2. Abrir e instalar Cámara en el móvil vía USB:</div>
                    <code className="text-cyan-300 text-[10px] font-mono truncate block">
                      adb shell am start -a android.intent.action.VIEW -d "{window.location.href}"
                    </code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`adb shell am start -a android.intent.action.VIEW -d "${window.location.href}"`)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                    title="Copiar comando"
                  >
                    {copiedText?.startsWith('adb shell am start') ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Install Native APK */}
                <div className="bg-black/60 rounded-xl p-2.5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="overflow-hidden">
                    <div className="text-[9px] text-white/40">3. Instalar APK Nativo (Camera2 108MP):</div>
                    <code className="text-green-300 text-[10px] font-mono truncate block">
                      adb install -r android-project/app/build/outputs/apk/debug/app-debug.apk
                    </code>
                  </div>
                  <button
                    onClick={() => copyToClipboard('adb install -r android-project/app/build/outputs/apk/debug/app-debug.apk')}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                    title="Copiar comando"
                  >
                    {copiedText?.startsWith('adb install') ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Direct Install to System Action */}
        {activeTab === 'direct' && (
          <div className="p-5 space-y-4">
            {installResult === 'accepted' ? (
              <div className="text-center py-6 space-y-3">
                <div className="inline-flex p-3 rounded-full bg-green-500/20 text-green-400 border border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                  <Check className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold text-white">¡Instalación Aceptada!</h3>
                <p className="text-xs text-white/70 max-w-xs mx-auto">
                  Magic Camera Pro se ha agregado a tu sistema. Ya puedes abrirla desde tu pantalla de inicio o cajón de aplicaciones.
                </p>
                <button
                  onClick={() => {
                    SoundEffects.playTick();
                    onClose();
                  }}
                  className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
                >
                  Continuar en la Cámara
                </button>
              </div>
            ) : (
              <>
                {/* Hardware Feature Highlights */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
                    <Layers className="h-4 w-4 mx-auto text-[#FF9500] mb-1" />
                    <div className="text-[10px] font-bold text-white">Modo Offline</div>
                    <div className="text-[8px] text-white/40">Caché Service Worker</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
                    <Cpu className="h-4 w-4 mx-auto text-cyan-400 mb-1" />
                    <div className="text-[10px] font-bold text-white">MagicOS 10</div>
                    <div className="text-[8px] text-white/40">Optimizado 120Hz</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
                    <Smartphone className="h-4 w-4 mx-auto text-purple-400 mb-1" />
                    <div className="text-[10px] font-bold text-white">Pantalla Completa</div>
                    <div className="text-[8px] text-white/40">Sin marcos UI</div>
                  </div>
                </div>

                {installResult === 'dismissed' && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-amber-300 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>La instalación fue cancelada. Puedes volver a intentarlo cuando lo desees.</span>
                  </div>
                )}

                {/* Primary Action: Install to System Button */}
                <div className="space-y-2.5 pt-1">
                  <button
                    id="btn-install-to-system"
                    onClick={handleInstallToSystem}
                    disabled={installing}
                    className="w-full flex items-center justify-center gap-2.5 py-4 px-5 rounded-2xl bg-linear-to-r from-[#FF9500] to-amber-500 hover:from-amber-400 hover:to-[#FF9500] text-black font-extrabold text-sm shadow-[0_0_24px_rgba(255,149,0,0.5)] active:scale-98 transition-all cursor-pointer"
                  >
                    {installing ? (
                      <>
                        <RotateCcw className="h-4 w-4 animate-spin" />
                        <span>Abriendo diálogo del sistema...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        <span>Install to System / Instalar en el Sistema</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-[9px] text-white/40 px-1">
                    <span>Diálogo nativo PWA / WebAPK</span>
                    <span>Android &bull; iOS &bull; Windows &bull; macOS</span>
                  </div>
                </div>

                {isInIframe && (
                  <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-2.5 text-xs text-white/70">
                    <div className="flex items-center gap-2 text-[11px]">
                      <ExternalLink className="h-3.5 w-3.5 text-[#FF9500]" />
                      <span>¿Estás en vista previa embebida?</span>
                    </div>
                    <button
                      onClick={() => window.open(window.location.href, '_blank', 'noopener,noreferrer')}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[#FF9500] font-bold text-[10px] transition-colors"
                    >
                      Abrir Pestaña
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Step-by-Step Device Guides */}
        {activeTab === 'guide' && (
          <div className="p-5 space-y-4 max-h-72 overflow-y-auto scrollbar-none">
            {/* Device Selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setPlatform('android')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                  platform === 'android'
                    ? 'bg-[#FF9500] text-black border-[#FF9500]'
                    : 'bg-white/5 text-white/70 border-white/10'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Android / MagicOS</span>
              </button>
              <button
                onClick={() => setPlatform('ios')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                  platform === 'ios'
                    ? 'bg-[#FF9500] text-black border-[#FF9500]'
                    : 'bg-white/5 text-white/70 border-white/10'
                }`}
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>iPhone / iOS</span>
              </button>
              <button
                onClick={() => setPlatform('desktop')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                  platform === 'desktop'
                    ? 'bg-[#FF9500] text-black border-[#FF9500]'
                    : 'bg-white/5 text-white/70 border-white/10'
                }`}
              >
                <Laptop className="h-3.5 w-3.5" />
                <span>PC / Mac</span>
              </button>
            </div>

            {/* Android Instructions */}
            {platform === 'android' && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="font-bold text-[#FF9500] flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4" />
                  <span>Instalación en HONOR / Android (Chrome / Navegador HONOR):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-white/80 text-[11px]">
                  <li>Pulsa el botón de opciones <strong>tres puntos (⋮)</strong> en la esquina superior del navegador.</li>
                  <li>Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Añadir a la pantalla principal"</strong>.</li>
                  <li>Confirma pulsando <strong>"Instalar"</strong>. Se creará el acceso nativo con icono HD de 108 MP.</li>
                </ol>
              </div>
            )}

            {/* iOS Instructions */}
            {platform === 'ios' && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <Share2 className="h-4 w-4" />
                  <span>Instalación en iPhone / iPad (Safari):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-white/80 text-[11px]">
                  <li>Abre la aplicación en <strong>Safari</strong>.</li>
                  <li>Pulsa el botón <strong>Compartir (⎋)</strong> en la barra inferior.</li>
                  <li>Desliza hacia abajo y toca <strong>"Añadir a la pantalla de inicio"</strong>.</li>
                  <li>Pulsa <strong>"Añadir"</strong> en la esquina superior derecha.</li>
                </ol>
              </div>
            )}

            {/* Desktop Instructions */}
            {platform === 'desktop' && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="font-bold text-purple-400 flex items-center gap-1.5">
                  <Laptop className="h-4 w-4" />
                  <span>Instalación en Chrome / Edge (Windows & Mac):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-white/80 text-[11px]">
                  <li>Observa la barra de direcciones superior del navegador.</li>
                  <li>Haz clic en el icono de instalación <strong>(⊕ Instalar aplicación)</strong>.</li>
                  <li>Confirma <strong>"Instalar"</strong> para abrirla en una ventana independiente sin marcos.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Downloads & Offline Packages */}
        {activeTab === 'download' && (
          <div className="p-5 space-y-3">
            <div className="text-xs text-white/70 mb-2">
              Descarga paquetes sin conexión o archivos de acceso rápido directo a tu dispositivo:
            </div>

            {/* Download Offline HTML Launcher */}
            <button
              onClick={handleDownloadLauncher}
              className="flex items-center justify-between w-full p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <FileDown className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#FF9500] transition-colors">
                    Lanzador Web Offline (.html)
                  </div>
                  <div className="text-[9px] text-white/40">
                    Archivo ejecutable para abrir la cámara instantáneamente
                  </div>
                </div>
              </div>
              <Download className="h-4 w-4 text-white/50 group-hover:text-white" />
            </button>

            {/* Download Web Manifest Config */}
            <button
              onClick={handleDownloadManifest}
              className="flex items-center justify-between w-full p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">
                    Configuración PWA Manifest (.json)
                  </div>
                  <div className="text-[9px] text-white/40">
                    Metadatos de instalación para MagicOS y Android
                  </div>
                </div>
              </div>
              <Download className="h-4 w-4 text-white/50 group-hover:text-white" />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 p-4 bg-black/60 text-[10px] text-white/40">
          <span>Versión: <strong>1.0.0-PRO</strong></span>
          <button
            onClick={() => { SoundEffects.playTick(); onClose(); }}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
