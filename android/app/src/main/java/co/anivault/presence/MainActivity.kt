package co.anivault.presence

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val discord = DiscordPresence(this)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    injectPresenceHook(view)
                }
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(PresenceJsBridge(), "AniVaultPresence")
            loadUrl("https://www.anivault.co/")
        }

        setContentView(webView)
        discord.start()
    }

    private fun injectPresenceHook(view: WebView) {
        view.evaluateJavascript(PRESENCE_SCRIPT, null)
    }

    override fun onDestroy() {
        webView.evaluateJavascript("window.__anivaultPresence?.send('pagehide');", null)
        discord.clear()
        discord.close()
        webView.destroy()
        super.onDestroy()
    }

    private inner class PresenceJsBridge {
        @JavascriptInterface
        fun update(json: String) {
            runOnUiThread {
                try {
                    discord.update(JSONObject(json))
                } catch (_: Exception) {
                    // Ignore malformed page events; playback must never be interrupted.
                }
            }
        }
    }

    companion object {
        private val PRESENCE_SCRIPT = """
            (() => {
              if (window.__anivaultPresence) return;
              const api = { video: null };
              window.__anivaultPresence = api;

              const meta = (name, attr = 'content') =>
                document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute(attr) || '';

              const send = (event) => {
                const v = api.video;
                if (!v && event !== 'pagehide') return;
                const u = new URL(location.href);
                const episode = Number(u.searchParams.get('ep')) || 0;
                if (!episode) return;

                const title = (meta('og:title') || document.title)
                  .replace(/^Ep\s+\d+\s+[—-]\s*/i, '')
                  .replace(/\s*\|\s*AniVault.*$/i, '')
                  .trim() || 'Anime';
                const episodeTitle = document.querySelector('.wp-ep-title, [data-episode-title]')?.textContent?.trim() || '';
                const currentTime = v && Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : 0;
                const duration = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
                const playing = !!v && !v.paused && !v.ended && !v.seeking;

                window.AniVaultPresence?.update(JSON.stringify({
                  event, title, episode, episodeTitle,
                  url: location.href,
                  currentTime, duration, playing,
                  at: Date.now()
                }));
              };

              const attach = () => {
                const next = document.getElementById('sp-video') || document.querySelector('video');
                if (!(next instanceof HTMLVideoElement) || next === api.video) return;
                api.video = next;
                ['play','playing','pause','waiting','stalled','seeked','loadedmetadata','durationchange','ended'].forEach(e =>
                  next.addEventListener(e, () => send(e), {passive:true})
                );
                send('ready');
              };

              api.send = send;
              attach();
              new MutationObserver(attach).observe(document.documentElement, {childList:true, subtree:true});
              window.addEventListener('pagehide', () => send('pagehide'), {capture:true});
            })();
        """.trimIndent()
    }
}
