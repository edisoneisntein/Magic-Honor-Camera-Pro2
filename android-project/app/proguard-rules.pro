# Proguard rules for Prometheus Camera
-keepattributes *Annotation*
-keepclassmembers class * {
    @androidx.annotation.Keep *;
}
