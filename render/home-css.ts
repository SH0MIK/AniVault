export const CONTINUE_WATCHING_CSS = `.cw-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:1rem;
}

.cw-clear{
  background:none;
  border:none;
  font-size:.78rem;
  color:var(--text-muted);
  cursor:pointer;
  transition:color .15s;
  padding:0;
}

.cw-clear:hover{
  color:#e55;
}

/* Show More */
.cw-show-more-wrap{
  display:flex;align-items:center;gap:14px;margin:28px 0 4px;
}
.cw-show-more-line{
  flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);
}
.cw-show-more-btn{
  display:inline-flex;align-items:center;
  padding:9px 22px;border-radius:50px;
  background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.1);
  color:rgba(255,255,255,0.55);
  font-size:0.82rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;
  text-decoration:none;white-space:nowrap;
  transition:all .2s;
}
.cw-show-more-btn:hover{
  background:rgba(255,255,255,0.1);
  border-color:rgba(255,255,255,0.25);
  color:#fff;
  transform:translateY(-1px);
}
.cw-show-more-btn svg{ opacity:0.7; transition:opacity .2s; }
.cw-show-more-btn:hover svg{ opacity:1; }

/* DESKTOP GRID — fixed 4 cols = 2 rows of 4 cards */
.cw-row{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:1rem;
}
/* Tablet: 3 cols */
@media(max-width:1024px){
  .cw-row{ grid-template-columns:repeat(3,1fr); }
}
/* Phone: show only 3 cards stacked vertically */
@media(max-width:600px){
  .cw-row{ grid-template-columns:1fr; }
  .cw-card:nth-child(n+4){ display:none; }
}

.cw-card{
  display:flex;
  flex-direction:column;
  cursor:pointer;
  transition:transform .18s;
  width:100%;
  min-width:0;
}

.cw-card:hover{
  transform:translateY(-3px);
}

.cw-thumb{
  position:relative;
  width:100%;
  height:0;
  padding-bottom:56.25%;
  background:#111;
  overflow:hidden;
  border-radius:10px;
  flex-shrink:0;
}

.cw-thumb > *:not(.cw-progress-bar):not(.cw-time-left):not(.cw-ep-badge):not(.cw-remove):not(.cw-play){
  position:absolute !important;
  inset:0 !important;
  width:100% !important;
  height:100% !important;
}

.cw-thumb img{
  object-fit:cover;
  display:block;
}

.cw-thumb::after{
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,0) 55%);
  pointer-events:none;
  z-index:1;
}

.cw-play{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  opacity:0;
  transition:opacity .18s;
  z-index:3;
  pointer-events:none;
}

.cw-card:hover .cw-play{
  opacity:1;
}

.cw-play-circle{
  width:52px;
  height:52px;
  border-radius:50%;
  background:rgba(255,255,255,.18);
  border:2px solid rgba(255,255,255,.75);
  display:flex;
  align-items:center;
  justify-content:center;
  /* backdrop-filter:blur(4px); */
  transition:transform .15s, background .15s;
}

.cw-card:hover .cw-play-circle{
  transform:scale(1.08);
  background:rgba(255,255,255,.28);
}

.cw-play-circle svg{
  width:20px;
  height:20px;
  fill:#fff;
  margin-left:3px;
}

.cw-ep-badge{
  position:absolute;
  bottom:8px !important;
  right:8px;
  left:auto !important;
  top:auto !important;
  width:auto !important;
  height:auto !important;
  z-index:4;

  background:rgba(0,0,0,.75);
  color:#fff;
  font-size:.68rem;
  font-weight:700;
  padding:2px 7px;
  border-radius:4px;
  letter-spacing:.02em;
}
/* Watch progress bar on cw-cards */
.cw-progress-bar{
  position:absolute !important;
  bottom:0 !important; left:0 !important;
  top:auto !important; right:auto !important;
  width:100% !important; height:4px !important;
  inset:auto auto 0 0 !important;
  background:rgba(255,255,255,0.15) !important;
  z-index:5; pointer-events:none;
  border-radius:0 !important;
  display:block !important;
}
.cw-progress-fill{
  display:block !important;
  position:static !important;
  inset:unset !important;
  width:var(--pct,0%) !important;
  height:4px !important;
  background:var(--accent,#e00) !important;
  min-width:3px;
  border-radius:0 !important;
}
/* "Xm left" time badge */
.cw-time-left{
  position:absolute !important;
  inset:auto auto 10px 8px !important;
  top:auto !important; right:auto !important;
  width:auto !important; height:auto !important;
  background:rgba(0,0,0,0.78) !important; color:#fff !important;
  font-size:.66rem; font-weight:700;
  padding:2px 7px; border-radius:4px;
  letter-spacing:.02em; z-index:6;
  pointer-events:none;
  white-space:nowrap;
}

.cw-remove{
  position:absolute;
  top:7px !important;
  left:7px !important;
  width:26px !important;
  height:26px !important;
  border-radius:50%;
  background:rgba(0,0,0,.6);
  border:none;
  color:#fff;
  font-size:.78rem;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  opacity:0;
  transition:opacity .15s, background .15s;
  z-index:5;
}

.cw-card:hover .cw-remove{
  opacity:1;
}

.cw-remove:hover{
  background:rgba(200,30,30,.9);
}

.cw-placeholder{
  width:100%;
  height:100%;
  background:var(--bg-card);
  display:flex;
  align-items:center;
  justify-content:center;
}

.cw-info{
  padding:.55rem .15rem .2rem;
}

.cw-anime-name{
  font-size:.68rem;
  font-weight:700;
  letter-spacing:.06em;
  text-transform:uppercase;
  color:var(--text-muted);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  margin-bottom:.25rem;
}

.cw-ep-title{
  font-size:.92rem;
  font-weight:700;
  color:var(--text-primary);
  line-height:1.35;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

/* TABLET */
@media (max-width:1024px){

  .cw-row{
    grid-template-columns:repeat(2,1fr);
  }

}

/* PHONE STYLE */
@media (max-width:700px){

  .cw-row{
    display:flex;
    flex-direction:column;
    gap:.9rem;
  }

  .cw-card{
    background:transparent;
  }

  .cw-info{
    padding:.5rem .1rem 0;
  }

  .cw-anime-name{
    font-size:.6rem;
    margin-bottom:.35rem;
  }

  .cw-ep-title{
    font-size:.82rem;
    white-space:normal;
    overflow:hidden;
    display:-webkit-box;
    -webkit-line-clamp:2;
    -webkit-box-orient:vertical;
    line-height:1.35;
  }

  .cw-play{
    opacity:1;
  }

  .cw-play-circle{
    width:42px;
    height:42px;
    border-width:1.5px;
  }

  .cw-play-circle svg{
    width:16px;
    height:16px;
  }

  .cw-remove{
    opacity:1;
    width:22px !important;
    height:22px !important;
    font-size:.7rem;
  }

  .cw-ep-badge{
    font-size:.66rem;
    padding:2px 6px;
  }

}

/* SMALL PHONE */
@media (max-width:480px){

  .cw-ep-title{
    font-size:.78rem;
  }

}
`;
