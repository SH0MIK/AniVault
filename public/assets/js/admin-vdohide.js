(function(){
const scriptConfig=document.querySelector('script[src*="/assets/js/admin-vdohide.js"]');
const siteUrl=scriptConfig?.dataset.siteUrl||location.origin;
const selectedAnime=Number(scriptConfig?.dataset.selectedAnime||0);
const selectedHoshikaId=String(scriptConfig?.dataset.selectedHoshikaId||selectedAnime||'');
let episodeNumbers=[];
try{episodeNumbers=JSON.parse(scriptConfig?.dataset.episodes||"[]");}catch{}
const byId=id=>document.getElementById(id);

function closeModal(){const m=byId('tv-modal');if(m)m.classList.remove('open');document.body.style.overflow='';}
function openModal(ep=0,source=null){
  const m=byId('tv-modal');if(!m)return;
  m.classList.add('open');document.body.style.overflow='hidden';
  const f=byId('tv-form');if(f)f.reset();
  byId('tv-source-id').value='';
  if(selectedHoshikaId)byId('tv-anime').value=selectedHoshikaId;
  if(ep)byId('tv-ep').value=String(ep);
  if(source){
    byId('tv-source-id').value=String(source.id||'');
    byId('tv-anime').value=String(selectedHoshikaId||source.anime_id||selectedAnime||'');
    byId('tv-ep').value=String(source.episode_num||'');
    byId('tv-url').value=source.embed_url||'';
    byId('tv-active').checked=!!source.is_active;
    byId('tv-modal-title').textContent='Edit VdoHide Source';
    byId('tv-save').textContent='Update Source';
  }else{
    byId('tv-active').checked=true;
    byId('tv-modal-title').textContent='Add VdoHide Source';
    byId('tv-save').textContent='Save Source';
  }
}

async function searchHoshika(){
  const query=byId('tv-hoshika-query')?.value.trim(),box=byId('tv-hoshika-results'),btn=byId('tv-hoshika-search');
  if(!query||!box)return;
  btn.disabled=true;btn.textContent='Searching…';box.textContent='Searching Hoshika…';
  try{
    const r=await fetch(siteUrl+'/admin/vdohide.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'search-hoshika',query})});
    const d=await r.json();
    if(!r.ok||!d.success)throw new Error(d.error||'Hoshika search failed');
    box.innerHTML='';
    if(!d.results?.length){box.textContent='No Hoshika anime found.';return;}
    d.results.forEach(a=>{
      const b=document.createElement('button');b.type='button';b.className='tv-hoshika-result';
      const img=document.createElement('img');img.alt='';img.src=a.poster||'';img.loading='lazy';
      const span=document.createElement('span'),title=document.createElement('strong'),meta=document.createElement('small');
      title.textContent=a.title||a.titleEnglish||a.titleRomaji||'Untitled';
      meta.textContent='Hoshika #'+a.shortId+(a.type?' · '+a.type:'');
      span.append(title,meta);b.append(img,span);
      b.addEventListener('click',()=>{byId('tv-anime').value=String(a.shortId);byId('tv-hoshika-selected').textContent='Selected: '+title.textContent+' · Hoshika #'+a.shortId;box.innerHTML='';});
      box.appendChild(b);
    });
  }catch(e){box.textContent=e.message||'Hoshika search failed';}
  finally{btn.disabled=false;btn.textContent='Search';}
}

let currentUploadEp=0;
function closeSubModal(){const m=byId('tv-sub-modal');if(m)m.classList.remove('open');document.body.style.overflow='';}
function openSubModal(sourceId,ep){
  const m=byId('tv-sub-modal');if(!m)return;
  m.classList.add('open');document.body.style.overflow='hidden';
  const f=byId('tv-sub-form');if(f)f.reset();
  byId('tv-sub-source-id').value=String(sourceId);
  currentUploadEp=ep;
  byId('tv-sub-label').value='English [Full]';
  byId('tv-sub-lang').value='en';
  byId('tv-sub-default').checked=true;
}

async function uploadSubtitle(e){
  e.preventDefault();
  const sourceId=+byId('tv-sub-source-id').value;
  const fileInput=byId('tv-sub-file');
  const label=byId('tv-sub-label').value.trim();
  const lang=byId('tv-sub-lang').value.trim();
  const isDefault=byId('tv-sub-default').checked?'1':'0';

  if(!sourceId||!fileInput?.files?.length){
    alert('Please select a subtitle file (.srt or .vtt).');
    return false;
  }
  const file=fileInput.files[0];
  const btn=byId('tv-sub-save');
  btn.disabled=true;btn.textContent='Uploading & Converting…';

  const formData=new FormData();
  formData.append('action','upload-subtitle');
  formData.append('source_id',String(sourceId));
  formData.append('label',label);
  formData.append('lang',lang);
  formData.append('is_default',isDefault);
  formData.append('file',file);

  try{
    const r=await fetch(siteUrl+'/admin/vdohide.php',{method:'POST',body:formData});
    const d=await r.json();
    if(!r.ok||!d.success)throw new Error(d.error||'Subtitle upload failed');
    closeSubModal();
    if(currentUploadEp)await loadSources(currentUploadEp);
  }catch(err){
    alert(err.message||'Subtitle upload failed');
  }finally{
    btn.disabled=false;btn.textContent='Upload & Save Subtitle';
  }
  return false;
}

async function deleteSubtitle(sourceId,filename,url,ep){
  try{
    const r=await fetch(siteUrl+'/admin/vdohide.php',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'delete-subtitle',source_id:sourceId,filename,url})
    });
    const d=await r.json();
    if(!r.ok||!d.success)throw new Error(d.error||'Subtitle delete failed');
    if(ep)await loadSources(ep);
  }catch(err){
    alert(err.message||'Subtitle delete failed');
  }
}

