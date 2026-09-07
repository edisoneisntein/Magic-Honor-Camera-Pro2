package com.prometheus.camera

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.SurfaceTexture
import android.os.Bundle
import android.view.TextureView
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.prometheus.camera.nativeengine.PrometheusNativeCamera2Engine
import java.io.File
import kotlin.math.roundToInt

class MainActivity :
    AppCompatActivity(),
    TextureView.SurfaceTextureListener {

    private lateinit var textureView: TextureView
    private lateinit var btnCapture: Button
    private lateinit var btnTogglePro: Button
    private lateinit var proControlsContainer: LinearLayout

    private lateinit var sbIso: SeekBar
    private lateinit var sbShutter: SeekBar

    private lateinit var txtIsoValue: TextView
    private lateinit var txtShutterValue: TextView
    private lateinit var txtStatus: TextView

    private lateinit var cameraEngine:
            PrometheusNativeCamera2Engine

    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------

    private var currentIso = DEFAULT_ISO
    private var currentExposureSec = DEFAULT_EXPOSURE_SEC

    private var isProMode = false
    private var isCameraReady = false
    private var isChangingSeekBar = false

    private var supportedIsoMin = DEFAULT_ISO
    private var supportedIsoMax = DEFAULT_MAX_ISO

    private var supportedExposureMinNs =
        DEFAULT_MIN_EXPOSURE_NS

    private var supportedExposureMaxNs =
        DEFAULT_MAX_EXPOSURE_NS

    // -------------------------------------------------------------------------
    // CONSTANTS
    // -------------------------------------------------------------------------

    companion object {

        private const val DEFAULT_ISO = 100
        private const val DEFAULT_MAX_ISO = 6400

        private const val DEFAULT_EXPOSURE_SEC = 0.01

        private const val DEFAULT_MIN_EXPOSURE_NS =
            125_000L

        private const val DEFAULT_MAX_EXPOSURE_NS =
            30_000_000_000L

        /*
         * Valores fotográficos conocidos.
         *
         * El Engine posteriormente los limita al rango real
         * soportado por el sensor.
         */
        private val ISO_VALUES = intArrayOf(
            50,
            64,
            80,
            100,
            125,
            160,
            200,
            250,
            320,
            400,
            500,
            640,
            800,
            1000,
            1250,
            1600,
            2000,
            2500,
            3200,
            4000,
            5000,
            6400,
            8000,
            10000,
            12800
        )

        /*
         * Velocidades de obturación fotográficas.
         *
         * Se utiliza una lista en vez de mapear directamente
         * el progress del SeekBar a segundos.
         */
        private val SHUTTER_VALUES = doubleArrayOf(
            1.0 / 8000.0,
            1.0 / 4000.0,
            1.0 / 2000.0,
            1.0 / 1000.0,
            1.0 / 500.0,
            1.0 / 250.0,
            1.0 / 125.0,
            1.0 / 60.0,
            1.0 / 30.0,
            1.0 / 15.0,
            1.0 / 8.0,
            1.0 / 4.0,
            1.0 / 2.0,
            1.0,
            2.0,
            4.0,
            8.0,
            15.0,
            30.0
        )
    }

    // -------------------------------------------------------------------------
    // PERMISSIONS
    // -------------------------------------------------------------------------

    private val cameraPermissionLauncher =
        registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->

            if (granted) {
                openCameraIfPossible()
            } else {
                showError(
                    "Se requiere permiso de cámara para utilizar Prometheus."
                )
            }
        }

    // -------------------------------------------------------------------------
    // ACTIVITY
    // -------------------------------------------------------------------------

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(savedInstanceState)

        setContentView(
            R.layout.activity_main
        )

        bindViews()
        initializeCamera()
        setupUi()
        updateUi()
    }

    // -------------------------------------------------------------------------
    // VIEW BINDING
    // -------------------------------------------------------------------------

    private fun bindViews() {

        textureView =
            findViewById(R.id.textureView)

        btnCapture =
            findViewById(R.id.btnCapture)

        btnTogglePro =
            findViewById(R.id.btnTogglePro)

        proControlsContainer =
            findViewById(R.id.proControlsContainer)

        sbIso =
            findViewById(R.id.sbIso)

        sbShutter =
            findViewById(R.id.sbShutter)

        txtIsoValue =
            findViewById(R.id.txtIsoValue)

        txtShutterValue =
            findViewById(R.id.txtShutterValue)

        txtStatus =
            findViewById(R.id.txtStatus)
    }

    // -------------------------------------------------------------------------
    // CAMERA INITIALIZATION
    // -------------------------------------------------------------------------

    private fun initializeCamera() {

        cameraEngine =
            PrometheusNativeCamera2Engine(this)

        cameraEngine.callback =
            object :
                PrometheusNativeCamera2Engine.CameraCallback {

                override fun onCameraReady() {

                    runOnUiThread {

                        isCameraReady = true

                        updateCameraCapabilities()

                        txtStatus.text =
                            "Cámara lista"

                        updateUi()
                    }
                }

                override fun onPhotoCaptured(
                    file: File,
                    isRaw: Boolean
                ) {

                    runOnUiThread {

                        val format =
                            if (isRaw) {
                                "DNG"
                            } else {
                                "JPEG"
                            }

                        txtStatus.text =
                            "Captura $format completada"

                        Toast.makeText(
                            this@MainActivity,
                            "Guardada: ${file.name}",
                            Toast.LENGTH_SHORT
                        ).show()

                        updateUi()
                    }
                }

                override fun onError(
                    message: String
                ) {

                    runOnUiThread {

                        isCameraReady = false

                        txtStatus.text =
                            "Error: $message"

                        Toast.makeText(
                            this@MainActivity,
                            message,
                            Toast.LENGTH_LONG
                        ).show()

                        updateUi()
                    }
                }
            }
    }

    // -------------------------------------------------------------------------
    // UI
    // -------------------------------------------------------------------------

    private fun setupUi() {

        textureView.surfaceTextureListener =
            this

        setupCaptureButton()
        setupProButton()
        setupIsoSlider()
        setupShutterSlider()
    }

    private fun setupCaptureButton() {

        btnCapture.setOnClickListener {

            if (!isCameraReady) {
                showError(
                    "La cámara todavía no está lista."
                )
                return@setOnClickListener
            }

            txtStatus.text =
                if (isProMode) {
                    "Capturando en modo PRO..."
                } else {
                    "Capturando..."
                }

            btnCapture.isEnabled = false

            /*
             * JPEG por defecto.
             *
             * Si posteriormente quieres agregar un botón
             * RAW, simplemente utiliza:
             *
             * cameraEngine.takePicture(captureRaw = true)
             */
            cameraEngine.takePicture(
                captureRaw = false
            )

            /*
             * El callback volverá a actualizar la UI.
             * El pequeño retraso evita que el botón quede
             * permanentemente bloqueado si el hardware falla
             * antes del callback.
             */
            window.decorView.postDelayed(
                {
                    btnCapture.isEnabled =
                        isCameraReady
                },
                800L
            )
        }
    }

    private fun setupProButton() {

        btnTogglePro.setOnClickListener {

            if (!isCameraReady) {
                showError(
                    "La cámara todavía no está lista."
                )
                return@setOnClickListener
            }

            isProMode = !isProMode

            if (isProMode) {

                proControlsContainer.visibility =
                    View.VISIBLE

                btnTogglePro.text =
                    "MODO AUTO"

                applyManualSettings()

                txtStatus.text =
                    "Modo PRO / Manual"

            } else {

                proControlsContainer.visibility =
                    View.GONE

                btnTogglePro.text =
                    "MODO PRO (MANUAL)"

                cameraEngine.setAutoMode()

                txtStatus.text =
                    "Modo automático"
            }

            updateUi()
        }
    }

    // -------------------------------------------------------------------------
    // ISO
    // -------------------------------------------------------------------------

    private fun setupIsoSlider() {

        val maxIndex =
            ISO_VALUES.lastIndex

        sbIso.max =
            maxIndex

        val defaultIndex =
            ISO_VALUES.indexOfFirst {
                it >= DEFAULT_ISO
            }.coerceAtLeast(0)

        sbIso.progress =
            defaultIndex

        currentIso =
            ISO_VALUES[defaultIndex]

        sbIso.setOnSeekBarChangeListener(
            object :
                SeekBar.OnSeekBarChangeListener {

                override fun onProgressChanged(
                    seekBar: SeekBar?,
                    progress: Int,
                    fromUser: Boolean
                ) {

                    val index =
                        progress.coerceIn(
                            0,
                            maxIndex
                        )

                    currentIso =
                        ISO_VALUES[index]

                    updateIsoText()

                    /*
                     * No actualizamos Camera2 durante cada
                     * movimiento del dedo si el usuario no
                     * está modificando el control.
                     */
                    if (
                        fromUser &&
                        isProMode &&
                        !isChangingSeekBar
                    ) {
                        applyManualSettings()
                    }
                }

                override fun onStartTrackingTouch(
                    seekBar: SeekBar?
                ) {
                    isChangingSeekBar = true
                }

                override fun onStopTrackingTouch(
                    seekBar: SeekBar?
                ) {
                    isChangingSeekBar = false

                    if (isProMode) {
                        applyManualSettings()
                    }
                }
            }
        )

        updateIsoText()
    }

    // -------------------------------------------------------------------------
    // SHUTTER
    // -------------------------------------------------------------------------

    private fun setupShutterSlider() {

        val maxIndex =
            SHUTTER_VALUES.lastIndex

        sbShutter.max =
            maxIndex

        val defaultIndex =
            findClosestShutterIndex(
                DEFAULT_EXPOSURE_SEC
            )

        sbShutter.progress =
            defaultIndex

        currentExposureSec =
            SHUTTER_VALUES[defaultIndex]

        sbShutter.setOnSeekBarChangeListener(
            object :
                SeekBar.OnSeekBarChangeListener {

                override fun onProgressChanged(
                    seekBar: SeekBar?,
                    progress: Int,
                    fromUser: Boolean
                ) {

                    val index =
                        progress.coerceIn(
                            0,
                            maxIndex
                        )

                    currentExposureSec =
                        SHUTTER_VALUES[index]

                    updateShutterText()

                    if (
                        fromUser &&
                        isProMode &&
                        !isChangingSeekBar
                    ) {
                        applyManualSettings()
                    }
                }

                override fun onStartTrackingTouch(
                    seekBar: SeekBar?
                ) {
                    isChangingSeekBar = true
                }

                override fun onStopTrackingTouch(
                    seekBar: SeekBar?
                ) {
                    isChangingSeekBar = false

                    if (isProMode) {
                        applyManualSettings()
                    }
                }
            }
        )

        updateShutterText()
    }

    // -------------------------------------------------------------------------
    // CAMERA PARAMETERS
    // -------------------------------------------------------------------------

    private fun updateCameraCapabilities() {

        cameraEngine
            .getSupportedIsoRange()
            ?.let { range ->

                supportedIsoMin =
                    range.lower

                supportedIsoMax =
                    range.upper
            }

        cameraEngine
            .getSupportedExposureRange()
            ?.let { range ->

                supportedExposureMinNs =
                    range.lower

                supportedExposureMaxNs =
                    range.upper
            }

        /*
         * Aseguramos que el ISO seleccionado
         * realmente esté dentro del hardware.
         */
        currentIso =
            currentIso.coerceIn(
                supportedIsoMin,
                supportedIsoMax
            )

        /*
         * Lo mismo para exposición.
         */
        val currentExposureNs =
            secondsToNanoseconds(
                currentExposureSec
            )

        val clampedExposureNs =
            currentExposureNs.coerceIn(
                supportedExposureMinNs,
                supportedExposureMaxNs
            )

        currentExposureSec =
            clampedExposureNs /
                    1_000_000_000.0

        updateIsoText()
        updateShutterText()
    }

    private fun applyManualSettings() {

        if (!isCameraReady) {
            return
        }

        if (
            !cameraEngine
                .isManualSensorSupported()
        ) {
            txtStatus.text =
                "El dispositivo no soporta controles manuales"

            return
        }

        cameraEngine.setManualParameters(
            iso = currentIso,
            exposureSeconds = currentExposureSec,
            focusDist = 0.0f
        )

        txtStatus.text =
            "PRO • ISO $currentIso • " +
                    formatShutter(
                        currentExposureSec
                    )
    }

    // -------------------------------------------------------------------------
    // DISPLAY VALUES
    // -------------------------------------------------------------------------

    private fun updateIsoText() {

        val actualIso =
            currentIso.coerceIn(
                supportedIsoMin,
                supportedIsoMax
            )

        txtIsoValue.text =
            "ISO: $actualIso"
    }

    private fun updateShutterText() {

        txtShutterValue.text =
            "Obturador: " +
                    formatShutter(
                        currentExposureSec
                    )
    }

    private fun formatShutter(
        seconds: Double
    ): String {

        if (!seconds.isFinite() || seconds <= 0.0) {
            return "—"
        }

        return if (seconds < 1.0) {

            val denominator =
                (1.0 / seconds)
                    .roundToInt()
                    .coerceAtLeast(1)

            "1/${denominator}s"

        } else {

            when {
                seconds < 10.0 ->
                    "${formatDecimal(seconds)}s"

                seconds % 1.0 == 0.0 ->
                    "${seconds.toInt()}s"

                else ->
                    "${formatDecimal(seconds)}s"
            }
        }
    }

    private fun formatDecimal(
        value: Double
    ): String {

        return when {
            value >= 10.0 ->
                "%.0f".format(value)

            value >= 1.0 ->
                "%.1f".format(value)

            else ->
                "%.3f".format(value)
        }
    }

    // -------------------------------------------------------------------------
    // CAMERA OPEN
    // -------------------------------------------------------------------------

    private fun openCameraIfPossible() {

        if (
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {

            cameraPermissionLauncher.launch(
                Manifest.permission.CAMERA
            )

            return
        }

        if (!textureView.isAvailable) {
            return
        }

        val texture =
            textureView.surfaceTexture
                ?: return

        val width =
            textureView.width

        val height =
            textureView.height

        if (width <= 0 || height <= 0) {
            return
        }

        txtStatus.text =
            "Abriendo cámara..."

        cameraEngine.openCamera(
            texture,
            width,
            height
        )
    }

    // -------------------------------------------------------------------------
    // LIFECYCLE
    // -------------------------------------------------------------------------

    override fun onResume() {

        super.onResume()

        cameraEngine.startBackgroundThread()

        if (hasCameraPermission()) {

            if (textureView.isAvailable) {
                openCameraIfPossible()
            } else {
                textureView.surfaceTextureListener =
                    this
            }

        } else {

            requestCameraPermission()
        }
    }

    override fun onPause() {

        isCameraReady = false

        cameraEngine.closeCamera()
        cameraEngine.stopBackgroundThread()

        super.onPause()
    }

    override fun onDestroy() {

        isCameraReady = false

        cameraEngine.release()

        super.onDestroy()
    }

    // -------------------------------------------------------------------------
    // TEXTURE VIEW
    // -------------------------------------------------------------------------

    override fun onSurfaceTextureAvailable(
        surface: SurfaceTexture,
        width: Int,
        height: Int
    ) {
        openCameraIfPossible()
    }

    override fun onSurfaceTextureSizeChanged(
        surface: SurfaceTexture,
        width: Int,
        height: Int
    ) {
        /*
         * No cerramos/reabrimos automáticamente.
         * El engine ya tiene una sesión activa.
         *
         * Si posteriormente agregas rotación dinámica,
         * aquí es un buen lugar para recalcular la
         * transformación del TextureView.
         */
    }

    override fun onSurfaceTextureDestroyed(
        surface: SurfaceTexture
    ): Boolean {

        /*
         * El Activity/TextureView es propietario del
         * SurfaceTexture. No necesitamos liberarlo aquí.
         */
        return true
    }

    override fun onSurfaceTextureUpdated(
        surface: SurfaceTexture
    ) {
        // No necesitamos procesar cada frame.
    }

    // -------------------------------------------------------------------------
    // PERMISSIONS
    // -------------------------------------------------------------------------

    private fun hasCameraPermission(): Boolean {

        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestCameraPermission() {

        if (hasCameraPermission()) {
            openCameraIfPossible()
            return
        }

        cameraPermissionLauncher.launch(
            Manifest.permission.CAMERA
        )
    }

    // -------------------------------------------------------------------------
    // UI STATE
    // -------------------------------------------------------------------------

    private fun updateUi() {

        btnCapture.isEnabled =
            isCameraReady

        btnTogglePro.isEnabled =
            isCameraReady

        proControlsContainer.visibility =
            if (isProMode) {
                View.VISIBLE
            } else {
                View.GONE
            }

        btnTogglePro.text =
            if (isProMode) {
                "MODO AUTO"
            } else {
                "MODO PRO (MANUAL)"
            }

        updateIsoText()
        updateShutterText()
    }

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------

    private fun findClosestShutterIndex(
        targetSeconds: Double
    ): Int {

        var bestIndex = 0
        var bestDifference =
            Double.MAX_VALUE

        SHUTTER_VALUES.forEachIndexed {
                index,
                value ->

            val difference =
                kotlin.math.abs(
                    value -
                            targetSeconds
                )

            if (difference < bestDifference) {

                bestDifference =
                    difference

                bestIndex =
                    index
            }
        }

        return bestIndex
    }

    private fun secondsToNanoseconds(
        seconds: Double
    ): Long {

        if (
            !seconds.isFinite() ||
            seconds <= 0.0
        ) {
            return 1L
        }

        val nanos =
            seconds *
                    1_000_000_000.0

        return nanos
            .coerceIn(
                1.0,
                Long.MAX_VALUE.toDouble()
            )
            .toLong()
    }

    private fun showError(
        message: String
    ) {

        txtStatus.text =
            "Error: $message"

        Toast.makeText(
            this,
            message,
            Toast.LENGTH_LONG
        ).show()
    }
}
