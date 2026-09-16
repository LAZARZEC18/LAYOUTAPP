/* Greenhse Layout Planner — home screen, guided tour and submission.
   Same code as before, as a module: ART is imported, and the boot became
   an exported mountHome() called after mountCore(). */
import { ART } from '../data/art';

/* ============================================================
   Greenhse Layout — home screen, guided tour, submission
   ============================================================ */
export function mountHome(){
"use strict";
var G=window.__GH, $=function(s){return document.querySelector(s);};

/* Where finished layouts get posted. On the Netlify deploy this is the
   submit-layout function (netlify/functions/submit-layout.mjs), which stores
   the plan in Netlify Blobs for the team to review in layout-admin.html.
   If the endpoint is unreachable (npm run dev / preview have no functions)
   the app falls back to "download it and email it in". */
var SUBMIT_ENDPOINT="/api/submit-layout";

/* ---------- geometry of the tutorial room render ---------- */
var IMG={w:919,h:663};
var ROOM={x:16,y:16,w:887,h:631};   /* 3.5 x 2.5 m at 253 px/m */
var PXM=253;                          /* the render is a 3.5 x 2.5 m bedroom */
var ROOM_M={w:3.5,h:2.5};
var CEIL=2.7;

/* ---------- the two rules the exercises teach ---------- */
function spacingVerdict(m){ return m<1.5?'close' : 'ok'; }   /* no upper limit - further apart is a choice, not a fault */
function wallVerdict(mm){ return mm<650?'close' : mm>750?'far' : 'ok'; }
function distM(a,b){ return Math.hypot(a.x-b.x,a.y-b.y)/PXM; }
function wallMM(p){
  var d=Math.min(p.x-ROOM.x, ROOM.x+ROOM.w-p.x, p.y-ROOM.y, ROOM.y+ROOM.h-p.y);
  return Math.round(d/PXM*1000);
}
function clampRoom(p){
  return {x:Math.min(Math.max(p.x,ROOM.x+6),ROOM.x+ROOM.w-6),
          y:Math.min(Math.max(p.y,ROOM.y+6),ROOM.y+ROOM.h-6)};
}

var STEPS=['welcome','place','spacing','walls','beam','done'];
/* recorded as the markup is parsed, before anything can navigate away */
var HOME_DEFAULT=!!(document.getElementById('home')&&
                    document.getElementById('home').classList.contains('on'));
var T={i:0,lights:[],pair:null,one:null,shown:null,beam:60,beamPid:null,
       drag:null,active:null};

/* ---------- shared room stage ---------- */
function stage(mode){
  return '<div class="tut-stage'+(mode==='place'?' click':'')+'" id="stage">'+
    '<img src="'+ART.room+'" alt="Top-down plan of a 3.5 × 2.5 m bedroom">'+
    '<svg class="ov2" id="ov2" viewBox="0 0 '+IMG.w+' '+IMG.h+'" preserveAspectRatio="none"></svg>'+
    '<div class="stage-note" id="stagenote"></div></div>';
}
/* The pool is measured at FLOOR level, not bench height - this view is a plan
   of the floor, so it should show what actually lands on it. Full ceiling drop
   means a wider, softer pool, which is the honest picture. */
function floorPoolPx(){
  var beam=(T.shown==='std'?100:60);
  var d=2*CEIL*Math.tan(beam/2*Math.PI/180);
  return d/2*PXM;
}
function svgLight(p,i,extra){
  var pool=floorPoolPx();
  /* The gradient runs to the full cone edge, but the dashed ring marks the
     useful pool - the part still doing work by the time it reaches the floor.
     Drawing the cone edge as a hard line makes every plan look like one wash. */
  return '<circle class="tl-edge" cx="'+p.x+'" cy="'+p.y+'" r="'+(pool*0.62).toFixed(0)+'"/>'+
         '<circle class="tl-body" cx="'+p.x+'" cy="'+p.y+'" r="11"/>'+
         '<circle class="tl-dot" cx="'+p.x+'" cy="'+p.y+'" r="4.5"/>'+
         (extra||'')+
         '<circle class="tl-hit" data-i="'+i+'" cx="'+p.x+'" cy="'+p.y+'" r="34"/>';
}
/* Two gradients. One warms the floor where light lands; the other cuts the
   hole in the dark scrim so the room underneath is revealed. Light fades out;
   it doesn't stop, so both run to fully transparent at the edge. */
var TL_DEFS='<defs>'+
  '<radialGradient id="tlgrad" cx="50%" cy="50%" r="50%">'+
    '<stop offset="0%" stop-color="#FFC46B" stop-opacity="0.55"/>'+
    '<stop offset="38%" stop-color="#FFB44F" stop-opacity="0.30"/>'+
    '<stop offset="70%" stop-color="#E8A33D" stop-opacity="0.10"/>'+
    '<stop offset="100%" stop-color="#E8A33D" stop-opacity="0"/>'+
  '</radialGradient>'+
  '<radialGradient id="tlhole" cx="50%" cy="50%" r="50%">'+
    '<stop offset="0%" stop-color="#000" stop-opacity="1"/>'+
    '<stop offset="45%" stop-color="#000" stop-opacity="0.86"/>'+
    '<stop offset="78%" stop-color="#000" stop-opacity="0.34"/>'+
    '<stop offset="100%" stop-color="#000" stop-opacity="0"/>'+
  '</radialGradient>'+
  '</defs>';

/* The unlit room. Dark enough to read as "lights off" without hiding the
   furniture completely - you still need to see what you are lighting. */
var DARK_FILL='#0E1626', DARK_OPACITY=0.80;
function paintLights(list,extra){
  T.active=list;
  var pool=floorPoolPx();

  /* Mask: white keeps the scrim, the black holes let the room show through.
     One hole per fitting, soft-edged, so light falls off rather than stopping. */
  var mask='<mask id="tlmask" maskUnits="userSpaceOnUse" x="0" y="0" width="'+IMG.w+'" height="'+IMG.h+'">'+
    '<rect x="0" y="0" width="'+IMG.w+'" height="'+IMG.h+'" fill="#fff"/>';
  list.forEach(function(p){
    mask+='<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(pool*1.06).toFixed(0)+'" fill="url(#tlhole)"/>';
  });
  mask+='</mask>';

  var scrim='<rect x="'+ROOM.x+'" y="'+ROOM.y+'" width="'+ROOM.w+'" height="'+ROOM.h+'" '+
            'fill="'+DARK_FILL+'" opacity="'+DARK_OPACITY+'" mask="url(#tlmask)"/>';

  /* Warm wash on top of the reveal, so a lit floor looks lit rather than
     merely un-dimmed. Clipped to the room so it never spills onto the margin. */
  var clip='<clipPath id="tlroom"><rect x="'+ROOM.x+'" y="'+ROOM.y+'" width="'+ROOM.w+'" height="'+ROOM.h+'"/></clipPath>';
  var warm='<g clip-path="url(#tlroom)">';
  list.forEach(function(p){
    warm+='<circle cx="'+p.x+'" cy="'+p.y+'" r="'+pool.toFixed(0)+'" fill="url(#tlgrad)"/>';
  });
  warm+='</g>';

  var marks='';
  list.forEach(function(p,i){ marks+=svgLight(p,i); });

  $('#ov2').innerHTML=TL_DEFS+clip+mask+scrim+warm+(extra||'')+marks;
  bindDrag();
}
function bindDrag(){
  var ov=$('#ov2'); if(!ov) return;
  ov.querySelectorAll('.tl-hit').forEach(function(h){
    h.addEventListener('pointerdown',function(e){
      e.stopPropagation(); T.drag=+h.dataset.i; h.setPointerCapture(e.pointerId);
    });
  });
  ov.onpointermove=function(e){
    if(T.drag==null||!T.active) return;
    var pt=clampRoom(toStage(e));
    /* On the spacing exercise, pull the gap onto the nearest good value once
       you're within about 8 cm. It stops the lesson turning into a test of
       mouse precision. */
    if(T.snapBand && T.active.length===2){
      var other=T.active[T.drag===0?1:0];
      var dx=pt.x-other.x, dy=pt.y-other.y;
      var dist=Math.hypot(dx,dy), m=dist/PXM;
      /* One target now: the 1.5 m minimum. Above that anything goes, so there
         is nothing to snap to. */
      var target=null;
      if(m>1.42 && m<1.58) target=1.50;
      if(target && dist>0){
        var k=(target*PXM)/dist;
        pt={x:other.x+dx*k, y:other.y+dy*k};
        pt=clampRoom(pt);
      }
    }
    T.active[T.drag]=pt;
    render();
  };
  ov.onpointerup=function(){T.drag=null;};
  ov.onpointercancel=function(){T.drag=null;};
}
function toStage(e){
  var r=$('#ov2').getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*IMG.w, y:(e.clientY-r.top)/r.height*IMG.h};
}
function verdict(kind,head,body){
  return '<div class="verdict '+(kind==='ok'?'ok':kind===''?'':'bad')+'">'+
    '<span class="ic">'+(kind==='ok'?'✓':'!')+'</span><span><b>'+head+'</b>'+body+'</span></div>';
}

/* ---------- steps ---------- */
function render(){
  var id=STEPS[T.i], g=$('#tut-grid');
  $('#tut-n').textContent=T.i+1;
  $('#tut-of').textContent=STEPS.length;
  $('#ticks').innerHTML=STEPS.map(function(_,k){
    return '<i class="'+(k<T.i?'on':k===T.i?'now':'')+'"></i>';
  }).join('');
  $('#tut-back').style.visibility=T.i?'visible':'hidden';
  $('#tut-next').textContent=T.i===STEPS.length-1?'Start my project →':'Next →';
  $('#tut-count').innerHTML=(T.i>0&&T.i<4)
    ? 'Lights placed <b>'+T.lights.length+'</b>'+
      (T.i===1?' — this room wants '+needed('std')+' standard or '+needed('lg')+' low glare':'')
    : '';

  g.classList.toggle('intro', id==='welcome');
  g.classList.toggle('wide', id==='done');
  if(id==='welcome') return welcome(g);
  if(id==='place')   return place(g);
  if(id==='spacing') return spacing(g);
  if(id==='walls')   return walls(g);
  if(id==='beam')    return beamStep(g);
  return done(g);
}

/* The tour room is a BEDROOM, so it teaches what the planner will actually
   do in one: the bedroom house rule's four standard downlights, and six low
   glare for the coverage comparison the illustrations were drawn around -
   not the generic size table, which sits lower for a room this size. */
function needed(klass){ return klass==='lg'?6:4; }
/* lay the correct number out properly, rather than telling people to guess */
function idealLayout(klass){
  var n=needed(klass);
  var sp=G.spacingFor(CEIL, klass==='lg'?60:100);
  var off=G.wallOffsetFor(sp);
  return G.gridInRoom(ROOM_M.w,ROOM_M.h,n,off).map(function(p){
    return {x:ROOM.x+p.x*PXM, y:ROOM.y+p.y*PXM};
  });
}

function welcome(g){
  g.innerHTML=
   '<div class="tut-copy"><div class="kicker">Before you start</div>'+
   '<h2>Four rules, then you can lay out a house.</h2>'+
   '<p>Most bad lighting is not bad taste. It is lights in the wrong spot. '+
   'One minute, and then the app does it all for you.</p>'+
   '<div class="checklist">'+
     row('Where to place them','Enough light for what you do in the room.')+
     row('How far apart','No bright patches, no dark corners.')+
     row('How far off the walls','Lights the walls, so the room feels bigger.')+
     row('Which beam angle','Wide to light a room. Narrow for comfort.')+
   '</div></div>'+
   '<div class="tut-stage"><img src="'+ART.planStd+'" alt="Plan of a 3.5 by 2.5 metre bedroom with four standard downlights">'+
   '<div class="stage-note">What good looks like</div></div>';
}
function row(h,p){return '<div><span class="tick">✓</span><span><h4>'+h+'</h4><p>'+p+'</p></span></div>';}

function place(g){
  T.snapBand=false;
  var std=needed('std'), lg=needed('lg');
  var shown=T.shown||null;
  g.innerHTML=
   '<div class="tut-copy"><div class="kicker">Rule 01</div>'+
   '<h2>How many, and where.</h2>'+
   '<p>This is a <b>'+ROOM_M.w.toFixed(1)+' × '+ROOM_M.h.toFixed(1)+' m</b> bedroom. '+
   'Greenhse works the count off the room size and the type of fitting — a wide standard downlight '+
   'covers more floor than a tight low glare one, so it needs fewer of them.</p>'+
   '<div class="beampicks" style="margin-bottom:14px">'+
     layoutBtn('std','Standard · 100°',std,'Wide spread. Fewer fittings cover the same floor.')+
     layoutBtn('lg','Low glare · 60°',lg,'Tighter beam, so two more to keep the floor even.')+
   '</div>'+
   '<div class="rule"><div class="k">Try it yourself</div><div class="v">Click the floor</div>'+
   '<div class="s">Place your own and see how close you get. The buttons above lay out the correct answer.</div></div>'+
   '<div id="v1"></div></div>'+ stage('place');
  $('#stage').addEventListener('pointerdown',function(e){
    if(e.target.classList.contains('tl-hit')) return;
    if(T.lights.length>=12) return;
    T.shown=null;
    T.lights.push(clampRoom(toStage(e)));
    render();
  });
  g.querySelectorAll('[data-layout]').forEach(function(b){
    b.onclick=function(){
      T.shown=b.dataset.layout;
      T.lights=idealLayout(T.shown);
      render();
    };
  });
  paintLights(T.lights);
  $('#stagenote').textContent= shown
    ? (shown==='lg'?lg+' low glare':std+' standard')+' — the correct layout'
    : (T.lights.length? T.lights.length+' placed' : 'Click the floor to place a light');
  $('#v1').innerHTML= shown
    ? verdict('ok','That is the layout.','Evenly spread, and every fitting kept 650–750 mm off the walls so they wash the wall too.')
    : (T.lights.length
        ? verdict('','You have placed '+T.lights.length+'.','A room this size wants '+std+' standard or '+lg+' low glare. Tap a button above to see where they go.')
        : '');
}
function layoutBtn(k,label,n,sub){
  return '<button type="button" class="beampick'+(T.shown===k?' on':'')+'" data-layout="'+k+'" '+
    'style="grid-template-columns:44px 1fr">'+
    '<span class="lay-n">'+n+'</span>'+
    '<span><span class="bp-tag">'+label+'</span>'+
    '<span class="bp-name">'+n+' downlights</span>'+
    '<span class="bp-spec">'+sub+'</span></span></button>';
}

function spacing(g){
  if(!T.pair){
    /* Start them close but not silly, and on the same line, so the only thing
       to work out is the gap. Dragging used to start from a near-random spot. */
    var cy=ROOM.y+ROOM.h*0.46;
    var start=ROOM.x+ROOM.w*0.26;
    T.pair=[{x:start,y:cy},{x:start+0.95*PXM,y:cy}];
  }
  /* Snap to 1.5 m once you're within ~8 cm, so nobody has to fight
     pixel-perfect dragging to get the green tick. */
  T.snapBand=true;
  var a=T.pair[0], b=T.pair[1], d=distM(a,b), v=spacingVerdict(d);
  g.innerHTML=
   '<div class="tut-copy"><div class="kicker">Rule 02</div>'+
   '<h2>Keep the spacing consistent.</h2>'+
   '<p><b>Drag either light sideways.</b> Watch the number between them \u2014 it turns green once you are far enough apart. It snaps once you are close, so you do not have to be exact.</p>'+
   '<div class="rule"><div class="k">Minimum spacing</div><div class="v">1.5 m +</div>'+
   '<div class="s">Keep them at least 1.5 m apart. There is no upper limit \u2014 spreading them out '+
   'costs you nothing but a few darker patches, while crowding them wastes fittings and gives you '+
   'a hot strip down the middle.</div></div>'+
   '<div class="legend"><span><i class="dot g"></i>Green — even light across the floor</span>'+
   '<span><i class="dot r"></i>Red — bright patches or dark gaps</span></div>'+
   '<div id="v1"></div></div>'+ stage('drag');
  var link='<line class="tl-link '+(v==='ok'?'ok':'bad')+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>'+
    '<text class="tl-tag" x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2-22)+'" text-anchor="middle">'+d.toFixed(2)+' m</text>';
  paintLights(T.pair,link);
  $('#stagenote').textContent='\u2190 Drag either light sideways \u2192';
  $('#v1').innerHTML=v==='ok'
    ? verdict('ok','That works.','At '+d.toFixed(2)+' m they are far enough apart to each do their own job.')
    : verdict('bad','Too close together.',
        v==='close'?'You get a hot strip down the middle and dark edges — and you pay for fittings you did not need.'
                   :'The pools stop overlapping, so you get scallops of light with shadow between them.');
}

function walls(g){
  T.snapBand=false;
  if(!T.one) T.one=[{x:ROOM.x+ROOM.w-48,y:ROOM.y+ROOM.h*0.45}];
  var p=T.one[0], mm=wallMM(p), v=wallVerdict(mm);
  g.innerHTML=
   '<div class="tut-copy"><div class="kicker">Rule 03</div>'+
   '<h2>Light the walls, not just the floor.</h2>'+
   '<p><b>Lit walls make a room feel bright.</b> You see much more wall than floor, so light on '+
   'the walls does more than light on the carpet.</p>'+
   '<div class="rule"><div class="k">Recommended</div><div class="v">650 – 750 mm</div>'+
   '<div class="s">Wall to the middle of the hole. In that range the light hits the wall '+
   '<em>and</em> the floor, so the room gets brighter without adding a light. '+
   'The app does this for you.</div></div>'+
   '<div class="legend"><span><i class="dot r"></i>Under 650 mm — streaks on the wall</span>'+
   '<span><i class="dot g"></i>650–750 mm — wall and floor both lit</span>'+
   '<span><i class="dot a"></i>Over 750 mm — dark walls, room feels smaller</span></div>'+
   '<div id="v1"></div></div>'+ stage('drag');
  /* One dimension line, wall to fitting. The old version drew a dashed
     rectangle inset from all four walls, which read as a big empty box in the
     middle of the room rather than as a measurement. */
  var dL=p.x-ROOM.x, dR=ROOM.x+ROOM.w-p.x, dT=p.y-ROOM.y, dB=ROOM.y+ROOM.h-p.y;
  var near=Math.min(dL,dR,dT,dB), ax, ay, horiz;
  if(near===dL){ ax=ROOM.x; ay=p.y; horiz=true; }
  else if(near===dR){ ax=ROOM.x+ROOM.w; ay=p.y; horiz=true; }
  else if(near===dT){ ax=p.x; ay=ROOM.y; horiz=false; }
  else { ax=p.x; ay=ROOM.y+ROOM.h; horiz=false; }
  var wcol = v==='ok' ? '#57C08A' : v==='close' ? '#E0644A' : '#E5A93B';
  var tk=11;
  var guide=
    '<line class="tl-dim" x1="'+ax+'" y1="'+ay+'" x2="'+p.x+'" y2="'+p.y+'" stroke="'+wcol+'"/>'+
    (horiz
      ? '<line class="tl-dim" x1="'+ax+'" y1="'+(ay-tk)+'" x2="'+ax+'" y2="'+(ay+tk)+'" stroke="'+wcol+'"/>'
      : '<line class="tl-dim" x1="'+(ax-tk)+'" y1="'+ay+'" x2="'+(ax+tk)+'" y2="'+ay+'" stroke="'+wcol+'"/>')+
    /* label always sits on the room side of the fitting, so a light tight
       against a wall never pushes the number off the edge of the plan */
    (near===dL ? '<text class="tl-tag" x="'+(p.x+20)+'" y="'+(p.y+9)+'" text-anchor="start">'+mm+' mm</text>'
     :near===dR ? '<text class="tl-tag" x="'+(p.x-20)+'" y="'+(p.y+9)+'" text-anchor="end">'+mm+' mm</text>'
     :near===dT ? '<text class="tl-tag" x="'+p.x+'" y="'+(p.y+40)+'" text-anchor="middle">'+mm+' mm</text>'
     :            '<text class="tl-tag" x="'+p.x+'" y="'+(p.y-26)+'" text-anchor="middle">'+mm+' mm</text>');
  paintLights(T.one,guide);
  $('#stagenote').textContent='Drag the light';
  $('#v1').innerHTML=v==='ok'
    ? verdict('ok','That is the band.','At '+mm+' mm the light covers the wall and the floor. That is what makes a room feel bright.')
    : verdict('bad',v==='close'?'Too close to the wall.':'Too far off the wall.',
        v==='close'?'At '+mm+' mm the light clips the wall and streaks down it.'
                   :'At '+mm+' mm the wall goes dark. Dark walls are the main reason a room feels dim.');
}

/* Three real fittings from the Greenhse range, so the lesson is about
   choosing a product rather than an abstract number. */
var BEAM_PICKS=[
  {id:'DL9ES-FLAT-HL', tag:'Wide \u2014 general light',
   use:'<b>Wide for general lighting and fewer shadows.</b> Sits flush with the ceiling and throws a broad wash that reaches the walls, so the room reads bright and nothing casts a hard shadow. Fewer fittings cover the same floor. This is the planner\u2019s default.',
   watch:'The spread that fills the room also reaches your eyes. In a lounge you sit in at night, you will see the LED itself.'},
  {id:'DL10-PS', tag:'Narrow \u2014 low glare',
   use:'<b>Narrow for less glare and added comfort.</b> The LED is recessed up inside the fitting, so you see light on the floor and never the source. The ceiling stays dark and calm \u2014 the difference you feel in a bedroom or lounge.',
   watch:'A 60\u00b0 beam covers less floor, so they sit closer together and you need more of them. The planner re-counts automatically when you pick one.'},
  {id:'DL10GS-IP65', tag:'Gimbal \u2014 aimed',
   use:'The centre tilts, so you can throw the beam down a whole wall from top to floor. That wall of light is the cheapest way to make a room feel bigger and brighter \u2014 far more effective than another fitting in the middle of the ceiling.',
   watch:'Aimable fittings are for a job. A ceiling full of them pointing in different directions looks restless.'}
];


function beamDiagram(sel){
  /* Section through the room. The cone now runs to the floor and fades on the
     way down, because light does not stop at bench height - and a person stands
     in it, because "you will see the LED" means nothing until you see it. */
  var PX=78, H=CEIL, wp=0.75;
  var W=820, band=58, top=band+8, floorY=top+H*PX, benchY=floorY-wp*PX, cx=W/2;

  /* Where the person stands. Chosen so a 60 deg beam clips him mid-body while a
     wide one washes straight over his eyes - the whole point of the step. */
  var PERSON_X_M=1.40, PERSON_H=1.70, EYE_H=1.55;
  var px=cx+PERSON_X_M*PX, feetY=floorY, headTop=floorY-PERSON_H*PX, eyeY=floorY-EYE_H*PX;

  function halfWidth(beam,dropM){ return Math.tan(Math.min(beam,170)/2*Math.PI/180)*dropM*PX; }

  var beam=G.parseBeam(sel.p.beam)||60;
  if(sel.id==='DL9ES-FLAT-HL') beam=120;  /* diagram only: draw the wide fitting at 120deg; spec + calcs stay 100 */
  var hwFloor=halfWidth(beam,H), hwBench=halfWidth(beam,H-wp), hwEye=halfWidth(beam,H-EYE_H);
  var glare=hwEye>PERSON_X_M*PX;      /* is his face inside the beam? */

  var s='<svg viewBox="0 0 '+W+' '+(floorY+92)+'" xmlns="http://www.w3.org/2000/svg" class="beamsvg">';
  s+='<defs><linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">'+
     '<stop offset="0%" stop-color="#FFD98A" stop-opacity=".80"/>'+
     '<stop offset="42%" stop-color="#FFD07A" stop-opacity=".42"/>'+
     '<stop offset="72%" stop-color="#F6C26A" stop-opacity=".20"/>'+
     '<stop offset="100%" stop-color="#EDB65C" stop-opacity=".05"/></linearGradient></defs>';

  /* ceiling and floor */
  s+='<rect x="0" y="'+(top-band)+'" width="'+W+'" height="'+band+'" fill="#E4E0D2"/>';
  s+='<line x1="0" y1="'+top+'" x2="'+W+'" y2="'+top+'" stroke="#15170F" stroke-width="2.5"/>';
  s+='<line x1="0" y1="'+floorY+'" x2="'+W+'" y2="'+floorY+'" stroke="#15170F" stroke-width="2.5"/>';
  s+='<rect x="0" y="'+floorY+'" width="'+W+'" height="26" fill="#E4E0D2"/>';

  /* the other two fittings, dashed, so the difference reads at a glance */
  BEAM_PICKS.forEach(function(b){
    if(b.id===sel.id) return;
    var p=G.byId(b.id), ob=G.parseBeam(p.beam); if(!ob) return;
    var ow=halfWidth(ob,H);
    s+='<polygon points="'+cx+','+top+' '+(cx-ow)+','+floorY+' '+(cx+ow)+','+floorY+'" '+
       'fill="none" stroke="#8C8C7E" stroke-width="1.5" stroke-dasharray="5 5" opacity=".65"/>';
  });

  /* the selected beam, all the way down */
  s+='<polygon points="'+cx+','+top+' '+(cx-hwFloor)+','+floorY+' '+(cx+hwFloor)+','+floorY+'" fill="url(#cone)"/>';
  s+='<line x1="'+cx+'" y1="'+top+'" x2="'+(cx-hwFloor)+'" y2="'+floorY+'" stroke="#C99A3E" stroke-width="1.6" opacity=".8"/>';
  s+='<line x1="'+cx+'" y1="'+top+'" x2="'+(cx+hwFloor)+'" y2="'+floorY+'" stroke="#C99A3E" stroke-width="1.6" opacity=".8"/>';

  /* bench height, still the number the count table is built on */
  s+='<line x1="40" y1="'+benchY+'" x2="'+(W-40)+'" y2="'+benchY+'" stroke="#8C8C7E" stroke-width="1.3" stroke-dasharray="7 6"/>';
  s+='<text x="46" y="'+(benchY-10)+'" class="bd-min bd-halo">BENCH HEIGHT 0.75 m</text>';
  s+='<line x1="'+(cx-hwBench)+'" y1="'+benchY+'" x2="'+(cx+hwBench)+'" y2="'+benchY+'" stroke="#15170F" stroke-width="3.5"/>';

  /* ---- the person ---- */
  var SK=glare?'#B4462F':'#2F6E46', headR=13;
  s+='<g class="bd-person">';
  s+='<line x1="'+px+'" y1="'+(headTop+headR*2)+'" x2="'+px+'" y2="'+(feetY-30)+'" stroke="'+SK+'" stroke-width="7" stroke-linecap="round"/>';
  s+='<line x1="'+px+'" y1="'+(feetY-30)+'" x2="'+(px-11)+'" y2="'+feetY+'" stroke="'+SK+'" stroke-width="6" stroke-linecap="round"/>';
  s+='<line x1="'+px+'" y1="'+(feetY-30)+'" x2="'+(px+11)+'" y2="'+feetY+'" stroke="'+SK+'" stroke-width="6" stroke-linecap="round"/>';
  s+='<line x1="'+px+'" y1="'+(headTop+headR*2+16)+'" x2="'+(px-16)+'" y2="'+(headTop+headR*2+46)+'" stroke="'+SK+'" stroke-width="5.5" stroke-linecap="round"/>';
  s+='<line x1="'+px+'" y1="'+(headTop+headR*2+16)+'" x2="'+(px+16)+'" y2="'+(headTop+headR*2+46)+'" stroke="'+SK+'" stroke-width="5.5" stroke-linecap="round"/>';
  s+='<circle cx="'+px+'" cy="'+(headTop+headR)+'" r="'+headR+'" fill="#FFF6E2" stroke="'+SK+'" stroke-width="2.6"/>';
  s+='<circle cx="'+(px-4.5)+'" cy="'+(headTop+headR-3)+'" r="1.7" fill="'+SK+'"/>';
  s+='<circle cx="'+(px+4.5)+'" cy="'+(headTop+headR-3)+'" r="1.7" fill="'+SK+'"/>';
  s+= glare
    ? '<path d="M'+(px-5)+' '+(headTop+headR+6)+' q5 -5 10 0" fill="none" stroke="'+SK+'" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M'+(px-5)+' '+(headTop+headR+3)+' q5 6 10 0" fill="none" stroke="'+SK+'" stroke-width="2" stroke-linecap="round"/>';
  s+='</g>';

  /* eye line, and what the beam is doing at it */
  s+='<line x1="'+(px-46)+'" y1="'+eyeY+'" x2="'+(px+62)+'" y2="'+eyeY+'" stroke="'+SK+'" stroke-width="1.1" stroke-dasharray="4 4" opacity=".85"/>';
  s+='<text x="'+(px+68)+'" y="'+(eyeY+4)+'" class="bd-min" fill="'+SK+'">'+
     (glare?'GLARE — BEAM REACHES HIS EYES':'NO GLARE — BEAM STOPS BELOW HIS EYES')+'</text>';

  /* the fitting itself */
  if(sel.p.img){
    s+='<rect x="'+(cx-25)+'" y="'+(top-band+5)+'" width="50" height="50" fill="#fff" stroke="#15170F" stroke-width="1.5"/>';
    s+='<image href="'+sel.p.img+'" x="'+(cx-24)+'" y="'+(top-band+6)+'" width="48" height="48" preserveAspectRatio="xMidYMid meet"/>';
  }
  s+='<circle cx="'+cx+'" cy="'+top+'" r="7" fill="#15170F"/>';

  /* dimension across the bench pool */
  s+='<line x1="'+(cx-hwBench)+'" y1="'+(floorY+44)+'" x2="'+(cx+hwBench)+'" y2="'+(floorY+44)+'" stroke="#15170F" stroke-width="1.5"/>';
  s+='<line x1="'+(cx-hwBench)+'" y1="'+(floorY+37)+'" x2="'+(cx-hwBench)+'" y2="'+(floorY+51)+'" stroke="#15170F" stroke-width="1.5"/>';
  s+='<line x1="'+(cx+hwBench)+'" y1="'+(floorY+37)+'" x2="'+(cx+hwBench)+'" y2="'+(floorY+51)+'" stroke="#15170F" stroke-width="1.5"/>';
  s+='<text x="'+cx+'" y="'+(floorY+72)+'" text-anchor="middle" class="bd-dim">'+
     G.poolDiameter(CEIL,beam).toFixed(1)+' m of light at bench height</text>';
  s+='<text x="'+(W-46)+'" y="'+(top-band/2+4)+'" text-anchor="end" class="bd-min">CEILING '+CEIL.toFixed(2)+' m</text>';
  s+='<text x="'+(cx+14)+'" y="'+(top+30)+'" class="bd-dim">'+beam+'°</text>';
  s+='</svg>';
  return s;
}

function beamStep(g){
  if(!T.beamPid) T.beamPid=BEAM_PICKS[1].id;
  var picks=BEAM_PICKS.map(function(b){
    var p=G.byId(b.id);
    return {id:b.id,p:p,tag:b.tag,use:b.use,watch:b.watch,
            beam:G.parseBeam(p.beam),lm:G.parseLumens(p.lumens)};
  });
  var sel=picks.filter(function(b){return b.id===T.beamPid;})[0]||picks[1];
  g.innerHTML=
   '<div class="tut-copy"><div class="kicker">Rule 04</div>'+
   '<h2>Pick the fitting for the job.</h2>'+
   '<p>Three downlights from our own range. Same ceiling, very different result — tap each one. '+
   'The wide standard and the 60° low glare are the two the count table is built around.</p>'+
   '<div class="beampicks">'+picks.map(function(b){
     return '<button type="button" class="beampick'+(b.id===sel.id?' on':'')+'" data-beamp="'+b.id+'">'+
       (b.p.img?'<img src="'+b.p.img+'" alt="">':'<span class="noimg"></span>')+
       '<span><span class="bp-tag">'+b.tag+'</span>'+
       '<span class="bp-name">'+b.p.name+'</span>'+
       '<span class="bp-spec">'+b.p.id+' · '+b.beam+'° · '+(b.lm?b.lm+' lm':'lm n/a')+' · '+G.money(b.p.price)+'</span></span></button>';
   }).join('')+'</div>'+
   '<div class="rule"><div class="k">'+sel.tag+' at a '+CEIL.toFixed(2)+' m ceiling</div>'+
   '<div class="v">'+G.poolDiameter(CEIL,sel.beam).toFixed(1)+' m pool</div>'+
   '<div class="s">'+sel.use+'</div></div>'+
   '<div class="verdict"><span class="ic">!</span><span><b>Worth knowing</b>'+sel.watch+'</span></div>'+
   '</div>'+
   '<div class="tut-stage beamstage">'+beamDiagram(sel)+
   '<div class="stage-note">Section through the room · dashed outlines are the other two</div></div>';
  g.querySelectorAll('[data-beamp]').forEach(function(b){
    b.onclick=function(){T.beamPid=b.dataset.beamp;render();};
  });
}

function done(g){
  var tiles=[
    {img:ART.mood1, t:'Even grid, walls included',
     s:'Downlights on a consistent grid, spaced to the ceiling height. Nothing dramatic — the room is simply, evenly lit.'},
    {img:ART.mood2, t:'Off the walls',
     s:'Kept 650–750 mm clear, so the beam washes the wall as well as the floor.'},
    {img:ART.mood3, t:'Aimed down a wall',
     s:'A gimbal tilted to light a wall top to floor. One lit wall beats another light on the carpet.'},
    {img:ART.mood4, t:'Low glare where you sit',
     s:'Recessed 60° fittings in a living space. You see the light, not the LED — and the view stays the view.'}
  ];
  g.innerHTML=
   '<div class="tut-copy" style="grid-column:1 / -1;max-width:1000px;margin:0 auto">'+
   '<div class="kicker">Done</div>'+
   '<h2>That is the whole trick.</h2>'+
   '<p>Four rules: how many, how far apart, how far off the walls, and which light. '+
   'The app does all four on your plan. Now you know when to change it.</p>'+
   '<div class="checklist" style="margin-bottom:26px">'+
     row('Enough fittings','Based on room size and the light you picked.')+
     row('1.5 m or more apart','Closer than that and you are paying for fittings you do not need.')+
     row('650 – 750 mm off the walls','Close enough to light the walls.')+
     row('The right downlight','Wide to light a room, narrow where you sit, gimbal to aim.')+
   '</div>'+
   '<div class="planpair">'+'<figure class="plantile"><img src="'+ART.planStd+'" alt="3.5 by 2.5 metre bedroom with four standard downlights">'+'<figcaption><b>Four standard downlights</b><span>Wide 100° beams overlap into one even wash. 1.75 m apart the long way, 1.20 m across.</span></figcaption></figure>'+'<figure class="plantile"><img src="'+ART.planFan+'" alt="The same bedroom with a ceiling fan and four low glare downlights">'+'<figcaption><b>Fan plus low glare</b><span>A fan forces 60° fittings. The pools tighten, and at blade height the beam clears the blade circle instead of strobing through it.</span></figcaption></figure>'+'</div>'+'<div class="moodgrid">'+tiles.map(function(m){
     return '<figure class="moodtile"><img src="'+m.img+'" alt="'+m.t+'">'+
            '<figcaption><b>'+m.t+'</b><span>'+m.s+'</span></figcaption></figure>';
   }).join('')+'</div>'+
   '<p class="moodfoot">Every downlight in the planner is a real Greenhse fitting, priced and specced '+
   'from our catalogue. Load your plan and start dropping them in.</p>'+
   '</div>';
}

/* ---------- navigation ---------- */
function go(n){
  T.i=Math.min(Math.max(n,0),STEPS.length-1);
  render();
  $('.tut-body').scrollTop=0;
}
function openTut(){ $('#home').classList.remove('on'); $('#tut').classList.add('on'); go(0); }
function openPlanner(){
  $('#home').classList.remove('on'); $('#tut').classList.remove('on');
  if(G.fit) G.fit();
}

/* ---------- submission ---------- */
function submissionPayload(form){
  var lines=G.bomLines(), tot=G.bomTotals(lines), S=G.S;
  return {
    submittedAt:new Date().toISOString(),
    customer:{name:form.name,email:form.email,phone:form.phone,suburb:form.suburb,
              jobType:form.jobType,notes:form.notes},
    project:{name:form.project, ceilingHeight:S.ceiling,
             scalePxPerM:S.mpp?+(1/S.mpp).toFixed(2):null,
             planFileName:S.plan.name||null,
             rooms:S.rooms.map(function(r){
               return {type:r.type,areaM2:S.mpp?+((r.w*S.mpp)*(r.h*S.mpp)).toFixed(2):null};
             })},
    schedule:{lines:lines.map(function(l){
                return {code:l.sku,name:l.name,qty:l.qty,unitExGst:l.unit,lineExGst:l.line};
              }),
              fittings:tot.units, totalExGst:tot.ex, totalIncGst:tot.inc},
    planPng:null,
    /* The exact object the Save button writes to a .ghlayout file, so the
       submission can be reopened AND edited on our side before install. */
    planData:{v:1,name:form.project,plan:S.plan,mpp:S.mpp,ceiling:S.ceiling,
              fixtures:S.fixtures,rooms:S.rooms,seq:S.seq}
  };
}
function openSend(){
  if(!G.S.fixtures.length){ return alert('Place some fittings before sending the layout.'); }
  $('#s-status').innerHTML='';
  $('#sendmodal').classList.add('open');
}
function doSend(){
  var f={name:$('#s-name').value.trim(),email:$('#s-email').value.trim(),
         phone:$('#s-phone').value.trim(),suburb:$('#s-suburb').value.trim(),
         jobType:$('#s-type').value,notes:$('#s-notes').value.trim(),
         project:$('#projname').value};
  if(!f.name||!(f.email||f.phone)){
    $('#s-status').innerHTML='<div class="teach warn"><h5>Missing details</h5>We need a name and either an email or a phone number.</div>';
    return;
  }
  $('#s-status').innerHTML='<div class="teach">Packaging the plan…</div>';
  G.composePNG(function(png){
    /* Shrink what travels. The composed plan at print scale can run tens of
       megabytes as a data URL and the endpoint accepts ~6 MB; the copy on
       the customer's screen is untouched. */
    shrinkImage(png,1600,0.82,function(smallPng){
    shrinkImage(png,360,0.6,function(thumb){
      var payload=submissionPayload(f);
      payload.planPng=smallPng;
      payload.thumb=thumb;                    /* small preview for the admin list */
      try{payload.sid=sessionStorage.getItem('gh_sid')||undefined;}catch(e){}
      var plan=payload.planData.plan;
      var send=function(){
        if(!SUBMIT_ENDPOINT){
          fallbackDownload(payload,f,false,'<h5>Sending is not switched on yet</h5>'+
            'Your submission file just downloaded. Email it with the printed plan, or call '+
            '<b>(08) 9297 2969</b>.');
          return;
        }
        var body=JSON.stringify(payload);
        if(body.length>5500000){ payload.planPng=null; body=JSON.stringify(payload); }
        fetch(SUBMIT_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},
          body:body})
          .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json().catch(function(){return {};}); })
          .then(function(){
            $('#s-status').innerHTML='<div class="teach"><h5>Sent</h5>We have your layout '+
              'at our end. Someone will come back to you with a quote.</div>';
            try{window.__GHTRACK&&window.__GHTRACK('sent');}catch(e){}
          })
          .catch(function(){
            fallbackDownload(payload,f,true,'<h5>That did not go through</h5>'+
              'Your submission file downloaded instead — email it in, or save the plan with '+
              '<b>Plan + schedule</b> and call <b>(08) 9297 2969</b>.');
          });
      };
      /* An uploaded floor plan can be a full-resolution photo; shrink the
         travelling copy without mutating the live plan on screen. */
      if(plan&&plan.src&&String(plan.src).indexOf('data:')===0){
        shrinkImage(plan.src,2000,0.85,function(s){
          var p2={},k;for(k in plan){if(Object.prototype.hasOwnProperty.call(plan,k))p2[k]=plan[k];}
          p2.src=s;payload.planData.plan=p2;send();
        });
      } else send();
    });});
  });
}

