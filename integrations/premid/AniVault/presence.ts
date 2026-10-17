import { Assets, getTimestampsFromMedia } from "premid";

const presence = new Presence({
  clientId: "REPLACE_WITH_DISCORD_APPLICATION_ID"
});

const ANIVAULT_LOGO = "https://www.anivault.co/favicon.ico";
const SITE_HOSTS = new Set(["anivault.co", "www.anivault.co"]);
let browsingTimestamp = Math.floor(Date.now() / 1000);
let wasWatching = false;
let lastMediaIdentity = "";

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function getPageTitle(): string {
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  const title = cleanText(ogTitle || document.title);
  return title.replace(/\s*[|–—-]\s*AniVault\s*$/i, "").trim() || "Anime";
}

function getPoster(): string {
  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
  return ogImage && /^https?:\/\//i.test(ogImage) ? ogImage : ANIVAULT_LOGO;
}

function getEpisodeLabel(title: string): string {
  const candidates = [
    document.querySelector("[data-episode-title]")?.textContent,
    document.querySelector(".episode-title")?.textContent,
    document.querySelector("[class*='episode'][class*='active']")?.textContent,
    title
  ];
  for (const candidate of candidates) {
    const text = cleanText(candidate);
    const match = text.match(/\b(?:episode|ep\.?|e)\s*[-:#]?\s*(\d{1,4})(?:\s*[-:–—]\s*(.*))?/i);
    if (match) return `Episode ${match[1]}${match[2] ? ` · ${match[2]}` : ""}`;
  }
  return "";
}

presence.on("UpdateData", async () => {
  const { hostname, href } = document.location;
  if (!SITE_HOSTS.has(hostname.toLowerCase())) {
    presence.clearActivity();
    return;
  }

  const video = document.querySelector("video");
  const pageTitle = getPageTitle();
  const episode = getEpisodeLabel(pageTitle);
  const isMediaReady = Boolean(video && video.readyState > 0);
  const isPlaying = Boolean(video && !video.paused && !video.ended);
  const identity = `${href.split("?")[0]}|${pageTitle}|${episode}`;

  const data: PresenceData = {
    type: ActivityType.Watching,
    largeImageKey: getPoster(),
    largeImageText: "AniVault",
    details: pageTitle.slice(0, 128),
    state: episode || (isMediaReady ? "Watching anime" : "Browsing AniVault"),
    buttons: [{ label: "Open AniVault", url: href }]
  };

  const identityChanged = identity !== lastMediaIdentity;
  if (identityChanged) {
    lastMediaIdentity = identity;
    browsingTimestamp = Math.floor(Date.now() / 1000);
  }

  if (isMediaReady && video) {
    if (identityChanged || !wasWatching) {
      browsingTimestamp = Math.floor(Date.now() / 1000);
    }

    if (isPlaying) {
      data.smallImageKey = Assets.Play;
      data.smallImageText = "Playing";
      [data.startTimestamp, data.endTimestamp] = getTimestampsFromMedia(video);
    }
    else {
      data.smallImageKey = Assets.Pause;
      data.smallImageText = "Paused";
      delete data.startTimestamp;
      delete data.endTimestamp;
    }
  }
  else {
    data.startTimestamp = browsingTimestamp;
    delete data.endTimestamp;
  }

  wasWatching = isPlaying;
  presence.setActivity(data);
});
