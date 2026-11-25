import java.util.Properties

plugins {
    id("com.android.application")
}

// The release key and its passwords are never in this repository. Put them in android/keystore.properties
// (git ignores it; see keystore.properties.example). Without that file, release builds come out unsigned and
// debug builds use Android's usual debug key.
val releaseKey: Properties? = rootProject.file("keystore.properties").takeIf { it.exists() }?.let { f ->
    Properties().apply { f.inputStream().use { load(it) } }
}

android {
    namespace = "app.gymday"
    compileSdk = 36      // built against Android 16's tools (needed by the Health Connect library); targetSdk below is what the app behaves as

    defaultConfig {
        applicationId = "app.gymday"
        minSdk = 26
        targetSdk = 36      // 1.30: Google Play needs Android 16 (API 36) for new apps and updates
        versionCode = 60
        versionName = "1.35.2"
    }

    signingConfigs {
        releaseKey?.let { key ->
            create("release") {
                storeFile = rootProject.file(key.getProperty("storeFile"))
                storePassword = key.getProperty("storePassword")
                keyAlias = key.getProperty("keyAlias")
                keyPassword = key.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            if (releaseKey != null) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            // With the release key present, debug builds use it too, so they install over a store copy.
            if (releaseKey != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Tests that run on this computer against a stand-in for Android (they are not part of the app).
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    // Images are already compressed; don't let aapt recompress / strip anything.
    androidResources {
        noCompress += listOf("jpg", "json")
    }

    // 1.24: what ships is the joined copy of the page that the bundleWww task below makes, not src/main/assets itself.
    sourceSets {
        getByName("main") {
            assets.setSrcDirs(listOf(layout.buildDirectory.dir("www-bundle").get().asFile))
        }
    }
}

// ---- 1.24, the speed pass: the page's 41 scripts are shipped joined into one file, gymday.js (a phone opens one file instead of
// 41, and the first screen comes about a fifth sooner). This makes app/build/www-bundle/www from src/main/assets/www before every
// build. tools/bundle.py makes the very same copy for the tests; before a release the APK's files are compared with that copy,
// so the two must stay the same, byte for byte. Every script is a self-running function, so joined they run as they did apart;
// each is in its own try block so that one failing leaves the others running (tools/shape.js checks the scripts' shape).
val bundleWww by tasks.registering {
    val src = file("src/main/assets/www")
    val outDir = layout.buildDirectory.dir("www-bundle").get().asFile
    inputs.dir(src)
    outputs.dir(outDir)
    doLast {
        val dst = File(outDir, "www")
        outDir.deleteRecursively()
        dst.mkdirs()
        val html = File(src, "index.html").readText(Charsets.UTF_8)
        val tag = Regex("<script src=\"([^\"]+)\"></script>\n")
        val names = tag.findAll(html).map { it.groupValues[1] }.toList()
        if (names.size < 30) throw GradleException("index.html does not list the scripts as expected")
        val sb = StringBuilder("/* GymDay: the page's scripts in one file, in the page's order. Made at build time from the files named below (tools/bundle.py). */\n")
        for (n in names) {
            val t = File(src, n).readText(Charsets.UTF_8)
            sb.append("/* ==== ").append(n).append(" ==== */\ntry {\n").append(t)
            if (!t.endsWith("\n")) sb.append("\n")
            sb.append("} catch (e) { setTimeout(function () { throw e; }, 0); }\n")
        }
        File(dst, "gymday.js").writeText(sb.toString(), Charsets.UTF_8)
        var first = true
        File(dst, "index.html").writeText(tag.replace(html) { if (first) { first = false; "<script src=\"gymday.js\"></script>\n" } else "" }, Charsets.UTF_8)
        val skip = names.toSet() + "index.html"
        src.walkTopDown().filter { it.isFile }.forEach { f ->
            val rel = f.relativeTo(src).invariantSeparatorsPath
            if (rel !in skip) f.copyTo(File(dst, rel), overwrite = true)
        }
    }
}
tasks.named("preBuild") { dependsOn(bundleWww) }

dependencies {
    // Health Connect on Android 13 and older (HealthCompat.java). Android 14+ uses the phone's own Health Connect (HealthBridge.java).
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")       // the library answers through Kotlin coroutines; HealthCompat waits for them
    // v1.8: the barcode scanner of Google Play services (no camera permission: Play services shows its own scanner screen)
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    implementation("androidx.core:core:1.12.0")                                   // FileProvider: a photo taken with the camera for a packet
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16")
}
