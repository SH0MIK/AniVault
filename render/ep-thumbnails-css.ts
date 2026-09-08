export const EP_THUMBNAILS_CSS = `
<style>
/* ── Anime search autocomplete (mirrors videos.php pattern) ── */
#thumb-anime-wrap { position: relative; }
#thumb-anime-dropdown {
    position: absolute;
    top: 100%; left: 0; right: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 8px 8px;
    z-index: 200;
    max-height: 280px;
    overflow-y: auto;
    display: none;
    box-shadow: 0 8px 24px rgba(0,0,0,.4);
}
.ta-result {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: .55rem .75rem;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    font-size: .88rem;
    transition: background .12s;
}
.ta-result:hover { background: var(--bg-hover); }
.ta-result img {
    width: 32px; height: 44px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
}

/* ── Episode grid ── */
#ep-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 1rem;
    margin-top: 1.25rem;
}
.ep-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: border-color .15s;
    position: relative;
}
.ep-card.has-thumb { border-color: var(--accent); }
.ep-card.searching { opacity: .6; }
.ep-card-img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    background: var(--bg-base);
    display: block;
}
.ep-card-img-placeholder {
    width: 100%;
    aspect-ratio: 16/9;
    background: var(--bg-base);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1.6rem;
}
.ep-card-body {
    padding: .5rem .65rem .6rem;
    display: flex;
    flex-direction: column;
    gap: .35rem;
    flex: 1;
}
.ep-card-label {
    font-size: .8rem;
    font-weight: 700;
    color: var(--text-secondary);
}
.ep-card-title {
    font-size: .75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ep-card-actions {
    display: flex;
    gap: .35rem;
    flex-wrap: wrap;
}
.ep-status {
    position: absolute;
    top: 4px; right: 4px;
    font-size: .65rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 20px;
    background: rgba(0,0,0,.7);
    color: #fff;
}
.ep-status.saved  { background: var(--accent); }
.ep-status.found  { background: #2a9d52; }
.ep-status.none   { background: #888; }
.ep-status.error  { background: #c0392b; }

/* ── Progress bar ── */
#progress-wrap {
    display: none;
    margin-top: 1rem;
}
#progress-bar-track {
    height: 6px;
    background: var(--bg-base);
    border-radius: 3px;
    overflow: hidden;
}
#progress-bar-fill {
    height: 100%;
    background: var(--accent);
    width: 0%;
    transition: width .2s;
    border-radius: 3px;
}
#progress-label {
    font-size: .8rem;
    color: var(--text-muted);
    margin-top: .4rem;
}

/* ── Thumb picker modal ── */
#thumb-pick-modal .thumb-option {
    cursor: pointer;
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color .15s;
}
#thumb-pick-modal .thumb-option:hover,
#thumb-pick-modal .thumb-option.selected { border-color: var(--accent); }
#thumb-pick-modal .thumb-option img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
}
.thumb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: .75rem;
    max-height: 400px;
    overflow-y: auto;
    padding: .25rem;
}
</style>
`;
