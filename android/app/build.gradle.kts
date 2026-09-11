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
        versionCode = 2
        versionName = "0.1.1"

        // The checked-in Discord Social SDK AAR was reduced to arm64-v8a
        // because GitHub's file-size limit prevented committing the full AAR.
        ndk {
            abiFilters += "arm64-v8a"
        }

        val discordAppId = providers.gradleProperty("discordApplicationId").orElse("0").get()
        buildConfigField("long", "DISCORD_APPLICATION_ID", discordAppId)
        manifestPlaceholders["DISCORD_APP_SCHEME"] = "discord-$discordAppId"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        prefab = true
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    jvmToolchain(17)
}

// Reuse AniVault's existing site icon as the Android launcher icon.
val syncAniVaultIcon by tasks.registering(Copy::class) {
    from(rootProject.projectDir.parentFile.resolve("public/assets/img/site-img/icon.png"))
    into(layout.buildDirectory.dir("generated/res/launcherIcon/drawable"))
    rename { "anivault_icon.png" }
}

tasks.named("preBuild") {
    dependsOn(syncAniVaultIcon)
}

android.sourceSets["main"].res.srcDir(layout.buildDirectory.dir("generated/res/launcherIcon"))

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation(files("libs/discord_partner_sdk.aar"))
}
