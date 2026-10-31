export const PROFILE_CSS = `
.banner-adjust-modal{width:min(760px,calc(100vw - 1rem));max-width:calc(100vw - 1rem)}
.banner-adjust-stage{position:relative;width:100%;height:clamp(130px,28vw,230px);border-radius:12px;background-color:#090b14;background-repeat:no-repeat;overflow:hidden;cursor:grab;touch-action:none;user-select:none;border:1px solid var(--border);background-position:50% 50%;background-size:cover}
.banner-adjust-stage:active{cursor:grabbing}
.banner-adjust-hint{position:absolute;left:10px;bottom:10px;padding:5px 9px;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font-size:.72rem;pointer-events:none}
.banner-adjust-zoom{margin:16px 0}
.banner-adjust-zoom label{display:flex;justify-content:space-between;gap:12px}
.banner-adjust-zoom input{width:100%;accent-color:var(--accent)}
.banner-adjust-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.banner-adjust-actions .text-muted{margin-right:auto;font-size:.8rem}
.u-banner-adjust-btn{position:absolute;right:120px;top:12px;z-index:5;display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(8,10,18,.78);color:#fff;backdrop-filter:blur(10px);cursor:pointer}
@media(max-width:600px){.u-banner-adjust-btn{right:12px;top:54px}.banner-adjust-actions{align-items:stretch}.banner-adjust-actions>*{flex:1}.banner-adjust-actions .text-muted{flex-basis:100%;order:-1}}
.avatar-cropper-modal {
  max-width: calc(100vw - 1rem);
  width: min(calc(100vw - 1rem), 720px);
  max-height: calc(100vh - 1rem);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.avatar-cropper-modal .modal-header {
  flex: 0 0 auto;
  padding: 14px;
}
.avatar-cropper-modal .modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 14px 14px;
  scrollbar-color: var(--accent) rgba(255,255,255,0.08);
  scrollbar-width: thin;
}
.avatar-cropper-modal .modal-body::-webkit-scrollbar { width: 10px; }
.avatar-cropper-modal .modal-body::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); border-radius: 999px; }
.avatar-cropper-modal .modal-body::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 999px; }
.avatar-crop-stage {
  position: relative;
  width: 100%;
  max-width: 100%;
  margin: 0 auto 12px;
  background: #020611;
  border-radius: var(--radius-md);
  overflow: hidden;
  touch-action: none;
}
.avatar-crop-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 14px;
  margin-bottom: 12px;
}
.avatar-crop-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: end;
}
.avatar-crop-footer > p { flex: 1 1 180px; margin: 0; }
.avatar-crop-previews,
.avatar-crop-actions { display: flex; align-items: center; gap: 10px; }
.avatar-crop-actions { flex: 0 0 auto; justify-content: flex-end; margin-left: auto; }
.crop-handle {
  position: absolute;
  width: 12px; height: 12px;
  background: #fff;
  border: 2px solid rgba(0,0,0,0.5);
  border-radius: 2px;
}
@media (max-width: 620px) {
  .avatar-crop-controls,
  .avatar-crop-footer { display: flex; flex-direction: column; align-items: stretch; }
  .avatar-crop-actions { justify-content: stretch; margin-left: 0; }
  .avatar-crop-actions .btn { flex: 1; }
}

/* Privacy tab toggle switches */
.toggle-row { cursor: pointer; }
.toggle-switch { appearance: none; -webkit-appearance: none; width: 42px; height: 24px; border-radius: 999px; background: rgba(255,255,255,.12); border: 1px solid var(--border); position: relative; flex-shrink: 0; cursor: pointer; transition: background .15s ease; }
.toggle-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
.toggle-switch:checked { background: var(--accent); border-color: var(--accent); }
.toggle-switch:checked::after { transform: translateX(18px); }

.danger-zone { border-color: rgba(124,58,237,.35); }

/* Social links inputs — icon-prefixed rows in the Account tab */
.social-input-row { display: flex; align-items: center; gap: 10px; }
.social-input-row svg.icon { flex-shrink: 0; width: 18px; height: 18px; color: var(--text-muted); }
.social-input-row .form-control { flex: 1; }
.social-input-spacer { display: inline-block; width: 18px; flex-shrink: 0; }
.social-input-static { flex: 1; font-size: .85rem; color: var(--text-secondary); background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 9px 12px; display: flex; align-items: center; gap: 6px; }
.social-input-static svg.icon { color: var(--accent); }
</style>
`;
