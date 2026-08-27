const CACHE='en-wb-v1';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  // 只缓存同源 GET（HTML/CSS/JS/图标等），不缓存跨域音频
  e.respondWith(
    fetch(req).then(res=>{
      if(res&&res.status===200){
        const c=res.clone();
        caches.open(CACHE).then(cache=>cache.put(req,c)).catch(()=>{});
      }
      return res;
    }).catch(()=>caches.match(req).then(m=>m||new Response('offline',{status:503})))
  );
});
