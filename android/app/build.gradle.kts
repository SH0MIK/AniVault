plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "co.anivault.presence"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.anivault.presence"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
        prefab = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")

    // Discord distributes this AAR from the Social SDK Downloads page.
    // Place the downloaded discord_partner_sdk.aar in android/app/libs/.
    implementation(files("libs/discord_partner_sdk.aar"))
}
