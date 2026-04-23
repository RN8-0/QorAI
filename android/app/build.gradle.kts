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
            keyAlias = localProp("RELEASE_KEY_ALIAS", "qorai")
            keyPassword = localProp("RELEASE_KEY_PASSWORD")
            storeFile = file(localProp("RELEASE_STORE_FILE", "qorai-release.jks"))
            storePassword = localProp("RELEASE_STORE_PASSWORD")
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
