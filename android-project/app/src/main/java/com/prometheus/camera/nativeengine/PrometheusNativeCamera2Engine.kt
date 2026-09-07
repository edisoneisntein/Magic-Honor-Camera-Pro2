package com.prometheus.camera.nativeengine

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.hardware.camera2.params.StreamConfigurationMap
import android.hardware.camera2.DngCreator
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.Surface
import androidx.core.content.ContextCompat
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * PROMETHEUS NATIVE CAMERA2 ENGINE
 *
 * Cámara Android Camera2 con:
 *
 * - Preview en SurfaceTexture
 * - JPEG a máxima resolución soportada
 * - RAW_SENSOR cuando el hardware lo permite
 * - Conversión RAW_SENSOR -> DNG válido mediante DngCreator
 * - ISO manual limitado por las capacidades reales del sensor
 * - Exposición manual limitada por las capacidades reales
 * - Enfoque manual limitado por las capacidades reales
 * - Auto Exposure / Auto Focus / Auto White Balance
 * - Gestión segura del ciclo de vida
 * - Thread dedicado para operaciones Camera2
 * - Protección contra operaciones simultáneas
 */
class PrometheusNativeCamera2Engine(
    private val context: Context
) {

    companion object {
        private const val TAG = "PrometheusCamera2"

        private const val CAMERA_LOCK_TIMEOUT_MS = 2500L

        private const val JPEG_MAX_IMAGES = 3
        private const val RAW_MAX_IMAGES = 3

        private const val DEFAULT_PREVIEW_WIDTH = 1920
        private const val DEFAULT_PREVIEW_HEIGHT = 1080

        private const val DEFAULT_ISO = 100
        private const val DEFAULT_EXPOSURE_NS = 10_000_000L
        private const val DEFAULT_FOCUS_DISTANCE = 0.0f
    }

    private val cameraManager: CameraManager =
        context.getSystemService(Context.CAMERA_SERVICE) as CameraManager

    private val cameraOpenCloseLock = Semaphore(1, true)

    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null

    private var previewRequestBuilder: CaptureRequest.Builder? = null
    private var previewRequest: CaptureRequest? = null

    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null

    private var imageReaderJpeg: ImageReader? = null
    private var imageReaderRaw: ImageReader? = null

    private var previewSurface: Surface? = null

    private var cameraCharacteristics: CameraCharacteristics? = null

    private var previewSize: Size = Size(
        DEFAULT_PREVIEW_WIDTH,
        DEFAULT_PREVIEW_HEIGHT
    )

    private var jpegSize: Size? = null
    private var rawSize: Size? = null

    private var rawSupported: Boolean = false
    private var manualControlSupported: Boolean = false

    private var isCameraOpening = false
    private var isCameraClosing = false
    private var isCapturing = false

    /**
     * Camera ID actualmente utilizada.
     */
    var currentCameraId: String = "0"
        private set

    /**
     * true = controles manuales.
     * false = controles automáticos.
     */
    var isManualMode: Boolean = false
        private set

    /**
     * Valores manuales solicitados por la aplicación.
     */
    var manualIso: Int = DEFAULT_ISO
        private set

    var manualExposureTimeNs: Long = DEFAULT_EXPOSURE_NS
        private set

    var manualFocusDistance: Float = DEFAULT_FOCUS_DISTANCE
        private set

    interface CameraCallback {
        fun onCameraReady()

        fun onPhotoCaptured(
            file: File,
            isRaw: Boolean
        )

        fun onError(message: String)
    }

    var callback: CameraCallback? = null

    // -------------------------------------------------------------------------
    // THREAD
    // -------------------------------------------------------------------------

    fun startBackgroundThread() {
        if (backgroundThread != null) {
            return
        }

        backgroundThread = HandlerThread(
            "PrometheusCamera2Background"
        ).also {
            it.start()
        }

        backgroundHandler = Handler(
            backgroundThread!!.looper
        )
    }

    fun stopBackgroundThread() {
        val thread = backgroundThread ?: return

        thread.quitSafely()

        try {
            thread.join()
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            Log.e(TAG, "Interrupted stopping camera thread", e)
        } finally {
            backgroundThread = null
            backgroundHandler = null
        }
    }

    // -------------------------------------------------------------------------
    // OPEN CAMERA
    // -------------------------------------------------------------------------

    fun openCamera(
        surfaceTexture: SurfaceTexture,
        width: Int,
        height: Int
    ) {
        if (
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notifyError("Se requiere permiso de cámara de Android")
            return
        }

        if (cameraDevice != null || isCameraOpening) {
            Log.d(TAG, "Camera already open/opening")
            return
        }

        if (backgroundThread == null) {
            startBackgroundThread()
        }

        val handler = backgroundHandler

        if (handler == null) {
            notifyError("No se pudo iniciar el thread de cámara")
            return
        }

        isCameraOpening = true
        isCameraClosing = false

        var lockAcquired = false

        try {
            lockAcquired = cameraOpenCloseLock.tryAcquire(
                CAMERA_LOCK_TIMEOUT_MS,
                TimeUnit.MILLISECONDS
            )

            if (!lockAcquired) {
                throw RuntimeException(
                    "Tiempo de espera agotado al bloquear apertura de cámara"
                )
            }

            val selectedCameraId = findBackCameraId()

            if (selectedCameraId == null) {
                throw CameraAccessException(
                    CameraAccessException.CAMERA_ERROR,
                    "No se encontró una cámara trasera"
                )
            }

            currentCameraId = selectedCameraId

            val characteristics =
                cameraManager.getCameraCharacteristics(currentCameraId)

            cameraCharacteristics = characteristics

            val streamMap =
                characteristics.get(
                    CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP
                )

            if (streamMap == null) {
                throw RuntimeException(
                    "El dispositivo no proporciona SCALER_STREAM_CONFIGURATION_MAP"
                )
            }

            configureCapabilities(
                characteristics,
                streamMap
            )

            configureImageReaders(streamMap)

            previewSize = choosePreviewSize(
                streamMap,
                width,
                height
            )

            surfaceTexture.setDefaultBufferSize(
                previewSize.width,
                previewSize.height
            )

            previewSurface = Surface(surfaceTexture)

            cameraManager.openCamera(
                currentCameraId,
                object : CameraDevice.StateCallback() {

                    override fun onOpened(camera: CameraDevice) {
                        isCameraOpening = false

                        cameraOpenCloseLock.release()

                        cameraDevice = camera

                        createCameraPreviewSession(
                            surfaceTexture
                        )
                    }

                    override fun onDisconnected(camera: CameraDevice) {
                        isCameraOpening = false

                        camera.close()

                        if (cameraDevice === camera) {
                            cameraDevice = null
                        }

                        if (cameraOpenCloseLock.availablePermits() == 0) {
                            cameraOpenCloseLock.release()
                        }

                        notifyError("La cámara fue desconectada")
                    }

                    override fun onError(
                        camera: CameraDevice,
                        error: Int
                    ) {
                        isCameraOpening = false

                        camera.close()

                        if (cameraDevice === camera) {
                            cameraDevice = null
                        }

                        if (cameraOpenCloseLock.availablePermits() == 0) {
                            cameraOpenCloseLock.release()
                        }

                        notifyError(
                            "Error de hardware Camera2: código $error"
                        )
                    }

                    override fun onClosed(camera: CameraDevice) {
                        Log.d(TAG, "CameraDevice closed")
                    }
                },
                handler
            )

            lockAcquired = false

        } catch (e: SecurityException) {
            notifyError(
                "Permiso de cámara insuficiente: ${e.message}"
            )
        } catch (e: CameraAccessException) {
            notifyError(
                "Error de acceso Camera2: ${e.message}"
            )
        } catch (e: Exception) {
            notifyError(
                "Fallo al abrir cámara nativa: ${e.message}"
            )
        } finally {
            isCameraOpening = false

            if (lockAcquired) {
                cameraOpenCloseLock.release()
            }
        }
    }

    // -------------------------------------------------------------------------
    // CAMERA DISCOVERY
    // -------------------------------------------------------------------------

    private fun findBackCameraId(): String? {
        for (id in cameraManager.cameraIdList) {
            try {
                val characteristics =
                    cameraManager.getCameraCharacteristics(id)

                val facing =
                    characteristics.get(
                        CameraCharacteristics.LENS_FACING
                    )

                if (facing == CameraCharacteristics.LENS_FACING_BACK) {
                    return id
                }
            } catch (e: CameraAccessException) {
                Log.w(
                    TAG,
                    "No se pudieron leer las características de $id",
                    e
                )
            }
        }

        return null
    }

    // -------------------------------------------------------------------------
    // CAPABILITIES
    // -------------------------------------------------------------------------

    private fun configureCapabilities(
        characteristics: CameraCharacteristics,
        map: StreamConfigurationMap
    ) {
        val rawSizes =
            map.getOutputSizes(ImageFormat.RAW_SENSOR)

        rawSupported =
            rawSizes != null && rawSizes.isNotEmpty()

        val capabilities =
            characteristics.get(
                CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES
            )

        manualControlSupported =
            capabilities?.contains(
                CameraCharacteristics
                    .REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR
            ) == true

        Log.d(
            TAG,
            "Camera=$currentCameraId " +
                    "RAW=$rawSupported " +
                    "ManualSensor=$manualControlSupported"
        )

        if (rawSupported) {
            Log.d(
                TAG,
                "RAW sizes=${rawSizes?.joinToString()}"
            )
        }

        characteristics.get(
            CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE
        )?.let {
            Log.d(TAG, "ISO range=$it")
        }

        characteristics.get(
            CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE
        )?.let {
            Log.d(TAG, "Exposure range=$it")
        }

        characteristics.get(
            CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE
        )?.let {
            Log.d(TAG, "Minimum focus distance=$it")
        }
    }

    // -------------------------------------------------------------------------
    // IMAGE READERS
    // -------------------------------------------------------------------------

    private fun configureImageReaders(
        map: StreamConfigurationMap
    ) {
        closeImageReaders()

        jpegSize =
            map.getOutputSizes(ImageFormat.JPEG)
                ?.maxByOrNull { it.area() }

        if (jpegSize == null) {
            throw RuntimeException(
                "La cámara no proporciona una salida JPEG"
            )
        }

        imageReaderJpeg = ImageReader.newInstance(
            jpegSize!!.width,
            jpegSize!!.height,
            ImageFormat.JPEG,
            JPEG_MAX_IMAGES
        )

        imageReaderJpeg?.setOnImageAvailableListener(
            { reader ->
                val image = try {
                    reader.acquireNextImage()
                } catch (e: Exception) {
                    Log.e(TAG, "Error acquiring JPEG", e)
                    null
                }

                if (image == null) {
                    return@setOnImageAvailableListener
                }

                backgroundHandler?.post {
                    saveJpeg(image)
                } ?: image.close()
            },
            backgroundHandler
        )

        val rawSizes =
            map.getOutputSizes(ImageFormat.RAW_SENSOR)

        rawSize =
            rawSizes?.maxByOrNull { it.area() }

        if (rawSize != null) {
            imageReaderRaw = ImageReader.newInstance(
                rawSize!!.width,
                rawSize!!.height,
                ImageFormat.RAW_SENSOR,
                RAW_MAX_IMAGES
            )

            imageReaderRaw?.setOnImageAvailableListener(
                { reader ->
                    val image = try {
                        reader.acquireNextImage()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error acquiring RAW", e)
                        null
                    }

                    if (image == null) {
                        return@setOnImageAvailableListener
                    }

                    backgroundHandler?.post {
                        saveRawAsDng(image)
                    } ?: image.close()
                },
                backgroundHandler
            )
        }

        Log.d(
            TAG,
            "JPEG=$jpegSize RAW=$rawSize"
        )
    }

    // -------------------------------------------------------------------------
    // PREVIEW SESSION
    // -------------------------------------------------------------------------

    private fun createCameraPreviewSession(
        surfaceTexture: SurfaceTexture
    ) {
        val camera = cameraDevice

        if (camera == null) {
            notifyError("CameraDevice no disponible")
            return
        }

        val handler = backgroundHandler

        if (handler == null) {
            notifyError("Handler de cámara no disponible")
            return
        }

        val preview = previewSurface

        if (preview == null) {
            notifyError("Preview Surface no disponible")
            return
        }

        val jpegReader = imageReaderJpeg

        if (jpegReader == null) {
            notifyError("JPEG ImageReader no disponible")
            return
        }

        try {
            previewRequestBuilder =
                camera.createCaptureRequest(
                    CameraDevice.TEMPLATE_PREVIEW
                )

            previewRequestBuilder?.addTarget(preview)

            val outputs = ArrayList<Surface>()

            outputs.add(preview)
            outputs.add(jpegReader.surface)

            imageReaderRaw?.surface?.let {
                outputs.add(it)
            }

            camera.createCaptureSession(
                outputs,
                object : CameraCaptureSession.StateCallback() {

                    override fun onConfigured(
                        session: CameraCaptureSession
                    ) {
                        if (cameraDevice == null) {
                            session.close()
                            return
                        }

                        captureSession = session

                        updatePreview()

                        callback?.onCameraReady()
                    }

                    override fun onConfigureFailed(
                        session: CameraCaptureSession
                    ) {
                        session.close()

                        notifyError(
                            "Fallo al configurar sesión de captura Camera2"
                        )
                    }
                },
                handler
            )

        } catch (e: CameraAccessException) {
            notifyError(
                "Error creando sesión Camera2: ${e.message}"
            )
        } catch (e: IllegalArgumentException) {
            notifyError(
                "Configuración de streams no soportada: ${e.message}"
            )
        }
    }

    // -------------------------------------------------------------------------
    // PREVIEW
    // -------------------------------------------------------------------------

    private fun updatePreview() {
        val session = captureSession ?: return
        val builder = previewRequestBuilder ?: return

        if (cameraDevice == null) {
            return
        }

        try {
            applyCommonControls(builder)

            if (isManualMode && manualControlSupported) {
                applyManualControls(builder)
            } else {
                applyAutoControls(builder)
            }

            previewRequest = builder.build()

            session.setRepeatingRequest(
                previewRequest!!,
                null,
                backgroundHandler
            )

        } catch (e: CameraAccessException) {
            Log.e(
                TAG,
                "Error actualizando preview",
                e
            )

            notifyError(
                "Error actualizando previsualización: ${e.message}"
            )
        } catch (e: IllegalStateException) {
            Log.e(
                TAG,
                "Preview session no disponible",
                e
            )
        } catch (e: IllegalArgumentException) {
            Log.e(
                TAG,
                "Parámetro de preview no soportado",
                e
            )
        }
    }

    private fun applyCommonControls(
        builder: CaptureRequest.Builder
    ) {
        builder.set(
            CaptureRequest.CONTROL_CAPTURE_INTENT,
            CameraMetadata.CONTROL_CAPTURE_INTENT_PREVIEW
        )

        builder.set(
            CaptureRequest.CONTROL_MODE,
            CameraMetadata.CONTROL_MODE_AUTO
        )
    }

    private fun applyManualControls(
        builder: CaptureRequest.Builder
    ) {
        builder.set(
            CaptureRequest.CONTROL_MODE,
            CameraMetadata.CONTROL_MODE_OFF
        )

        builder.set(
            CaptureRequest.CONTROL_AE_MODE,
            CameraMetadata.CONTROL_AE_MODE_OFF
        )

        builder.set(
            CaptureRequest.CONTROL_AF_MODE,
            CameraMetadata.CONTROL_AF_MODE_OFF
        )

        builder.set(
            CaptureRequest.SENSOR_SENSITIVITY,
            manualIso
        )

        builder.set(
            CaptureRequest.SENSOR_EXPOSURE_TIME,
            manualExposureTimeNs
        )

        builder.set(
            CaptureRequest.LENS_FOCUS_DISTANCE,
            manualFocusDistance
        )
    }

    private fun applyAutoControls(
        builder: CaptureRequest.Builder
    ) {
        builder.set(
            CaptureRequest.CONTROL_MODE,
            CameraMetadata.CONTROL_MODE_AUTO
        )

        builder.set(
            CaptureRequest.CONTROL_AE_MODE,
            CameraMetadata.CONTROL_AE_MODE_ON
        )

        builder.set(
            CaptureRequest.CONTROL_AF_MODE,
            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
        )

        builder.set(
            CaptureRequest.CONTROL_AWB_MODE,
            CaptureRequest.CONTROL_AWB_MODE_AUTO
        )
    }

    // -------------------------------------------------------------------------
    // MANUAL SETTINGS
    // -------------------------------------------------------------------------

    fun setManualParameters(
        iso: Int,
        exposureSeconds: Double,
        focusDist: Float
    ) {
        val characteristics = cameraCharacteristics

        val isoRange =
            characteristics?.get(
                CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE
            )

        val exposureRange =
            characteristics?.get(
                CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE
            )

        val minIso =
            isoRange?.lower ?: 50

        val maxIso =
            isoRange?.upper ?: 6400

        val requestedIso =
            iso.coerceIn(minIso, maxIso)

        val requestedExposureNs =
            secondsToNanoseconds(exposureSeconds)

        val finalExposureNs =
            if (exposureRange != null) {
                requestedExposureNs.coerceIn(
                    exposureRange.lower,
                    exposureRange.upper
                )
            } else {
                requestedExposureNs.coerceIn(
                    125_000L,
                    30_000_000_000L
                )
            }

        val minimumFocusDistance =
            characteristics?.get(
                CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE
            ) ?: 0.0f

        val finalFocus =
            if (minimumFocusDistance > 0.0f) {
                focusDist.coerceIn(
                    0.0f,
                    minimumFocusDistance
                )
            } else {
                0.0f
            }

        manualIso = requestedIso
        manualExposureTimeNs = finalExposureNs
        manualFocusDistance = finalFocus

        isManualMode = manualControlSupported

        if (!manualControlSupported) {
            notifyError(
                "Este dispositivo no soporta control manual del sensor"
            )
            return
        }

        updatePreview()
    }

    fun setAutoMode() {
        isManualMode = false

        updatePreview()
    }

    // -------------------------------------------------------------------------
    // STILL CAPTURE
    // -------------------------------------------------------------------------

    fun takePicture(
        captureRaw: Boolean = false
    ) {
        val camera = cameraDevice
        val session = captureSession
        val jpegReader = imageReaderJpeg

        if (camera == null || session == null) {
            notifyError("La cámara no está lista")
            return
        }

        if (isCapturing) {
            Log.w(TAG, "Capture ignored: already capturing")
            return
        }

        if (captureRaw && imageReaderRaw == null) {
            notifyError(
                "RAW_SENSOR no está soportado por este dispositivo"
            )
            return
        }

        if (!captureRaw && jpegReader == null) {
            notifyError(
                "JPEG no está disponible"
            )
            return
        }

        isCapturing = true

        try {
            val captureBuilder =
                camera.createCaptureRequest(
                    CameraDevice.TEMPLATE_STILL_CAPTURE
                )

            if (captureRaw) {
                imageReaderRaw?.surface?.let {
                    captureBuilder.addTarget(it)
                }
            } else {
                captureBuilder.addTarget(
                    jpegReader!!.surface
                )
            }

            captureBuilder.set(
                CaptureRequest.CONTROL_CAPTURE_INTENT,
                CameraMetadata.CONTROL_CAPTURE_INTENT_STILL_CAPTURE
            )

            if (isManualMode && manualControlSupported) {
                applyManualControls(
                    captureBuilder
                )
            } else {
                applyAutoControlsForStill(
                    captureBuilder
                )
            }

            if (!captureRaw) {
                captureBuilder.set(
                    CaptureRequest.JPEG_QUALITY,
                    100.toByte()
                )
            }

            /*
             * La rotación real puede depender de la orientación
             * de la aplicación/sensor. No se fuerza aquí porque
             * el Engine original tampoco recibe orientación.
             */

            session.capture(
                captureBuilder.build(),
                object : CameraCaptureSession.CaptureCallback() {

                    override fun onCaptureCompleted(
                        session: CameraCaptureSession,
                        request: CaptureRequest,
                        result: TotalCaptureResult
                    ) {
                        isCapturing = false

                        /*
                         * El resultado RAW necesita metadata del
                         * capture para construir un DNG válido.
                         *
                         * Se guarda como pending metadata para que
                         * ImageReader pueda consumirla.
                         */
                        if (captureRaw) {
                            pendingRawCaptureResult = result
                        }

                        updatePreview()
                    }

                    override fun onCaptureFailed(
                        session: CameraCaptureSession,
                        request: CaptureRequest,
                        failure: CaptureFailure
                    ) {
                        isCapturing = false

                        notifyError(
                            "Falló la captura de imagen: " +
                                    "reason=${failure.reason}"
                        )

                        updatePreview()
                    }
                },
                backgroundHandler
            )

        } catch (e: CameraAccessException) {
            isCapturing = false

            notifyError(
                "Fallo al disparar foto: ${e.message}"
            )
        } catch (e: IllegalStateException) {
            isCapturing = false

            notifyError(
                "Sesión de cámara no disponible: ${e.message}"
            )
        } catch (e: IllegalArgumentException) {
            isCapturing = false

            notifyError(
                "Configuración de captura no soportada: ${e.message}"
            )
        }
    }

    private fun applyAutoControlsForStill(
        builder: CaptureRequest.Builder
    ) {
        builder.set(
            CaptureRequest.CONTROL_MODE,
            CameraMetadata.CONTROL_MODE_AUTO
        )

        builder.set(
            CaptureRequest.CONTROL_AE_MODE,
            CameraMetadata.CONTROL_AE_MODE_ON
        )

        builder.set(
            CaptureRequest.CONTROL_AF_MODE,
            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
        )

        builder.set(
            CaptureRequest.CONTROL_AWB_MODE,
            CameraMetadata.CONTROL_AWB_MODE_AUTO
        )
    }

    // -------------------------------------------------------------------------
    // RAW / DNG
    // -------------------------------------------------------------------------

    @Volatile
    private var pendingRawCaptureResult: TotalCaptureResult? = null

    private fun saveRawAsDng(
        image: Image
    ) {
        val result = pendingRawCaptureResult

        if (result == null) {
            Log.w(
                TAG,
                "RAW recibido sin TotalCaptureResult"
            )

            image.close()

            notifyError(
                "No se pudo obtener metadata para crear DNG"
            )

            return
        }

        val characteristics = cameraCharacteristics

        if (characteristics == null) {
            image.close()

            notifyError(
                "Características de cámara no disponibles"
            )

            return
        }

        val outputFile =
            createOutputFile("dng")

        try {
            FileOutputStream(outputFile).use { output ->

                val dngCreator =
                    DngCreator(
                        characteristics,
                        result
                    )

                dngCreator.writeImage(
                    output,
                    image
                )

                dngCreator.close()
            }

            callback?.onPhotoCaptured(
                outputFile,
                true
            )

        } catch (e: Exception) {
            Log.e(
                TAG,
                "Error creando DNG",
                e
            )

            if (outputFile.exists()) {
                outputFile.delete()
            }

            notifyError(
                "Error guardando RAW/DNG: ${e.message}"
            )

        } finally {
            image.close()

            /*
             * No conservar metadata de capturas antiguas.
             */
            if (pendingRawCaptureResult === result) {
                pendingRawCaptureResult = null
            }
        }
    }

    // -------------------------------------------------------------------------
    // JPEG
    // -------------------------------------------------------------------------

    private fun saveJpeg(
        image: Image
    ) {
        val outputFile =
            createOutputFile("jpg")

        try {
            val buffer =
                image.planes.firstOrNull()?.buffer

            if (buffer == null) {
                throw RuntimeException(
                    "JPEG no contiene un plane válido"
                )
            }

            FileOutputStream(outputFile).use { output ->

                val bytes = ByteArray(
                    buffer.remaining()
                )

                buffer.get(bytes)

                output.write(bytes)

                output.flush()
            }

            callback?.onPhotoCaptured(
                outputFile,
                false
            )

        } catch (e: Exception) {
            Log.e(
                TAG,
                "Error guardando JPEG",
                e
            )

            if (outputFile.exists()) {
                outputFile.delete()
            }

            notifyError(
                "Error guardando imagen: ${e.message}"
            )

        } finally {
            image.close()
        }
    }

    // -------------------------------------------------------------------------
    // FILES
    // -------------------------------------------------------------------------

    private fun createOutputFile(
        extension: String
    ): File {
        val directory =
            context.getExternalFilesDir(null)
                ?: context.filesDir

        if (!directory.exists()) {
            directory.mkdirs()
        }

        return File(
            directory,
            "PROMETHEUS_" +
                    System.currentTimeMillis() +
                    "_" +
                    System.nanoTime() +
                    ".$extension"
        )
    }

    // -------------------------------------------------------------------------
    // PREVIEW SIZE
    // -------------------------------------------------------------------------

    private fun choosePreviewSize(
        map: StreamConfigurationMap,
        requestedWidth: Int,
        requestedHeight: Int
    ): Size {
        val sizes =
            map.getOutputSizes(
                SurfaceTexture::class.java
            ) ?: return Size(
                DEFAULT_PREVIEW_WIDTH,
                DEFAULT_PREVIEW_HEIGHT
            )

        if (sizes.isEmpty()) {
            return Size(
                DEFAULT_PREVIEW_WIDTH,
                DEFAULT_PREVIEW_HEIGHT
            )
        }

        val requestedRatio =
            if (requestedHeight > 0) {
                requestedWidth.toDouble() /
                        requestedHeight.toDouble()
            } else {
                16.0 / 9.0
            }

        val candidates =
            sizes.filter {
                it.width <= 3840 &&
                        it.height <= 2160
            }

        val source =
            if (candidates.isNotEmpty()) {
                candidates
            } else {
                sizes.toList()
            }

        return source.minWithOrNull(
            compareBy<Size> {
                abs(
                    it.aspectRatio() -
                            requestedRatio
                )
            }.thenBy {
                abs(
                    it.width -
                            requestedWidth
                ) +
                        abs(
                            it.height -
                                    requestedHeight
                        )
            }
        ) ?: sizes.maxByOrNull {
            it.area()
        } ?: Size(
            DEFAULT_PREVIEW_WIDTH,
            DEFAULT_PREVIEW_HEIGHT
        )
    }

    // -------------------------------------------------------------------------
    // CLOSE CAMERA
    // -------------------------------------------------------------------------

    fun closeCamera() {
        if (isCameraClosing) {
            return
        }

        isCameraClosing = true
        isCapturing = false
        pendingRawCaptureResult = null

        var lockAcquired = false

        try {
            lockAcquired =
                cameraOpenCloseLock.tryAcquire(
                    CAMERA_LOCK_TIMEOUT_MS,
                    TimeUnit.MILLISECONDS
                )

            if (!lockAcquired) {
                Log.w(
                    TAG,
                    "No se pudo adquirir lock para cerrar cámara"
                )
                return
            }

            try {
                captureSession?.stopRepeating()
            } catch (e: Exception) {
                Log.d(
                    TAG,
                    "stopRepeating durante close",
                    e
                )
            }

            try {
                captureSession?.abortCaptures()
            } catch (e: Exception) {
                Log.d(
                    TAG,
                    "abortCaptures durante close",
                    e
                )
            }

            captureSession?.close()
            captureSession = null

            previewRequestBuilder = null
            previewRequest = null

            cameraDevice?.close()
            cameraDevice = null

            previewSurface?.release()
            previewSurface = null

            closeImageReaders()

            cameraCharacteristics = null

        } catch (e: Exception) {
            Log.e(
                TAG,
                "Error cerrando cámara",
                e
            )
        } finally {
            if (lockAcquired) {
                cameraOpenCloseLock.release()
            }

            isCameraClosing = false
        }
    }

    private fun closeImageReaders() {
        try {
            imageReaderJpeg?.close()
        } catch (e: Exception) {
            Log.d(TAG, "Error cerrando JPEG reader", e)
        }

        imageReaderJpeg = null

        try {
            imageReaderRaw?.close()
        } catch (e: Exception) {
            Log.d(TAG, "Error cerrando RAW reader", e)
        }

        imageReaderRaw = null

        jpegSize = null
        rawSize = null
        rawSupported = false
    }

    // -------------------------------------------------------------------------
    // LIFECYCLE
    // -------------------------------------------------------------------------

    fun release() {
        closeCamera()
        stopBackgroundThread()
        callback = null
    }

    // -------------------------------------------------------------------------
    // ERROR HANDLING
    // -------------------------------------------------------------------------

    private fun notifyError(
        message: String
    ) {
        Log.e(TAG, message)

        backgroundHandler?.post {
            callback?.onError(message)
        } ?: callback?.onError(message)
    }

    // -------------------------------------------------------------------------
    // UTILITIES
    // -------------------------------------------------------------------------

    private fun secondsToNanoseconds(
        seconds: Double
    ): Long {
        if (!seconds.isFinite() || seconds <= 0.0) {
            return 1L
        }

        val nanos =
            seconds * 1_000_000_000.0

        return when {
            nanos >= Long.MAX_VALUE.toDouble() ->
                Long.MAX_VALUE

            nanos <= 1.0 ->
                1L

            else ->
                nanos.toLong()
        }
    }

    private fun Size.area(): Long {
        return width.toLong() *
                height.toLong()
    }

    private fun Size.aspectRatio(): Double {
        if (height <= 0) {
            return 0.0
        }

        return width.toDouble() /
                height.toDouble()
    }

    // -------------------------------------------------------------------------
    // DEBUG / CAPABILITIES
    // -------------------------------------------------------------------------

    fun isRawSupported(): Boolean {
        return rawSupported &&
                imageReaderRaw != null
    }

    fun isManualSensorSupported(): Boolean {
        return manualControlSupported
    }

    fun getSupportedIsoRange(): Range<Int>? {
        return cameraCharacteristics?.get(
            CameraCharacteristics
                .SENSOR_INFO_SENSITIVITY_RANGE
        )
    }

    fun getSupportedExposureRange(): Range<Long>? {
        return cameraCharacteristics?.get(
            CameraCharacteristics
                .SENSOR_INFO_EXPOSURE_TIME_RANGE
        )
    }

    fun getMinimumFocusDistance(): Float {
        return cameraCharacteristics?.get(
            CameraCharacteristics
                .LENS_INFO_MINIMUM_FOCUS_DISTANCE
        ) ?: 0.0f
    }

    fun getJpegSize(): Size? {
        return jpegSize
    }

    fun getRawSize(): Size? {
        return rawSize
    }

    fun getPreviewSize(): Size {
        return previewSize
    }
}
