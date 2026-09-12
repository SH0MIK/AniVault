package co.anivault.presence

import android.content.Context
import org.json.JSONObject

class DiscordPresence(context: Context) {
    companion object {
        init {
            System.loadLibrary("anivault_presence")
        }
    }

    private val appContext = context.applicationContext
    private var ready = false

    fun start() {
        nativeInit(appContext, BuildConfig.DISCORD_APPLICATION_ID.toString())
        ready = true
    }

    fun update(data: JSONObject) {
        if (!ready) return

        val current = data.optDouble("currentTime", 0.0).coerceAtLeast(0.0)
        val duration = data.optDouble("duration", 0.0).coerceAtLeast(0.0)
        val playing = data.optBoolean("playing", false)
        val event = data.optString("event", "")

        if (event == "ended" || event == "pagehide") {
            nativeClear()
            return
        }

        nativeUpdate(
            data.optString("title", "Anime"),
            data.optInt("episode", 0),
            data.optString("episodeTitle", ""),
            data.optString("url", "https://www.anivault.co/"),
            data.optString("image", ""),
            data.optString("banner", ""),
            current,
            duration,
            playing,
            data.optLong("at", System.currentTimeMillis())
        )
    }

    fun clear() {
        if (ready) nativeClear()
    }

    fun close() {
        if (ready) nativeShutdown()
        ready = false
    }

    private external fun nativeInit(context: Context, applicationId: String)
    private external fun nativeUpdate(
        title: String,
        episode: Int,
        episodeTitle: String,
        url: String,
        image: String,
        banner: String,
        currentTime: Double,
        duration: Double,
        playing: Boolean,
        sourceTimeMs: Long
    )
    private external fun nativeClear()
    private external fun nativeShutdown()
}
