(()=>{
  'use strict';
  const state={loaded:new Set(),failed:new Set(),started:performance.now()};
  const status=()=>document.querySelector('#status');
  const loading=()=>document.querySelector('#loading');
  const reveal=(title,detail)=>{
    const s=status();
    if(s)s.textContent=`${title}: ${detail}`;
    const l=loading();
    if(l)l.hidden=true;
  };
  window.GVBoot={
    loaded(name){state.loaded.add(name)},
    failed(name){state.failed.add(name);reveal('Module failed to load',`${name}.js — reload with ?repair=72`)},
    state
  };
  addEventListener('error',event=>{
    const file=(event.filename||'').split('/').pop();
    reveal('JavaScript error',`${event.message||'Unknown error'}${file?` · ${file}:${event.lineno||0}`:''}`);
    console.error('GeoVoxel startup error',event.error||event.message);
  });
  addEventListener('unhandledrejection',event=>{
    const reason=event.reason;
    reveal('Loading error',reason?.message||String(reason||'Unknown promise rejection'));
    console.error('GeoVoxel unhandled rejection',reason);
  });
  setTimeout(()=>{
    if(!window.GeoVoxel?.renderer){
      const missing=['core','mvt','data','render','stream','flight','ui'].filter(x=>!state.loaded.has(x));
      reveal('Engine did not start',missing.length?`Missing modules: ${missing.join(', ')}`:'A startup script stopped before the renderer was created');
    }
  },9000);
})();