# Flutter & Dart
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-keep class io.flutter.embedding.** { *; }
-dontwarn io.flutter.**

# Google Sign-In (google_sign_in package uses GMS)
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Google Play Core
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**

# Kotlin & Coroutines
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlin.**

# Gson / JSON serialization
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# Keep all classes with annotations (Riverpod, etc.)
-keepclassmembers class * {
    @**.riverpod.annotation.* <methods>;
}

# Prevent R8 from removing navigation-related code
-keep class * extends androidx.navigation.** { *; }
-keep class androidx.** { *; }
-dontwarn androidx.**
