export const VIDEOS_CSS = `$pages = max(1, (int)ceil($total / $limit));
?>

<style>
.anime-search-result {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: .55rem .75rem;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    font-size: .88rem;
    transition: background .12s;
}
.anime-search-result:hover { background: var(--bg-hover); }
.anime-search-result img {
    width: 32px;
    height: 44px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
}
#anime-search-dropdown {
    position: absolute;
    top: 100%;
    left: 0; right: 0;
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
.embed-preview {
    aspect-ratio: 16/9;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
    background: #000;
    margin-top: 8px;
}
.embed-preview iframe { width: 100%; height: 100%; border: none; }
.embed-preview-empty {
    aspect-ratio: 16/9;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-base);
    border-radius: 8px;
    border: 1px dashed var(--border);
    color: var(--text-muted);
    font-size: .85rem;
    margin-top: 8px;
}
.quality-row {
    display: grid;
    grid-template-columns: 110px 1fr auto;
    gap: .5rem;
    align-items: center;
    background: rgba(255,255,255,.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: .55rem .65rem;
}
.quality-track {
    display: flex;
    flex-direction: column;
    gap: .6rem;
}
.quality-row .q-remove {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0 4px;
    line-height: 1;
    transition: color .15s;
}
.quality-row .q-remove:hover { color: #e55; }
/* Sub / Dub switcher tabs */
.sd-tabs {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: .65rem;
    width: fit-content;
}
.sd-tab {
    padding: .38rem 1.1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: .83rem;
    font-weight: 700;
    color: var(--text-muted);
    transition: background .15s, color .15s;
    display: flex;
    align-items: center;
    gap: .4rem;
}
.sd-tab.active {
    background: var(--accent);
    color: #fff;
}
.dub-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,.25);
    border-radius: 10px;
    font-size: .68rem;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-weight: 700;
}
</style>
`;
