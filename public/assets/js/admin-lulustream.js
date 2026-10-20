(function(){
const scriptConfig=document.querySelector('script[src*="/assets/js/admin-lulustream.js"]');
const siteUrl=scriptConfig?.dataset.siteUrl||location.origin;
const selectedAnime=Number(scriptConfig?.dataset.selectedAnime||0);
let episodeNumbers=[];
try{episodeNumbers=JSON.parse(scriptConfig?.dataset.episodes||"[]");}catch{}
const byId=id=>document.getElementById(id);
const tvDebugLog=[];
function tvDebug(message,detail){const time=new Date().toLocaleTimeString();let extra='';try{extra=detail===undefined?'': ' '+(typeof detail==='string'?detail:JSON.stringify(detail));}catch{extra=' [details unavailable]';}const line='['+time+'] '+message+extra;tvDebugLog.push(line);if(tvDebugLog.length>100)tvDebugLog.shift();const out=byId('tv-debug-log');if(out){out.textContent=tvDebugLog.join('\\n');out.scrollTop=out.scrollHeight;}const status=byId('tv-debug-status');if(status)status.textContent='Script active · '+tvDebugLog.length+' log entries';}
tvDebug('Page script started',{url:location.href,selectedAnime,readyState:document.readyState});
window.addEventListener('error',e=>tvDebug('JavaScript error',{message:e.message,source:e.filename,line:e.lineno,column:e.colno}));
window.addEventListener('unhandledrejection',e=>tvDebug('Unhandled promise rejection',{reason:String(e.reason?.stack||e.reason||'unknown')}));
document.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;if(t&&t.closest('#tv-add-series,#tv-add-episode,#tv-save,#tv-close-modal,#tv-cancel-modal,[data-tv-expand="1"],[data-tv-add-episode]'))tvDebug('Control click captured',{control:t.closest('#tv-add-series,#tv-add-episode,#tv-save,#tv-close-modal,#tv-cancel-modal,[data-tv-expand="1"],[data-tv-add-episode]')?.id||t.closest('[data-tv-expand="1"],[data-tv-add-episode]')?.outerHTML?.slice(0,160)||t.id||t.tagName});},true);
byId('tv-debug-test')?.addEventListener('click',()=>tvDebug('Manual JavaScript test passed'));
byId('tv-debug-clear')?.addEventListener('click',()=>{tvDebugLog.length=0;const out=byId('tv-debug-log');if(out)out.textContent='Logs cleared.';tvDebug('Log cleared');});
byId('tv-debug-copy')?.addEventListener('click',async()=>{const text=tvDebugLog.join('\\n');try{await navigator.clipboard.writeText(text);const status=byId('tv-debug-status');if(status)status.textContent='Logs copied to clipboard.';}catch{const out=byId('tv-debug-log');if(out){out.focus?.();}tvDebug('Clipboard copy failed; please long-press the log text and copy it manually.');}});
const originalFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{const request=args[0],url=typeof request==='string'?request:request?.url||String(request);const relevant=url.includes('lulustream_servers.php');if(relevant)tvDebug('Request started',{url,method:args[1]?.method||request?.method||'GET'});try{const response=await originalFetch(...args);if(relevant)tvDebug('Request completed',{url,status:response.status,ok:response.ok});return response;}catch(error){if(relevant)tvDebug('Request failed',{url,error:String(error?.stack||error)});throw error;}};

