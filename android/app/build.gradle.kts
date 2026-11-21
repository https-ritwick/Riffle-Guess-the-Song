import java.util.Properties

plugins {
    id("com.android.application")
}

// ─── Riffle Trusted Web Activity ──────────────────────────────────────────────
// Everything that identifies the app lives here. The package id (confirmed: dev.riffle.app)
// can NEVER change after the first upload to Play. Keep
// public/.well-known/assetlinks.json's "package_name" in sync with it.
object Twa {
    const val applicationId = "dev.riffle.app"
    const val hostName = "riffle.musicquiz.workers.dev"
    const val launchPath = "/"
    const val name = "Riffle"
    const val launcherName = "Riffle"
    // Match the web app (public/manifest.webmanifest, index.html theme-color).
    const val themeColor = "#0d0716"
    const val navigationColor = "#0d0716"
    const val backgroundColor = "#0d0716"
}

// Bump both for every Play upload: versionCode must always increase.
val appVersionCode = 1
val appVersionName = "1.0.0"

// Upload-key signing. Values come from android/keystore.properties (git-ignored) or
// environment variables, never from this file. See ANDROID.md, section "Signing".
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(prop: String, env: String): String? =
    System.getenv(env)?.takeIf { it.isNotBlank() } ?: keystoreProps.getProperty(prop)?.takeIf { it.isNotBlank() }

val uploadStoreFile = signingValue("storeFile", "RIFFLE_UPLOAD_STORE_FILE")
val hasUploadKey = uploadStoreFile != null

android {
    namespace = "dev.riffle.twa"
    compileSdk = 36

    defaultConfig {
        applicationId = Twa.applicationId
        minSdk = 24
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName

        val origin = "https://${Twa.hostName}"
        manifestPlaceholders["hostName"] = Twa.hostName
        resValue("string", "appName", Twa.name)
        resValue("string", "launcherName", Twa.launcherName)
        resValue("string", "launchUrl", origin + Twa.launchPath)
        resValue("string", "providerAuthority", "${Twa.applicationId}.fileprovider")
        // Android side of Digital Asset Links: this app trusts the site. The site side is
        // public/.well-known/assetlinks.json. Both must match for a full-screen (no URL bar) TWA.
        resValue(
            "string", "assetStatements",
            "[{ \\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], " +
                "\\\"target\\\": { \\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"$origin\\\" } }]"
        )
        resValue("color", "colorPrimary", Twa.themeColor)
        resValue("color", "navigationColor", Twa.navigationColor)
        resValue("color", "backgroundColor", Twa.backgroundColor)
    }

    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = rootProject.file(uploadStoreFile!!)
                storePassword = signingValue("storePassword", "RIFFLE_UPLOAD_STORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "RIFFLE_UPLOAD_KEY_ALIAS") ?: "upload"
                keyPassword = signingValue("keyPassword", "RIFFLE_UPLOAD_KEY_PASSWORD")
                    ?: signingValue("storePassword", "RIFFLE_UPLOAD_STORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasUploadKey) signingConfig = signingConfigs.getByName("upload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        resValues = true
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.6.2")
}

// A release build without the upload key can't go to Play, so refuse before any task runs
// (otherwise an unsigned .aab would overwrite the last good one).
gradle.taskGraph.whenReady {
    val wantsRelease = allTasks.any { it.project == project && it.name in setOf("bundleRelease", "assembleRelease", "packageRelease", "signReleaseBundle") }
    if (wantsRelease && !hasUploadKey) throw GradleException(
        "No upload key configured. Create android/keystore.properties or set RIFFLE_UPLOAD_STORE_FILE " +
            "(see ANDROID.md, section Signing)."
    )
}
