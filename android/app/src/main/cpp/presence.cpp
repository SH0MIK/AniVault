#define DISCORDPP_IMPLEMENTATION
#include <discordpp.h>

#include <jni.h>
#include <android/log.h>

#include <algorithm>
#include <atomic>
#include <chrono>
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

std::string trim300(std::string value) {
    if (value.size() > 300) value.resize(300);
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
    jstring image,
    jstring banner,
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

    std::string titleValue = getString(title);
    const std::string episodeTitleValue = getString(episodeTitle);
    std::string urlValue = getString(url);
    const std::string imageValue = getString(image);
    const std::string bannerValue = getString(banner);
    if (titleValue.empty()) titleValue = "Anime";
    if (urlValue.empty()) urlValue = "https://www.anivault.co/";

    std::lock_guard<std::mutex> lock(clientMutex);
    if (!client) return;

    discordpp::Activity activity;
    activity.SetType(discordpp::ActivityTypes::Watching);
    activity.SetName("AniVault");

    // The activity name is already shown as "Watching AniVault", so keep
    // the details line to the anime title only.
    activity.SetDetails(trim128(titleValue));

    std::string state = "Episode " + std::to_string(std::max(0, static_cast<int>(episode)));
    if (!episodeTitleValue.empty()) state += " — " + episodeTitleValue;
    activity.SetState(trim128(state));
    activity.SetDetailsUrl(urlValue);

    const std::string selectedImage = !imageValue.empty() ? imageValue : bannerValue;
    if (!selectedImage.empty()) {
        discordpp::ActivityAssets assets;
        assets.SetLargeImage(trim300(selectedImage));
        assets.SetLargeText(trim128(titleValue));
        assets.SetLargeUrl(urlValue);
        activity.SetAssets(assets);
    }

    discordpp::ActivityButton button;
    button.SetLabel(playing ? "Watch on AniVault" : "Resume on AniVault");
    button.SetUrl(urlValue);
    activity.AddButton(button);

    // Discord's Watching activity supports start + end timestamps. Together
    // they allow Discord to render the native video progress/timing UI.
    // Anchor the start at the actual video position so seeking stays correct.
    if (playing && duration > 0.0) {
        const double safeCurrent = std::clamp(currentTime, 0.0, duration);
        const int64_t nowMs = static_cast<int64_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count());
        const int64_t startSigned = static_cast<int64_t>(
            static_cast<double>(nowMs) - safeCurrent * 1000.0);
        const int64_t endSigned = startSigned + static_cast<int64_t>(duration * 1000.0);

        discordpp::ActivityTimestamps timestamps;
        timestamps.SetStart(static_cast<uint64_t>(std::max<int64_t>(0, startSigned)));
        timestamps.SetEnd(static_cast<uint64_t>(std::max<int64_t>(0, endSigned)));
        activity.SetTimestamps(timestamps);
    } else {
        activity.SetState(trim128(state + " · Paused"));
    }

    client->UpdateRichPresence(std::move(activity), [](discordpp::ClientResult result) {
        if (!result.Successful()) LOGE("Discord Rich Presence update failed");
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
