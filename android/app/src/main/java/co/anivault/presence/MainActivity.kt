package co.anivault.presence

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import com.discord.socialsdk.DiscordSocialSdkInit
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var discord: DiscordPresence? = null

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
                    initDiscordSafely()
                }
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(PresenceJsBridge(), "AniVaultPresence")
            loadUrl("https://www.anivault.co/")
        }

        setContentView(webView)
    }

    private fun initDiscordSafely() {
        if (discord != null) return
        try {
            DiscordSocialSdkInit.setEngineActivity(this)
            discord = DiscordPresence(this).also { it.start() }
        } catch (_: Throwable) {
            // Discord must never prevent AniVault from opening.
            discord = null
        }
    }

    private fun injectPresenceHook(view: WebView) {
        view.evaluateJavascript(PRESENCE_SCRIPT, null)
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.__anivaultPresence?.send('pagehide');", null)
        }
        discord?.clear()
        discord?.close()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    private inner class PresenceJsBridge {
        @JavascriptInterface
        fun update(json: String) {
            runOnUiThread {
                try {
                    discord?.update(JSONObject(json))
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
              const api = {
                video: null,
                art: { image: '', banner: '' },
                artLoading: false,
                artLoadedFor: ''
              };
              window.__anivaultPresence = api;

              const meta = (name, attr = 'content') =>
                document.querySelector(`meta[property="${'$'}{name}"], meta[name="${'$'}{name}"]`)?.getAttribute(attr) || '';

              const cssUrl = (value) => {
                const m = String(value || '').match(/url\((['"]?)(.*?)\1\)/i);
                return m ? m[2] : '';
              };

              const animeIdFromUrl = () => {
                try { return new URL(location.href).searchParams.get('anime') || ''; }
                catch (_) { return ''; }
              };

              const currentPoster = () => {
                const ambient = document.querySelector('.av-ambient-img');
                const inline = ambient?.style?.backgroundImage || '';
                return cssUrl(inline) || meta('og:image');
              };

              const loadAnimeArt = async () => {
                const animeId = animeIdFromUrl();
                if (!animeId || api.artLoading || api.artLoadedFor === animeId) return;
                api.artLoading = true;

                // The watch page already has the same poster used by the anime
                // page in its ambient background. Use it immediately, then fetch
                // the anime page once to obtain its banner for fallback.
                api.art.image = currentPoster();

                try {
                  const res = await fetch(`/anime?id=${encodeURIComponent(animeId)}`, {
                    credentials: 'same-origin',
                    cache: 'force-cache'
                  });
                  if (res.ok) {
                    const html = await res.text();
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const poster = doc.querySelector('.ih-thumb img')?.getAttribute('src') || '';
                    const banner = cssUrl(doc.querySelector('.ih-bg')?.getAttribute('style') || '');
                    if (poster) api.art.image = new URL(poster, location.href).href;
                    if (banner) api.art.banner = new URL(banner, location.href).href;
                  }
                } catch (_) {
                  // Keep the poster already available on the watch page.
                }

                api.artLoadedFor = animeId;
                api.artLoading = false;
              };

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
                  image: api.art.image || currentPoster(),
                  banner: api.art.banner || '',
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
                loadAnimeArt().then(() => send('art-ready'));
              };

              api.send = send;
              attach();
              new MutationObserver(attach).observe(document.documentElement, {childList:true, subtree:true});
              window.addEventListener('pagehide', () => send('pagehide'), {capture:true});
            })();
        """.trimIndent()
    }
}
