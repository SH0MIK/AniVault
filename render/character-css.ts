export const CHARACTER_CSS = `/* ── Character page specific styles ── */
.char-hero {
    position: relative;
    display: flex;
    gap: 2rem;
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: 2.5rem;
}

.char-poster-wrap {
    position: relative;
    flex-shrink: 0;
}

.char-poster {
    width: 220px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    display: block;
    object-fit: cover;
    aspect-ratio: 2/3;
    background: var(--bg-card);
}

.char-poster-placeholder {
    width: 220px;
    aspect-ratio: 2/3;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-card);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 3rem;
}

.char-glow-ring {
    position: absolute;
    inset: -3px;
    border-radius: calc(var(--radius-lg) + 3px);
    background: linear-gradient(135deg, var(--accent), transparent 60%);
    z-index: -1;
    opacity: 0.5;
}

.char-meta { flex: 1; min-width: 260px; }

.char-name {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 4px;
    letter-spacing: -0.5px;
}

.char-name-kanji {
    font-size: 1rem;
    color: var(--text-muted);
    margin-bottom: 1rem;
    letter-spacing: 0.05em;
}

.char-nicknames {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 1rem;
}

.char-nickname-tag {
    background: rgba(124,58,237,0.1);
    border: 1px solid rgba(124,58,237,0.25);
    color: var(--accent);
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-style: italic;
}

.char-stat-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
}

.char-stat-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 6px 14px;
    font-size: 0.85rem;
}

.char-stat-pill .stat-val {
    font-weight: 700;
    color: var(--text-primary);
}

.char-stat-pill .stat-lbl {
    color: var(--text-muted);
    font-size: 0.78rem;
}

/* About section */
.char-about {
    color: var(--text-secondary);
    line-height: 1.8;
    font-size: 0.93rem;
    white-space: pre-line;
    max-height: 160px;
    overflow: hidden;
    position: relative;
    transition: max-height 0.4s ease;
}

.char-about.expanded {
    max-height: 9999px;
}

.char-about-fade {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 60px;
    background: linear-gradient(transparent, var(--bg-card));
    pointer-events: none;
    transition: opacity 0.3s;
}

.char-about.expanded ~ .char-about-fade {
    opacity: 0;
}

.btn-read-more {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 6px 0;
    font-weight: 600;
    transition: opacity 0.2s;
}
.btn-read-more:hover { opacity: 0.75; }

/* Voice actors grid */
.va-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
}

.va-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    transition: border-color 0.2s, background 0.2s;
}

.va-card:hover {
    border-color: var(--accent-dim);
    background: var(--bg-hover);
}

.va-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--bg-surface);
    flex-shrink: 0;
    border: 2px solid var(--border);
}

.va-avatar-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--bg-surface);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 1.2rem;
    border: 2px solid var(--border);
}

.va-info { flex: 1; min-width: 0; }

.va-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.va-lang {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 2px;
}

/* Anime appearances */
.char-anime-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 1rem;
}

.char-anime-item {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.2s;
    text-decoration: none;
    display: block;
}

.char-anime-item:hover {
    border-color: var(--accent-dim);
    transform: translateY(-3px);
}

.char-anime-poster {
    aspect-ratio: 2/3;
    overflow: hidden;
    background: var(--bg-surface);
}

.char-anime-poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
    display: block;
}

.char-anime-item:hover .char-anime-poster img {
    transform: scale(1.05);
}

.char-anime-info {
    padding: 8px 10px;
}

.char-anime-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.char-anime-role {
    font-size: 0.73rem;
    color: var(--text-muted);
    margin-top: 3px;
}

.char-anime-role.main { color: var(--accent); }

/* Favorites badge */
.favorites-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(245, 200, 66, 0.12);
    color: var(--gold);
    border: 1px solid rgba(245,200,66,0.25);
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
}

@media (max-width: 640px) {
    .char-hero { flex-direction: column; align-items: center; text-align: center; }
    .char-poster { width: 180px; }
    .char-poster-placeholder { width: 180px; }
    .char-name { font-size: 1.5rem; }
    .char-stat-row { justify-content: center; }
    .char-nicknames { justify-content: center; }
    .char-anime-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
    .va-grid { grid-template-columns: 1fr; }
}
`;
