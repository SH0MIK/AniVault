#define DISCORDPP_IMPLEMENTATION
#include <discordpp.h>

#include <jni.h>
#include <android/log.h>

#include <chrono>
#include <cmath>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

#define LOG_TAG "AniVaultPresence"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {
std::shared_ptr<discordpp::Client> client;
std::mutex clientMutex;
std::thread callbackThread;
std::atomic_bool running{false};

uint64_t parseApplicationId(const std::string& value) {
    try {
        return std::stoull(value);
    } catch (...) {
        return 0;
    }
}

std::string trim128(std::string value) {
    if (value.size() > 128) value.resize(128);
    return value;
}

void startCallbacks() {
    if (running.exchange(true)) return;
    callbackThread = std::thread([] {
        while (running.load()) {
            discordpp::RunCallbacks();
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
    });
}
}

extern "C" JNIEXPORT void JNICALL
Java_co_anivault_presence_DiscordPresence_nativeInit(
    JNIEnv* env, jobject, jobject, jstring applicationId) {
    const char* chars = env->GetStringUTFChars(applicationId, nullptr);
    const std::string appIdString = chars ? chars : "";
    if (chars) env->ReleaseStringUTFChars(applicationId, chars);

    const uint64_t appId = parseApplicationId(appIdString);
    if (!appId) {
        LOGE("Invalid Discord application ID");
        return;
    }

    std::lock_guard<std::mutex> lock(clientMutex);
    if (!client) {
        client = std::make_shared<discordpp::Client>();
        client->SetApplicationId(appId);
        startCallbacks();
        LOGI("Discord Rich Presence initialized");
    }
}

extern "C" JNIEXPORT void JNICALL
Java_co_anivault_presence_DiscordPresence_nativeUpdate(
    JNIEnv* env, jobject,
    jstring title,
    jint episode,
    jstring episodeTitle,
    jstring url,
    jdouble currentTime,
    jdouble duration,
    jboolean playing,
    jlong sourceTimeMs) {
    auto getString = [&](jstring value) -> std::string {
        if (!value) return {};
        const char* chars = env->GetStringUTFChars(value, nullptr);
        std::string result = chars ? chars : "";
        if (chars) env->ReleaseStringUTFChars(value, chars);
        return result;
    };

    const std::string titleValue = getString(title).empty() ? "Anime" : getString(title);
    const std::string episodeTitleValue = getString(episodeTitle);
    const std::string urlValue = getString(url).empty() ? "https://www.anivault.co/" : getString(url);

    std::lock_guard<std::mutex> lock(clientMutex);
    if (!client) return;

    discordpp::Activity activity;
    activity.SetType(discordpp::ActivityTypes::Playing);
    activity.SetDetails(trim128("Watching " + titleValue));

    std::string state = "Episode " + std::to_string(std::max(0, static_cast<int>(episode)));
    if (!episodeTitleValue.empty()) state += " — " + episodeTitleValue;
    activity.SetState(trim128(state));
    activity.SetDetailsUrl(urlValue);

    discordpp::ActivityAssets assets;
    assets.SetLargeImage("anivault");
    assets.SetLargeText("AniVault");
    activity.SetAssets(assets);

    discordpp::ActivityButton button;
    button.SetLabel(playing ? "Watch on AniVault" : "Resume on AniVault");
    button.SetUrl(urlValue);
    activity.AddButton(button);

    if (playing && duration > 0.0) {
        const double safeCurrent = std::max(0.0, currentTime);
        const uint64_t start = static_cast<uint64_t>(
            static_cast<double>(sourceTimeMs) - safeCurrent * 1000.0);
        const uint64_t end = start + static_cast<uint64_t>(duration * 1000.0);

        discordpp::ActivityTimestamps timestamps;
        timestamps.SetStart(start);
        timestamps.SetEnd(end);
        activity.SetTimestamps(timestamps);
    } else {
        activity.SetState(trim128(state + " · Paused"));
    }

    client->UpdateRichPresence(std::move(activity), [](discordpp::ClientResult result) {
        if (!result.Successful()) {
            LOGE("Discord Rich Presence update failed");
        }
    });
}

extern "C" JNIEXPORT void JNICALL
Java_co_anivault_presence_DiscordPresence_nativeClear(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> lock(clientMutex);
    if (client) client->ClearRichPresence();
}

extern "C" JNIEXPORT void JNICALL
Java_co_anivault_presence_DiscordPresence_nativeShutdown(JNIEnv*, jobject) {
    running.store(false);
    if (callbackThread.joinable()) callbackThread.join();

    std::lock_guard<std::mutex> lock(clientMutex);
    if (client) client->ClearRichPresence();
    client.reset();
}