/* Downscale a data-URL image so the submission stays under the endpoint's
   body limit. Non-data URLs and already-small images pass through as-is. */
function shrinkImage(src,maxEdge,quality,cb){
  if(!src||String(src).indexOf('data:')!==0) return cb(src);
  var img=new Image();
  img.onload=function(){
    var w=img.naturalWidth||1,h=img.naturalHeight||1,sc=Math.min(1,maxEdge/Math.max(w,h));
    if(sc>=1&&src.length<900000) return cb(src);
    try{
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));
      var ctx=c.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      cb(c.toDataURL('image/jpeg',quality));
    }catch(e){cb(src);}
  };
  img.onerror=function(){cb(src);};
  img.src=src;
}

/* The old no-endpoint behaviour, kept as the failure path: the customer
   always leaves with their submission file, never with nothing. */
function fallbackDownload(payload,f,warn,msg){
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=(f.project||'layout').replace(/[^\w\- ]+/g,'')+'-greenhse-submission.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},4000);
  $('#s-status').innerHTML='<div class="teach'+(warn?' warn':'')+'">'+msg+'</div>';
}

/* ------------------------------------------------------------
   Live drafts. While someone works on a real plan, a snapshot is
   pushed to our side whenever something has changed (checked every
   20 s), so the team sees plans IN PROGRESS in layout-admin before
   the customer hits Send. Send stays the completed signal - the
   draft is removed and the submission takes its place. Same
   exclusions as the usage beacon: QA runs and staff loads.
   ------------------------------------------------------------ */