async function loadSources(ep){
  const box=document.querySelector('#tv-ep-details-'+ep+' .tv-detail-loading');
  if(!box)return;
  try{
    const r=await fetch(siteUrl+'/admin/vdohide.php?json=1&anime='+encodeURIComponent(selectedAnime)+'&episode='+encodeURIComponent(ep));
    const d=await r.json();
    if(!d.success)throw new Error(d.error||'Load failed');
    box.innerHTML='';
    if(!d.sources.length){box.innerHTML='<div class="tv-detail-loading">No sources found.</div>';return;}
    d.sources.forEach(src=>{
      const item=document.createElement('div');item.className='tv-source-item';
      const header=document.createElement('div');header.className='tv-source-header';
      const main=document.createElement('div');main.className='tv-source-main';
      const label=document.createElement('div');label.className='tv-source-label';
      label.textContent=String(src.label||'Source')+(src.is_active?'':' · Inactive');
      const url=document.createElement('div');url.className='tv-source-url';url.textContent=String(src.embed_url||'');
      const masterUrl=document.createElement('div');masterUrl.className='tv-source-url';
      masterUrl.textContent=src.master_url?'Stream: '+String(src.master_url):'';
      main.append(label,url,masterUrl);
      const actions=document.createElement('div');actions.className='tv-source-buttons';
      const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';
      edit.onclick=e=>{e.stopPropagation();openModal(src.episode_num,src);};
      const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='Delete';
      del.onclick=e=>{e.stopPropagation();deleteSource(src.id);};
      actions.append(edit,del);
      header.append(main,actions);
      item.append(header);

      // Subtitles section
      const subWrap=document.createElement('div');subWrap.className='tv-source-subs';
      let subs=[];
      try{subs=JSON.parse(String(src.subtitles_json||'[]'));}catch{}
      if(Array.isArray(subs)&&subs.length){
        subs.forEach(s=>{
          const badge=document.createElement('span');
          badge.className='tv-sub-badge'+(s.custom?' custom':'');
          badge.textContent=(s.label||s.lang||'Sub')+(s.default?' · Default':'')+(s.custom?' (Uploaded)':'');
          if(s.custom){
            const delSub=document.createElement('span');
            delSub.className='tv-sub-del';
            delSub.textContent='✕';
            delSub.title='Delete custom subtitle';
            delSub.onclick=async ev=>{
              ev.stopPropagation();
              if(!confirm('Delete custom subtitle "'+(s.label||'')+'"?'))return;
              await deleteSubtitle(src.id,s.filename||'',s.url||'',ep);
            };
            badge.append(delSub);
          }
          subWrap.append(badge);
        });
      }else{
        const noSub=document.createElement('span');
        noSub.style.fontSize='.68rem';
        noSub.style.color='var(--text-muted)';
        noSub.textContent='No subtitles detected';
        subWrap.append(noSub);
      }
      const uploadBtn=document.createElement('button');
      uploadBtn.type='button';
      uploadBtn.className='tv-sub-upload-btn';
      uploadBtn.textContent='＋ Upload Subtitle';
      uploadBtn.onclick=e=>{
        e.stopPropagation();
        openSubModal(src.id,ep);
      };
      subWrap.append(uploadBtn);
      item.append(subWrap);

      box.appendChild(item);
    });
  }catch(err){box.innerHTML='<div style="color:#fca5a5;font-size:.75rem">Could not load source details.</div>';}
}

