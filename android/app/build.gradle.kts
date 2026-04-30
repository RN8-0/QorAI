import java.io.File

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Read local.properties for signing config
fun localProp(key: String, default: String = ""): String {
    val file = rootProject.file("local.properties")
    if (!file.exists()) return default
    file.readLines().forEach { line ->
        if (line.startsWith("$key=")) return line.substringAfter("=").trim()
    }
    return default
}

fun signingProp(primaryKey: String, legacyKey: String, default: String = ""): String {
    val primaryValue = localProp(primaryKey)
    if (primaryValue.isNotBlank()) return primaryValue

    val keyPropertiesFile = rootProject.file("key.properties")
    if (!keyPropertiesFile.exists()) return default

    keyPropertiesFile.readLines().forEach { line ->
        if (line.startsWith("$legacyKey=")) return line.substringAfter("=").trim()
    }

    return default
}

fun resolveStoreFile(configuredPath: String): File {
    val trimmedPath = configuredPath.trim()
    if (trimmedPath.isEmpty()) return rootProject.file("app/compair-release.jks")

    val directFile = file(trimmedPath)
    if (directFile.exists()) return directFile

    val androidRelativeFile = rootProject.file(trimmedPath)
    if (androidRelativeFile.exists()) return androidRelativeFile

    val appRelativeFile = rootProject.file("app/$trimmedPath")
    if (appRelativeFile.exists()) return appRelativeFile

    val compatFile = rootProject.file("app/compair-release.jks")
    if (compatFile.exists()) return compatFile

    return appRelativeFile
}

android {
    namespace = "com.qorai.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    signingConfigs {
        create("release") {
            keyAlias = signingProp("RELEASE_KEY_ALIAS", "keyAlias", "qorai")
            keyPassword = signingProp("RELEASE_KEY_PASSWORD", "keyPassword")
            storeFile = resolveStoreFile(signingProp("RELEASE_STORE_FILE", "storeFile", "qorai-release.jks"))
            storePassword = signingProp("RELEASE_STORE_PASSWORD", "storePassword")
        }
    }

    defaultConfig {
        applicationId = "com.qorai.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
