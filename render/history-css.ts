export const HISTORY_CSS = `.hist-wrap {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
.hist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.75rem;
  gap: 1rem;
  flex-wrap: wrap;
}
.hist-title {
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--text-primary, #fff);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.hist-title span { color: var(--accent, #e00); }
.hist-count {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  font-weight: 500;
  margin-left: 0.5rem;
}
.hist-clear-btn {
  background: transparent;
  border: 1px solid rgba(255,60,60,0.3);
  color: rgba(255,100,100,0.75);
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all .2s;
}
.hist-clear-btn:hover {
  background: rgba(255,60,60,0.12);
  border-color: rgba(255,60,60,0.6);
  color: #ff6666;
}
.hist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.hist-card {
  display: block;
  text-decoration: none;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  overflow: hidden;
  transition: transform .2s, border-color .2s, box-shadow .2s;
  position: relative;
}
.hist-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255,255,255,0.15);
  box-shadow: 0 12px 32px rgba(0,0,0,0.4);
}
.hist-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  background: rgba(255,255,255,0.06);
  position: relative;
  overflow: hidden;
}
.hist-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .3s;
}
.hist-card:hover .hist-thumb img { transform: scale(1.04); }
.hist-thumb-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hist-thumb-placeholder svg { opacity: 0.15; }
.hist-play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .2s;
}
.hist-card:hover .hist-play-overlay { background: rgba(0,0,0,0.35); }
.hist-play-overlay svg {
  opacity: 0;
  transform: scale(0.8);
  transition: opacity .2s, transform .2s;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
}
.hist-card:hover .hist-play-overlay svg { opacity: 1; transform: scale(1); }
.hist-ep-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 5px;
  letter-spacing: 0.02em;
}
.hist-info {
  padding: 0.65rem 0.75rem 0.75rem;
}
.hist-anime-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
}
.hist-ep-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.hist-date {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.3);
}
.hist-remove {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(0,0,0,0.65);
  border: none;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  transition: background .2s, color .2s;
  z-index: 5;
}
.hist-card:hover .hist-remove { display: flex; }
.hist-remove:hover { background: rgba(200,40,40,0.8); color: #fff; }

/* ── Watch progress bar (red, pinned to bottom of thumb) ── */
.hist-progress-bar {
  position: absolute;
  bottom: 0; left: 0;
  width: 100%; height: 4px;
  background: rgba(255,255,255,0.15);
  z-index: 4;
}
.hist-progress-fill {
  height: 100%;
  background: var(--accent, #e00);
  min-width: 3px;
}
/* "Xm left" badge — bottom-left of thumb */
.hist-time-left {
  position: absolute;
  bottom: 10px; left: 8px;
  background: rgba(0,0,0,0.75);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  letter-spacing: 0.02em;
  z-index: 5;
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.hist-empty {
  grid-column: 1/-1;
  text-align: center;
  padding: 4rem 1rem;
  color: rgba(255,255,255,0.3);
  font-size: 1rem;
}
.hist-empty svg { display: block; margin: 0 auto 1rem; opacity: 0.15; }
/* Pagination */
.hist-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2.5rem;
  flex-wrap: wrap;
}
.hist-page-btn {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.6);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: all .2s;
}
.hist-page-btn:hover,
.hist-page-btn.active {
  background: var(--accent, #e00);
  border-color: var(--accent, #e00);
  color: #fff;
}
.hist-page-btn.disabled {
  opacity: 0.3;
  pointer-events: none;
}
@media (max-width: 600px) {
  .hist-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
</style>
`;
