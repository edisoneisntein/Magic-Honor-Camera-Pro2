# PROMETHEUS NATIVE CAMERA2 (PROYECTO ANDROID STUDIO REAL)

Este directorio contiene el **código fuente nativo en Kotlin y Camera2 API** para compilar e instalar directamente en tu teléfono Android (APK) con **acceso total y real al hardware de tu cámara**:

---

### 📂 Estructura del Código Nativo Generado:

1. **`app/src/main/java/com/prometheus/camera/nativeengine/PrometheusNativeCamera2Engine.kt`**:
   - **Acceso Directo al ISP de Hardware**:
     - `CaptureRequest.SENSOR_SENSITIVITY` $\rightarrow$ Control de ganancia analógica real de ISO (50 a 6400).
     - `CaptureRequest.SENSOR_EXPOSURE_TIME` $\rightarrow$ Tiempo físico real de obturación en nanosegundos (1/8000s hasta 30s de exposición física).
     - `CaptureRequest.LENS_FOCUS_DISTANCE` $\rightarrow$ Enfoque manual directo por motor de bobina (VCM).
     - `ImageReader` en formato `ImageFormat.RAW_SENSOR` (DNG) y `ImageFormat.JPEG` al 100% de resolución física del sensor.
     - Bloqueo de autoexposición (`CONTROL_AE_MODE_OFF`) y autoenfoque (`CONTROL_AF_MODE_OFF`).

2. **`app/src/main/java/com/prometheus/camera/MainActivity.kt`**:
   - Interfaz nativa Android con `TextureView` conectado directamente a la superficie de hardware.
   - Deslizadores en tiempo real para ISO y tiempo de obturación físico.
   - Guardado automático de imágenes en memoria del dispositivo (`DCIM` / `ExternalFilesDir`).

3. **`app/src/main/AndroidManifest.xml`**:
   - Declaración de permisos de bajo nivel: `CAMERA`, `manual_sensor`, `manual_post_processing`, `raw`.

4. **`app/build.gradle`**:
   - Configuración lista para compilar con Gradle en **Android Studio**.

---

### 🚀 Cómo compilar tu APK real en Android Studio:
1. Abre **Android Studio**.
2. Selecciona **Open an Existing Project** y elige la carpeta `android-project`.
3. Conecta tu teléfono por USB con Depuración USB activada.
4. Presiona **Run (▶)** o genera tu APK en **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
