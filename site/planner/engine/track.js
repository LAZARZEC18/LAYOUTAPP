/* ============================================================
   Greenhse Layout — anonymous usage beacon.
   Counts sessions and key actions (no names, no plan content)
   so we can see how much the app is used and what people do in
   it. Staff loads (?load=) and QA runs (?qa=1) are excluded.
   Fails silently when the endpoint is absent (dev/preview).
   ============================================================ */
export function mountTrack(){
"use strict";
if(/[?&](qa=1|load=|draft=)/.test(location.search)) return;
var EP='/api/track',uid,sid,q=[],timer=null,lastF=-1,lastR=-1;
try{uid=localStorage.getItem('gh_uid');if(!uid){uid=Math.random().toString(36).slice(2,10);localStorage.setItem('gh_uid',uid);}}catch(e){uid='anon';}
try{sid=sessionStorage.getItem('gh_sid');if(!sid){sid=Date.now().toString(36)+Math.random().toString(36).slice(2,6);sessionStorage.setItem('gh_sid',sid);}}catch(e){sid='s'+Date.now().toString(36);}
function flush(){
  if(timer){clearTimeout(timer);timer=null;}
  if(!q.length) return;
  var body=JSON.stringify({uid:uid,sid:sid,events:q.splice(0,50)});
  try{
    if(navigator.sendBeacon) navigator.sendBeacon(EP,new Blob([body],{type:'application/json'}));
    else fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){});
  }catch(e){}
}
function ev(name,data){
  /* A return after 30 quiet minutes counts as a NEW session, even in the
     same tab - otherwise a reopened tab merges into the old row and a
     later visit never shows on the dashboard. */
  try{
    var now=Date.now(), last=+localStorage.getItem('gh_last')||0;
    if(last&&now-last>1800000){
      sid=now.toString(36)+Math.random().toString(36).slice(2,6);
      try{sessionStorage.setItem('gh_sid',sid);}catch(e2){}
    }
    localStorage.setItem('gh_last',String(now));
  }catch(e){}
  q.push({e:name,t:Date.now(),d:data||null});
  if(name==='state'){ if(!timer) timer=setTimeout(flush,15000); }
  else flush();                       /* key actions land immediately */
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush();});
window.addEventListener('pagehide',flush);
/* key actions by their buttons */
document.addEventListener('click',function(e){
  var el=e.target&&e.target.closest?e.target.closest('button'):null;
  if(!el)return;
  var m={'btn-save':'pdf','btn-png':'png','btn-print':'print','btn-enq':'send_opened'};
  if(m[el.id]) ev(m[el.id]);
},true);
/* progress sampling: how far people actually get */
setInterval(function(){
  var G=window.__GH;if(!G||!G.S)return;
  var f=G.S.fixtures.length,r=G.S.rooms.length;
  if(f!==lastF||r!==lastR){lastF=f;lastR=r;ev('state',{f:f,r:r});}
},30000);
window.__GHTRACK=ev;
ev('open');flush();
}