(function(){
  if(/[?&](qa=1|load=|draft=)/.test(location.search)) return;
  var lastSig='';
  function sid(){
    try{return sessionStorage.getItem('gh_sid')||'';}catch(e){return '';}
  }
  function sig(){
    var S=G.S;
    return [S.plan.loaded?String(S.plan.name)+':'+S.plan.w+'x'+S.plan.h:'',
            S.fixtures.length,S.rooms.length,S.seq,S.mpp||0,
            $('#projname')?$('#projname').value:''].join('|');
  }
  function push(){
    var S=G.S, id=sid();
    if(!id) return;
    if(!S.plan.loaded && !S.fixtures.length) return;   /* nothing to show yet */
    var cur=sig(); if(cur===lastSig) return; lastSig=cur;
    var planData={v:1,name:$('#projname')?$('#projname').value:'',plan:S.plan,mpp:S.mpp,
                  ceiling:S.ceiling,fixtures:S.fixtures,rooms:S.rooms,seq:S.seq};
    var finish=function(pd,thumb){
      try{
        fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({sid:id,project:planData.name,thumb:thumb,planData:pd,
                               fittings:S.fixtures.length,rooms:S.rooms.length})})
          .catch(function(){});
      }catch(e){}
    };
    G.composePNG(function(png){
      shrinkImage(png,360,0.6,function(thumb){
        var plan=planData.plan,k;
        if(plan&&plan.src&&String(plan.src).indexOf('data:')===0){
          shrinkImage(plan.src,1600,0.8,function(s2){
            var p2={};for(k in plan){if(Object.prototype.hasOwnProperty.call(plan,k))p2[k]=plan[k];}
            p2.src=s2;
            var pd={};for(k in planData){if(Object.prototype.hasOwnProperty.call(planData,k))pd[k]=planData[k];}
            pd.plan=p2;
            finish(pd,thumb);
          });
        } else finish(planData,thumb);
      });
    });
  }
  setInterval(push,20000);
  window.__GHDRAFT=push;
})();

