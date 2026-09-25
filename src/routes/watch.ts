
  const serverControlsHtml = (isLoggedIn && (video || hasMegaplayFallback || hasTurboVid)) ? `
        <div class="wp-controls">
          ${qSub.length > 0 ? `
          <div class="wp-quality-row">
            <span class="wpc-label">Quality</span>
            <div class="wpc-quals" id="watch-quality-btns">
              ${qSub.map((q, qi) => `<button class="wpc-q${qi === 0 ? ' on' : ''}" onclick="switchWatchQuality(this,${qi})">${h(q.label)}</button>`).join('')}
            </div>
          </div>` : ''}
          <div class="server-panel" id="server-grid">
            <div class="server-panel-head"><span class="server-panel-lbl"><span class="server-panel-dot"></span>Servers</span><span class="server-panel-hint">Click to switch</span></div>
            <div class="server-panel-body">
              <div class="server-tabs"><button class="server-tab active" data-tab="sub">${icon('captions', 'server-tab-icon')}<span>Sub</span></button><button class="server-tab" data-tab="dub">${icon('mic', 'server-tab-icon')}<span>Dub</span></button></div>
              <div class="server-tab-panel active" id="tab-panel-sub" data-audio="sub">
                <div class="server-btn-row" id="servers-sub-body">
                  ${turbovidServers.filter(v=>v.audio_group==='sub').map(v=>` <button class="server-btn turbovid-server-btn av-server" data-server="turbovid:${v.id}" data-turbovid-id="${v.id}" title="AniVault Sub"><img class="av-server-logo" src="${siteUrl}/assets/img/site-img/icon.png" alt="" aria-hidden="true"><span class="av-server-label" style="margin-left:4px;">Sub</span></button>`).join('')}