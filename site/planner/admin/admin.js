/* Greenhse Layout submissions (staff) — the page's script as a module.
   Same code as the old layout-admin.html; the IIFE became mountAdmin(), which
   the React component calls once the shell is in the DOM. Talks to the
   Netlify functions at /api/layouts, /api/draft and /api/track with the
   x-admin-key header; the key is kept in localStorage under greenhse_admin_key. */
export function mountAdmin(){
"use strict";
var $=function(s){return document.querySelector(s);};
var KEY_LS='greenhse_admin_key';
var key=null, plansCache={}, curPlans=[], curDrafts=[];

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function money(n){return '$'+(+n||0).toFixed(2);}
function when(iso){
  try{return new Date(iso).toLocaleString('en-AU',
    {timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric',
     hour:'numeric',minute:'2-digit'});}catch(e){return iso||'';}
}
function api(path,opts){
  opts=opts||{};opts.headers=opts.headers||{};
  opts.headers['x-admin-key']=key;
  return fetch(path,opts).then(function(r){
    if(r.status===401) throw {auth:true};
    if(!r.ok) throw new Error(r.status);
    return r.json();
  });
}

/* ---------- key gate ---------- */
function tryEnter(k){
  key=k;
  api('/api/layouts').then(function(res){
    try{localStorage.setItem(KEY_LS,key);}catch(e){}
    $('#gate').hidden=true;$('#app').hidden=false;
    $('#refresh').hidden=false;$('#signout').hidden=false;
    render(res.plans||[],res.drafts||[]);
    loadUsage();
    openFromLink(res.plans||[]);
  }).catch(function(e){
    key=null;
    $('#gate-err').textContent=e&&e.auth?
      'That key was not accepted.':
      'Could not reach the submissions store. This page works on the Netlify deploy, not on a local copy.';
  });
}
$('#enter').onclick=function(){var k=$('#key').value.trim();if(k)tryEnter(k);};
$('#key').addEventListener('keydown',function(e){if(e.key==='Enter')$('#enter').click();});
$('#signout').onclick=function(){
  try{localStorage.removeItem(KEY_LS);}catch(e){}
  location.reload();
};
$('#refresh').onclick=function(){load();};

function load(){
  $('#loading').hidden=false;$('#empty').hidden=true;$('#list').innerHTML='';
  api('/api/layouts').then(function(res){render(res.plans||[],res.drafts||[]);loadUsage();})
    .catch(function(){$('#loading').textContent='Could not load submissions.';});
}

/* ---------- usage dashboard ---------- */
function loadUsage(){
  api('/api/track').then(function(u){
    var days=u.days||[];
    var last7=days.slice(-7);
    function sum(k){return last7.reduce(function(a,d){return a+(d[k]||0);},0);}
    $('#u-vis').textContent=sum('visitors');
    $('#u-sess').textContent=sum('sessions');
    $('#u-sent').textContent=sum('sent');
    $('#u-pdf').textContent=sum('pdf');
    $('#u-days').innerHTML='<tr><th>Day</th><th class="num">Visitors</th><th class="num">Sessions</th>'+
      '<th class="num">Plans sent</th><th class="num">PDFs</th></tr>'+
      days.slice(-14).reverse().map(function(d){
        return '<tr><td>'+esc(d.date)+'</td><td class="num">'+d.visitors+'</td>'+
          '<td class="num">'+d.sessions+'</td><td class="num">'+d.sent+'</td>'+
          '<td class="num">'+d.pdf+'</td></tr>';
      }).join('');
    $('#u-recent').innerHTML='<tr><th>Session</th><th>What they did</th></tr>'+
      (u.recent||[]).map(function(s){
        var did=[];
        if(s.f)did.push(s.f+' light'+(s.f===1?'':'s'));
        if(s.r)did.push(s.r+' room'+(s.r===1?'':'s'));
        ['pdf','png','print'].forEach(function(k){if(s.events[k])did.push(k.toUpperCase());});
        if(s.events.send_opened&&!s.events.sent)did.push('opened Send');
        if(s.events.sent)did.push('SENT A PLAN');
        return '<tr><td>'+esc(s.date)+' '+new Date(s.last).toLocaleTimeString('en-AU',
          {timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'})+'</td>'+
          '<td>'+esc(did.join(' · ')||'opened the app')+'</td></tr>';
      }).join('');
    $('#usage').hidden=false;
  }).catch(function(){/* usage is optional; the plan list still works */});
}

/* ---------- direct link from the notification email ---------- */
var openedFromLink=false;
function openFromLink(plans){
  if(openedFromLink)return;openedFromLink=true;
  var m=location.search.match(/[?&]open=([\w-]+)/);
  if(!m)return;
  var p=plans.filter(function(x){return x.id===m[1];})[0];
  if(p)openDetail(p);
}

/* ---------- list ---------- */
function render(plans,drafts){
  curPlans=plans;curDrafts=drafts||[];
  $('#loading').hidden=true;
  var list=$('#list');list.innerHTML='';
  if(!plans.length&&!curDrafts.length){$('#empty').hidden=false;return;}
  $('#empty').hidden=true;
  /* In-progress drafts first (they are what is happening right now),
     then completed submissions, green-outlined. */
  curDrafts.forEach(function(d){list.appendChild(draftCard(d));});
  plans.forEach(function(p){
    var card=document.createElement('div');card.className='card complete';
    card.innerHTML=
      '<div class="shot">'+(p.thumb?'<img src="'+p.thumb+'" alt="Plan preview">':'<span>No preview</span>')+'</div>'+
      '<div class="body">'+
        '<span class="badge done">\u2713 Completed</span>'+
        '<h3>'+esc(p.name)+'</h3>'+
        '<div class="proj">'+esc(p.project||'Untitled plan')+'</div>'+
        '<div class="meta">'+esc(when(p.submittedAt))+
          (p.suburb?' · '+esc(p.suburb):'')+(p.jobType?' · '+esc(p.jobType):'')+'</div>'+
        '<div class="meta">'+esc(p.email||'')+(p.email&&p.phone?' · ':'')+esc(p.phone||'')+'</div>'+
        '<div class="nums">'+(p.fittings||0)+' fittings · <b>'+money(p.totalIncGst)+'</b> inc GST</div>'+
      '</div>'+
      '<div class="acts">'+
        '<button class="btn pri" data-act="open">Open in planner</button>'+
        '<button class="btn" data-act="view">Details</button>'+
        '<button class="btn" data-act="gh">.ghlayout</button>'+
        '<button class="btn danger" data-act="del">Delete</button>'+
      '</div>';
    card.querySelector('[data-act=open]').onclick=function(){
      window.open('/layout-app/?load='+encodeURIComponent(p.id),'_blank');
    };
    card.querySelector('[data-act=view]').onclick=function(){openDetail(p);};
    var ghBtn=card.querySelector('[data-act=gh]');
    ghBtn.onclick=function(){
      if(ghBtn.disabled)return;
      var t=ghBtn.textContent;ghBtn.disabled=true;ghBtn.textContent='Preparing\u2026';
      downloadGh(p).then(
        function(){ghBtn.textContent=t;ghBtn.disabled=false;},
        function(){ghBtn.textContent=t;ghBtn.disabled=false;});
    };
    card.querySelector('[data-act=del]').onclick=function(){
      if(!window.confirm('Delete the submission from '+p.name+'? This cannot be undone.'))return;
      /* Optimistic: the card leaves the moment you confirm; the server call
         runs behind it. If it fails, the list reloads and the card returns. */
      card.style.transition='opacity .15s';card.style.opacity='0.35';
      card.querySelectorAll('button').forEach(function(x){x.disabled=true;});
      curPlans=curPlans.filter(function(x){return x.id!==p.id;});
      setTimeout(function(){
        if(card.parentNode)card.parentNode.removeChild(card);
        if(!curPlans.length&&!curDrafts.length)$('#empty').hidden=false;
      },160);
      api('/api/layouts?id='+encodeURIComponent(p.id),{method:'DELETE'})
        .catch(function(){window.alert('Delete failed \u2014 bringing it back.');load();});
    };
    list.appendChild(card);
  });
}

function draftCard(d){
  var card=document.createElement('div');card.className='card draft';
  card.innerHTML=
    '<div class="shot">'+(d.thumb?'<img src="'+d.thumb+'" alt="Plan preview">':'<span>No preview yet</span>')+'</div>'+
    '<div class="body">'+
      '<span class="badge wip">In progress</span>'+
      '<h3>'+esc(d.project||'Untitled plan')+'</h3>'+
      '<div class="meta">Last change '+esc(when(d.updatedAt))+'</div>'+
      '<div class="meta">No contact details yet \u2014 not sent</div>'+
      '<div class="nums">'+(d.fittings||0)+' light'+(d.fittings===1?'':'s')+' \u00b7 '+
        (d.rooms||0)+' room'+(d.rooms===1?'':'s')+'</div>'+
    '</div>'+
    '<div class="acts">'+
      '<button class="btn pri" data-act="open">Open in planner</button>'+
      '<button class="btn danger" data-act="del">Delete</button>'+
    '</div>';
  card.querySelector('[data-act=open]').onclick=function(){
    window.open('/layout-app/?draft='+encodeURIComponent(d.sid),'_blank');
  };
  card.querySelector('[data-act=del]').onclick=function(){
    if(!window.confirm('Delete this in-progress draft?'))return;
    card.style.transition='opacity .15s';card.style.opacity='0.35';
    card.querySelectorAll('button').forEach(function(x){x.disabled=true;});
    curDrafts=curDrafts.filter(function(x){return x.sid!==d.sid;});
    setTimeout(function(){
      if(card.parentNode)card.parentNode.removeChild(card);
      if(!curPlans.length&&!curDrafts.length)$('#empty').hidden=false;
    },160);
    api('/api/layouts?draft='+encodeURIComponent(d.sid),{method:'DELETE'})
      .catch(function(){window.alert('Delete failed \u2014 bringing it back.');load();});
  };
  return card;
}

function fullPlan(p){
  if(plansCache[p.id]) return Promise.resolve(plansCache[p.id]);
  return api('/api/layouts?id='+encodeURIComponent(p.id)).then(function(full){
    plansCache[p.id]=full;return full;
  });
}

function downloadGh(p){
  return fullPlan(p).then(function(full){
    if(!full.planData){window.alert('This submission has no editable plan attached.');return;}
    var name=(full.planData.name||p.project||'plan').replace(/[^\w\- ]+/g,'')||'plan';
    var blob=new Blob([JSON.stringify(full.planData)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download=name+'.ghlayout';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},4000);
  }).catch(function(){window.alert('Could not fetch that plan.');});
}

/* ---------- detail modal ---------- */
function openDetail(p){
  var box=$('#modal-box');
  box.innerHTML='<h2>'+esc(p.name)+' — '+esc(p.project||'Untitled plan')+'</h2>'+
    '<div class="meta" style="color:var(--mut)">Loading the full submission…</div>';
  $('#modal').classList.add('open');
  fullPlan(p).then(function(full){
    var c=full.customer||{}, s=full.schedule||{lines:[]};
    var rows=(s.lines||[]).map(function(l){
      return '<tr><td>'+esc(l.code)+'</td><td>'+esc(l.name)+'</td>'+
             '<td class="num">'+l.qty+'</td><td class="num">'+money(l.unitExGst)+'</td>'+
             '<td class="num">'+money(l.lineExGst)+'</td></tr>';
    }).join('');
    box.innerHTML=
      '<h2>'+esc(c.name)+' — '+esc((full.project&&full.project.name)||'Untitled plan')+'</h2>'+
      '<div style="color:var(--mut);font-size:12.5px">'+esc(when(full.submittedAt))+'</div>'+
      '<div class="grid">'+
        '<div><b>Email</b>'+esc(c.email||'—')+'</div>'+
        '<div><b>Phone</b>'+esc(c.phone||'—')+'</div>'+
        '<div><b>Suburb</b>'+esc(c.suburb||'—')+'</div>'+
        '<div><b>Job type</b>'+esc(c.jobType||'—')+'</div>'+
        (c.notes?'<div style="grid-column:1/-1"><b>Notes</b>'+esc(c.notes)+'</div>':'')+
      '</div>'+
      (full.planPng?'<img class="plan" src="'+full.planPng+'" alt="Marked-up plan">':'')+
      '<table><tr><th>Code</th><th>Product</th><th class="num">Qty</th>'+
        '<th class="num">Unit ex</th><th class="num">Line ex</th></tr>'+rows+
        '<tr><td colspan="4" class="num"><b>Total inc GST</b></td>'+
        '<td class="num"><b>'+money(s.totalIncGst)+'</b></td></tr></table>'+
      '<div class="acts">'+
        '<button class="btn pri" id="m-open">Open in planner</button>'+
        '<button class="btn" id="m-gh">Download .ghlayout</button>'+
        '<button class="btn" id="m-close">Close</button>'+
      '</div>';
    $('#m-open').onclick=function(){window.open('/layout-app/?load='+encodeURIComponent(p.id),'_blank');};
    $('#m-gh').onclick=function(){downloadGh(p);};
    $('#m-close').onclick=closeModal;
  }).catch(function(){
    box.innerHTML='<h2>Could not load</h2><p>That submission would not load. Try Refresh.</p>'+
      '<div class="acts"><button class="btn" id="m-close">Close</button></div>';
    $('#m-close').onclick=closeModal;
  });
}
function closeModal(){$('#modal').classList.remove('open');}
$('#modal').onclick=function(e){if(e.target===this)closeModal();};
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});

/* ---------- boot ---------- */
var saved=null;
try{saved=localStorage.getItem(KEY_LS);}catch(e){}
if(saved) tryEnter(saved);
}