let tvPresetEpisode=0;
function normalizeLuluUrl(value){const raw=String(value||'').trim();if(!raw)return '';try{const u=new URL(raw);if(u.protocol!=='https:')return raw;const host=u.hostname.toLowerCase();if(!['lulust.com','luluvido.com'].some(root=>host===root||host.endsWith('.'+root)))return raw;const m=u.pathname.match(/^\/(d|e)\/([^/]+)\/?$/i);if(!m)return raw;u.pathname='/e/'+m[2];return u.toString().replace(/\/$/,'');}catch{return raw;}}
function updateLuluPreview(){const input=byId('tv-url'),wrap=byId('tv-url-preview'),link=byId('tv-normalized-url'),frame=byId('tv-embed-preview'),note=byId('tv-preview-error');if(!input||!wrap||!link||!frame)return;const raw=input.value.trim(),normalized=normalizeLuluUrl(raw);if(!raw){wrap.style.display='none';frame.style.display='none';frame.removeAttribute('src');return;}wrap.style.display='block';link.textContent=normalized||raw;link.href=normalized||'#';let isEmbed=false;try{const u=new URL(normalized);isEmbed=u.protocol==='https:'&&/^\/e\/[^/]+\/?$/i.test(u.pathname)&&['lulust.com','luluvido.com'].some(root=>u.hostname===root||u.hostname.endsWith('.'+root));}catch{}if(isEmbed){frame.style.display='block';if(frame.src!==normalized)frame.src=normalized;note.textContent=normalized!==raw?'Converted automatically from /d/ to /e/. Preview may be blocked by the provider.':'Embed URL preview. Preview may be blocked by the provider.';}else{frame.style.display='none';frame.removeAttribute('src');note.textContent='Enter a valid LuluStream /d/ or /e/ link to preview the normalized embed URL.';}}
function closeLuluModal(){const m=byId('tv-modal');if(m)m.classList.remove('open');document.body.style.overflow='';}
function openLuluModal(ep=0,source=null){tvDebug('openLuluModal called',{episode:ep,editing:!!source});const m=byId('tv-modal');if(!m){tvDebug('ERROR: modal #tv-modal not found');return;}m.classList.add('open');document.body.style.overflow='hidden';const f=byId('tv-form');if(f)f.reset();byId('tv-source-id').value='';updateLuluPreview();if(selectedAnime)byId('tv-anime').value=String(selectedAnime);if(ep)byId('tv-ep').value=String(ep);if(source){byId('tv-source-id').value=String(source.id||'');byId('tv-anime').value=String(source.anime_id||selectedAnime||'');byId('tv-ep').value=String(source.episode_num||'');byId('tv-url').value=source.embed_url||'';updateLuluPreview();byId('tv-active').checked=!!source.is_active;byId('tv-modal-title').textContent='Edit LuluStream Source';byId('tv-save').textContent='Update Source';}else{byId('tv-active').checked=true;byId('tv-modal-title').textContent='Add Series / Episode Source';byId('tv-save').textContent='Save Source';}}
async function loadLuluSources(ep){tvDebug('Loading episode sources',{episode:ep});const box=document.querySelector('#tv-ep-details-'+ep+' .tv-detail-loading');if(!box){tvDebug('ERROR: episode loading element not found',{episode:ep});return;}try{const r=await fetch(siteUrl+'/admin/lulustream_servers.php?json=1&anime='+encodeURIComponent(selectedAnime)+'&episode='+encodeURIComponent(ep));const d=await r.json();if(!d.success)throw new Error(d.error||'Load failed');box.innerHTML='';if(!d.sources.length){box.innerHTML='<div class="tv-detail-loading">No sources found.</div>';return;}d.sources.forEach(src=>{const item=document.createElement('div');item.className='tv-source-item';const main=document.createElement('div');main.className='tv-source-main';const label=document.createElement('div');label.className='tv-source-label';label.textContent=String(src.label||'Source')+(src.is_active?'':' · Inactive');const note=document.createElement('div');note.className='tv-edit-note';note.textContent=String(src.audio_group||'')+(src.language?' · '+src.language:'');const url=document.createElement('div');url.className='tv-source-url';url.textContent=String(src.embed_url||'');main.append(label,note,url);const actions=document.createElement('div');actions.className='tv-source-buttons';const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.onclick=e=>{e.stopPropagation();openLuluModal(src.episode_num,src);};const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='Delete';del.onclick=e=>{e.stopPropagation();deleteLuluSource(src.id);};actions.append(edit,del);item.append(main,actions);box.appendChild(item);});}catch(err){box.innerHTML='<div style="color:#fca5a5;font-size:.75rem">Could not load source details.</div>';}}
async function toggleLuluEpisode(row){const ep=Number(row?.dataset?.episode||0),d=byId('tv-ep-details-'+ep);tvDebug('Episode expand handler called',{episode:ep,foundDetails:!!d});if(!d){tvDebug('ERROR: episode details row not found',{episode:ep});return;}const wasOpen=!d.hidden;document.querySelectorAll('.tv-ep-details').forEach(x=>x.hidden=true);document.querySelectorAll('.tv-ep-row').forEach(x=>x.classList.remove('open'));if(wasOpen)return;d.hidden=false;row.classList.add('open');const box=d.querySelector('.tv-detail-loading');if(box)box.textContent='Loading sources…';await loadLuluSources(ep);}
async function deleteLuluSource(id){if(!confirm('Delete this LuluStream source?'))return;try{const r=await fetch(siteUrl+'/admin/lulustream_servers.php?id='+encodeURIComponent(id),{method:'DELETE'});const d=await r.json();if(!d.success)throw new Error(d.error||'Delete failed');location.reload();}catch(err){alert(err.message||'Delete failed');}}
async function saveLuluSource(e){tvDebug('Save form submit handler called');e.preventDefault();const id=+byId('tv-source-id').value||0,anime_id=+byId('tv-anime').value,episode_num=+byId('tv-ep').value,embed_url=normalizeLuluUrl(byId('tv-url').value),is_active=byId('tv-active').checked?1:0;if(!anime_id||!episode_num||!embed_url)return false;const btn=byId('tv-save');btn.disabled=true;btn.textContent=id?'Updating…':'Saving…';try{const r=await fetch(siteUrl+'/admin/lulustream_servers.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,anime_id,episode_num,embed_url,is_active})});const d=await r.json();if(!d.success)throw new Error(d.error||'Save failed');location.href=siteUrl+'/admin/lulustream_servers.php?anime='+anime_id}catch(err){alert(err.message||'Save failed');btn.disabled=false;btn.textContent=id?'Update Source':'Save Source'}return false;}
window.openLuluModal=openLuluModal;window.closeLuluModal=closeLuluModal;window.saveLuluSource=saveLuluSource;
// Delegate UI clicks from the document so the controls keep working even if
// the browser reparses parts of the admin markup. Handle each click exactly once.
document.addEventListener('click',async e=>{
  const target=e.target instanceof Element?e.target:null;
  if(!target)return;
  const refreshSeries=target.closest('#tv-refresh-series');
  if(refreshSeries){
    e.preventDefault();
    const animeId=Number(refreshSeries.dataset.animeId||selectedAnime);
    if(!animeId)return;
    if(!confirm('Refetch every saved LuluStream source for this series? This updates detected audio and subtitle tracks without changing the saved links.'))return;
    const originalText=refreshSeries.innerHTML;
    refreshSeries.disabled=true;
    refreshSeries.innerHTML='<span aria-hidden="true">↻</span> Refreshing streams…';
    try{
      const response=await fetch(siteUrl+'/admin/lulustream_servers.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'refresh-series',anime_id:animeId})
      });
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.error||'Refresh failed.');
      const refreshed=Number(result.refreshed||0),failed=Number(result.failed||0);
      alert('Stream refresh finished.\\nUpdated: '+refreshed+'\\nFailed: '+failed+(failed?'\\nSome links could not be resolved. Check those sources and try again.':''));
      if(refreshed>0)location.href=siteUrl+'/admin/lulustream_servers.php?anime='+animeId;
      else{refreshSeries.disabled=false;refreshSeries.innerHTML=originalText;}
    }catch(error){
      alert(error.message||'Could not refresh the series streams.');
      refreshSeries.disabled=false;
      refreshSeries.innerHTML=originalText;
    }
    return;
  }
  const addSeries=target.closest('#tv-add-series');
  if(addSeries){tvDebug('Add Series handler matched');e.preventDefault();openLuluModal();return;}
  const addEpisode=target.closest('#tv-add-episode');
  if(addEpisode){tvDebug('Add Episode handler matched');e.preventDefault();const nums=episodeNumbers;const next=nums.length?Math.max(...nums)+1:1;openLuluModal(next);return;}
  if(target.closest('#tv-close-modal,#tv-cancel-modal')){e.preventDefault();closeLuluModal();return;}
  const addSource=target.closest('[data-tv-add-episode]');
  if(addSource){e.preventDefault();e.stopPropagation();openLuluModal(Number(addSource.dataset.tvAddEpisode||0));return;}
  const expander=target.closest('[data-tv-expand="1"]');
  if(expander){tvDebug('Episode expander handler matched');e.preventDefault();const row=expander.closest('.tv-ep-row');if(row)toggleLuluEpisode(row);else tvDebug('ERROR: expander has no .tv-ep-row parent');return;}
  if(target.id==='tv-modal')closeLuluModal();
}, true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLuluModal();});
byId('tv-form')?.addEventListener('submit',saveLuluSource);
byId('tv-url')?.addEventListener('input',updateLuluPreview);
byId('tv-paste-url')?.addEventListener('click',async()=>{const input=byId('tv-url');if(!input)return;try{if(!navigator.clipboard?.readText)throw new Error('Clipboard access is unavailable in this browser.');const text=await navigator.clipboard.readText();if(!text.trim())throw new Error('Clipboard is empty.');input.value=normalizeLuluUrl(text.trim());updateLuluPreview();input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));}catch(err){alert(err.message||'Could not paste from clipboard. You can paste manually.');}});
})();