/* ---------- wiring ---------- */
function boot(){
  document.getElementById('img-hero').src=ART.hero;
  $('#home-guide').onclick=openTut;
  $('#home-plan').onclick=openPlanner;
  $('#home-skip').onclick=openPlanner;
  $('#tut-skip').onclick=openPlanner;
  $('#tut-back').onclick=function(){go(T.i-1);};
  $('#tut-next').onclick=function(){ if(T.i===STEPS.length-1) openPlanner(); else go(T.i+1); };
  $('#s-cancel').onclick=function(){$('#sendmodal').classList.remove('open');};
  $('#s-send').onclick=doSend;
  $('#sendmodal').onclick=function(e){if(e.target===this)this.classList.remove('open');};
  document.addEventListener('keydown',function(e){
    if(!$('#tut').classList.contains('on')) return;
    if(e.key==='ArrowRight')$('#tut-next').click();
    if(e.key==='ArrowLeft')$('#tut-back').click();
  });
  if(/[?&]qa=1|[?&]app=1/.test(location.search)) openPlanner();
  /* ?load=<id> — staff link from layout-admin.html: pull a stored customer
     submission from /api/layouts and open it in the planner for editing. */
  var lm=location.search.match(/[?&](load|draft)=([\w-]+)/);
  if(lm){
    openPlanner();
    var akey=null;
    try{akey=localStorage.getItem('greenhse_admin_key');}catch(e){}
    if(!akey){
      akey=window.prompt('Admin key to load this plan:')||'';
      try{if(akey)localStorage.setItem('greenhse_admin_key',akey);}catch(e){}
    }
    if(akey) fetch('/api/layouts?'+(lm[1]==='draft'
        ?'draft='+encodeURIComponent(lm[2])
        :'id='+encodeURIComponent(lm[2])+'&fields=edit'),{headers:{'x-admin-key':akey}})
      .then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
      .then(function(p){
        if(p&&p.planData){G.applyPlan(p.planData);}
        else alert('That submission has no editable plan attached.');
      })
      .catch(function(){
        try{localStorage.removeItem('greenhse_admin_key');}catch(e){}
        alert('Could not load that plan — check the admin key and the link, then reload.');
      });
  }
}

window.__TUT={
  spacingVerdict:spacingVerdict,wallVerdict:wallVerdict,wallMM:wallMM,distM:distM,
  clampRoom:clampRoom,ROOM:ROOM,ROOM_M:ROOM_M,PXM:PXM,idealLayout:idealLayout,needed:needed,STEPS:STEPS,T:T,go:go,render:render,BEAM_PICKS:BEAM_PICKS,
  openTut:openTut,openPlanner:openPlanner,openSend:openSend,
  submissionPayload:submissionPayload,endpoint:function(){return SUBMIT_ENDPOINT;},
  homeIsDefault:function(){return HOME_DEFAULT;}
};

/* Same as core: boot() ran on DOMContentLoaded after init(); the component
   keeps that order. window.__TUT above is set the moment this runs, as it
   was when the script was parsed. */
return boot;
}