async function toggleEpisode(row){
  const ep=Number(row?.dataset?.episode||0),d=byId('tv-ep-details-'+ep);
  if(!d)return;
  const wasOpen=!d.hidden;
  document.querySelectorAll('.tv-ep-details').forEach(x=>x.hidden=true);
  document.querySelectorAll('.tv-ep-row').forEach(x=>x.classList.remove('open'));
  if(wasOpen)return;
  d.hidden=false;row.classList.add('open');
  const box=d.querySelector('.tv-detail-loading');
  if(box)box.textContent='Loading sources…';
  await loadSources(ep);
}

async function deleteSource(id){
  if(!confirm('Delete this VdoHide source?'))return;
  try{
    const r=await fetch(siteUrl+'/admin/vdohide.php?id='+encodeURIComponent(id),{method:'DELETE'});
    const d=await r.json();if(!d.success)throw new Error(d.error||'Delete failed');
    location.reload();
  }catch(err){alert(err.message||'Delete failed');}
}

async function saveSource(e){
  e.preventDefault();
  const id=+byId('tv-source-id').value||0;
  const anime_id=+byId('tv-anime').value;
  const episode_num=+byId('tv-ep').value;
  const embed_url=String(byId('tv-url').value||'').trim();
  const is_active=byId('tv-active').checked?1:0;
  if(!anime_id||!episode_num||!embed_url){alert('Select an anime from Hoshika search and enter an episode number and embed URL.');return false;}
  const btn=byId('tv-save');
  btn.disabled=true;btn.textContent=id?'Updating…':'Resolving & Saving…';
  try{
    const r=await fetch(siteUrl+'/admin/vdohide.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,anime_id,episode_num,embed_url,is_active})});
    const d=await r.json();
    if(!d.success)throw new Error(d.error||'Save failed');
    location.href=siteUrl+'/admin/vdohide.php?anime='+anime_id;
  }catch(err){alert(err.message||'Save failed');btn.disabled=false;btn.textContent=id?'Update Source':'Save Source';}
  return false;
}

byId('tv-hoshika-search')?.addEventListener('click',searchHoshika);
byId('tv-hoshika-query')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchHoshika();}});
byId('tv-form')?.addEventListener('submit',saveSource);
byId('tv-sub-form')?.addEventListener('submit',uploadSubtitle);

document.addEventListener('click',async e=>{
  const target=e.target instanceof Element?e.target:null;if(!target)return;
  const refreshSeries=target.closest('#tv-refresh-series');
  if(refreshSeries){
    e.preventDefault();
    const animeId=Number(refreshSeries.dataset.animeId||selectedAnime);if(!animeId)return;
    if(!confirm('Re-resolve every saved VdoHide embed for this series? This updates the stored stream URLs, qualities, audio and subtitle tracks.'))return;
    const originalText=refreshSeries.innerHTML;
    refreshSeries.disabled=true;refreshSeries.innerHTML='<span aria-hidden="true">↻</span> Refreshing streams…';
    try{
      const response=await fetch(siteUrl+'/admin/vdohide.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh-series',anime_id:animeId})});
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error(result.error||'Refresh failed.');
      const refreshed=Number(result.refreshed||0),failed=Number(result.failed||0);
      alert('Stream refresh finished.\nUpdated: '+refreshed+'\nFailed: '+failed+(failed?'\nSome links could not be resolved.':''));
      if(refreshed>0)location.href=siteUrl+'/admin/vdohide.php?anime='+animeId;
      else{refreshSeries.disabled=false;refreshSeries.innerHTML=originalText;}
    }catch(error){
      alert(error.message||'Could not refresh the series streams.');
      refreshSeries.disabled=false;refreshSeries.innerHTML=originalText;
    }
    return;
  }
  const addSeries=target.closest('#tv-add-series');
  if(addSeries){e.preventDefault();openModal();return;}
  const addEpisode=target.closest('#tv-add-episode');
  if(addEpisode){e.preventDefault();const nums=episodeNumbers;const next=nums.length?Math.max(...nums)+1:1;openModal(next);return;}
  if(target.closest('#tv-close-modal,#tv-cancel-modal')){e.preventDefault();closeModal();return;}
  if(target.closest('#tv-close-sub-modal,#tv-cancel-sub-modal')){e.preventDefault();closeSubModal();return;}
  const addSource=target.closest('[data-tv-add-episode]');
  if(addSource){e.preventDefault();e.stopPropagation();openModal(Number(addSource.dataset.tvAddEpisode||0));return;}
  const expander=target.closest('[data-tv-expand="1"]');
  if(expander){e.preventDefault();const row=expander.closest('.tv-ep-row');if(row)toggleEpisode(row);return;}
  if(target.id==='tv-modal')closeModal();
  if(target.id==='tv-sub-modal')closeSubModal();
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeSubModal();}});
})();
