/* Greenhse Layout Planner — application engine.
   This is the planner as it has always run, made a module: PRODUCTS comes
   in as an import instead of a global, and the DOMContentLoaded boot became
   an exported mountCore() that the React component calls once the shell is
   in the DOM; it returns init() for the component to run last. Everything the QA suite drives is still exported on
   window.__GH. Listeners and timers it registers on window/document are
   recorded by engine/lifecycle.js and removed when the component unmounts. */
import { PRODUCTS } from '../data/products';

/* ============================================================
   Greenhse Layout — application logic
   Pure calculation helpers are exported on window.__GH for the QA suite.
   ============================================================ */
export function mountCore(){
"use strict";

/* Product photos are linked as /img/… relative to the deployed site. Opened
   anywhere else — the demo deploy, a local copy, a saved file — those paths
   404 and every card shows a broken-image icon. Retry each failed photo once
   against the live site; if that also fails, hide the broken glyph so the
   plain tile shows instead. (layout-standalone.html inlines its photos as
   data URIs, so this handler simply never fires there.) */
document.addEventListener('error',function(e){
  var t=e.target;
  if(!t||!t.tagName||t.tagName!=='IMG') return;
  if(t.dataset.ghDone) return;
  var src=t.getAttribute('src')||'';
  if(!t.dataset.ghRetried && /^\/(img|blog|images)\//.test(src)){
    t.dataset.ghRetried='1';
    t.src='https://greenhse.netlify.app'+src;
    return;
  }
  t.dataset.ghDone='1';
  t.style.visibility='hidden';
},true);

/* ---------- catalogue-derived helpers (never invent data) ---------- */

// "560/650/600 lumens (3000/4000/5000k)" -> 603.  Cuts at the word "lumen"
// so colour temperatures and lm/W figures never contaminate the average.
function parseLumens(s){
  if(s==null) return null;
  var t=String(s);
  var i=t.toLowerCase().indexOf('lumen');
  if(i>-1) t=t.slice(0,i);
  var m=t.match(/\d[\d,]*(\.\d+)?/g);
  if(!m) return null;
  var n=m.map(function(x){return parseFloat(x.replace(/,/g,''));})
         .filter(function(v){return v>=100&&v<=200000;});
  if(!n.length) return null;
  return Math.round(n.reduce(function(a,b){return a+b;},0)/n.length);
}

// "60º Anti Glare" -> 60 ; "100º" -> 100 ; junk -> null
function parseBeam(s){
  if(s==null) return null;
  var m=String(s).match(/(\d{1,3})\s*(?:º|°|deg)/i)||String(s).match(/(\d{1,3})/);
  if(!m) return null;
  var v=parseInt(m[1],10);
  return (v>=5&&v<=360)?v:null;
}

function parseWatts(s){
  if(s==null) return null;
  var m=String(s).match(/(\d+(?:\.\d+)?)/);
  return m?parseFloat(m[1]):null;
}

// "70mm 7W Downlight..." -> 70 (mm). Used to draw the fitting at real size.
function parseCutout(p){
  var direct=p.cutout&&String(p.cutout).match(/(\d{2,3})\s*mm/i);
  if(direct) return parseInt(direct[1],10);
  var m=String(p.name||'').match(/(\d{2,3})\s*mm/i);
  if(m){var v=parseInt(m[1],10); if(v>=30&&v<=400) return v;}
  return null;
}

/* ---------- lighting rules of thumb ---------- */

function clamp(v,a,b){return Math.min(b,Math.max(a,v));}

/* Star lights are an effect, not the light for the room, so they are set far
   closer together than a downlight grid - 500 mm apart at most. Running them
   at downlight spacing (1.5 m+) spread a "starlit ceiling" across half a house
   and read as nothing at all. */
var STAR_SPACING_M=0.5;
function isStarLight(p){
  return !!p && (p.cat==='star' || /star\s?light/i.test(p.name||''));
}
/* Wall lights go on a wall and throw forward, so they are handled apart from
   everything that sits in a ceiling. */
function isWallLight(p){ return !!p && /wall light/i.test(p.name||''); }

// Downlight spacing: half the ceiling height, opened up a little for wide beams.
function spacingFor(ceilingM, beamDeg){
  var f = beamDeg==null?1.05 : beamDeg>=100?1.2 : beamDeg>=90?1.1 : 1.0;
  /* 1.5 m floor: closer than that and you are buying fittings you do not need.
     No meaningful ceiling - spreading them further is a choice, not a fault. */
  return clamp((ceilingM/2)*f, 1.5, 2.4);
}
/* 650-750 mm off the wall. Close enough that the beam still washes the wall -
   which is what actually makes a room read as bright, since you see far more
   wall than floor - but not so close that it scallops. */
function wallOffsetFor(spacing){ return clamp(spacing/2, 0.65, 0.75); }

/* Greenhse downlight counts by room size. Two columns, because a 60° low glare
   fitting covers less floor than a wide standard one and needs more of them.
   Short side first, then long side; the first band both sides fit inside wins. */
/* Downlight counts by room size. The old table jumped straight from 1 fitting
   at 2x2 m to 4 at 3x4 m, so a WC or a robe was getting four downlights.
   These steps are finer at the small end, where most of the mistakes were. */
var DL_BANDS=[
  {w:1.5, l:2,   std:1,  lg:1},   /* WC, linen, pantry            */
  {w:2.5, l:3,   std:2,  lg:2},   /* robe, small ensuite          */
  {w:3,   l:4,   std:2,  lg:4},   /* small bed, laundry           */
  {w:4,   l:5,   std:4,  lg:6},   /* bedroom, study, dining       */
  {w:5,   l:7,   std:6,  lg:8},   /* main bed, family             */
  {w:6,   l:9,   std:8,  lg:10},  /* living                       */
  {w:7,   l:12,  std:10, lg:12}   /* open plan                    */
];
/* The two biggest bands - 5 x 8 m and 6 x 10 m, plus anything larger than the
   table - are the only sizes where the right answer is genuinely a judgement
   call rather than a number. A living room can be run at 6 fittings and feel
   calm, or 9 and feel bright, and both are defensible. Every smaller room has
   one right answer and is not asked.

   6 and 9 are the ends of it. Below 6 a room that size reads patchy; above 9
   you are paying for fittings that only add glare. */
var BIG_BAND_FROM=5;              /* index into DL_BANDS: the 6 x 9 m band on  */
var COMFORT={less:6, more:9};
var COMFORT_MIN=6, COMFORT_MAX=9;

/* Is this room one of the two big bands (or bigger than the table)?
   Bedrooms are excluded wherever they land - a bedroom is four downlights,
   which is a house rule and not up for negotiation. */
function isBigRoom(r){
  if(!S.mpp || !r) return false;
  if(r.type==='bedroom') return false;
  var b=ROOMS[r.type]||ROOMS.other;
  if(!b.dl || b.max) return false;          /* capped rooms are already decided */
  var band=bandFor(r.w*S.mpp, r.h*S.mpp);
  if(!band) return true;                    /* larger than the table */
  return DL_BANDS.indexOf(band)>=BIG_BAND_FROM;
}
function roomComfort(r){ return (r && S.roomComfort[r.id]) || ''; }
/* What the comfort answer does to a count. '' keeps the table's number, held
   inside the 6-9 window so the three answers stay in order. */
function applyComfort(count,mode){
  if(mode==='less') return COMFORT.less;
  if(mode==='more') return COMFORT.more;
  return clamp(count,COMFORT_MIN,COMFORT_MAX);
}

// A fitting counts as "low glare" if its beam is tighter than 90°, read off the catalogue.
function fittingClass(p){
  var b=parseBeam(p&&p.beam);
  return (b!=null&&b<90) ? 'lg' : 'std';
}
function bandFor(a,b){
  var short=Math.min(a,b), long=Math.max(a,b), i;
  for(i=0;i<DL_BANDS.length;i++){
    if(short<=DL_BANDS[i].w+1e-9 && long<=DL_BANDS[i].l+1e-9) return DL_BANDS[i];
  }
  return null;
}
function bandLabel(band){
  if(!band) return 'larger than the table';
  var i=DL_BANDS.indexOf(band), prev=i>0?DL_BANDS[i-1]:null;
  if(!prev) return 'up to '+band.w+' × '+band.l+' m';
  return prev.w+'–'+band.w+' m × '+prev.l+'–'+band.l+' m';
}
// Downlights for a room of a x b metres. klass is 'std' or 'lg'.
function countForRoom(a,b,klass){
  if(!a||!b) return null;
  klass=klass==='lg'?'lg':'std';
  var band=bandFor(a,b);
  if(band){
    /* A long narrow room (a galley kitchen, a hallway-shaped living strip)
       lands in a band by its LENGTH alone, but only holds a fraction of the
       band's area - lighting 9.9 sqm like the 20 sqm the band was written for
       is how a plan ends up wall-to-wall with downlights. Scale the band's
       count by the area actually there, but never drop below what the
       1.5-2 m spacing rule needs along the room's long side. */
    var n=band[klass];
    var areaN=Math.ceil((a*b)/(band.w*band.l)*n);
    var lengthMin=Math.min(n, Math.ceil(Math.max(a,b)/2.2));
    return clamp(Math.min(n, Math.max(areaN, lengthMin)),1,60);
  }
  // bigger than the table: carry the density of the largest band forward
  var last=DL_BANDS[DL_BANDS.length-1];
  var per=last[klass]/(last.w*last.l);
  return clamp(Math.ceil(a*b*per),1,60);
}


/* Battens for a garage, laundry or shed. One 1.2 m batten covers up to 5 × 5 m;
   past that you want two, spaced across the short side so neither end of the
   bay is left dark. Bigger sheds carry that density forward. */
/* A single 1.2 m batten covers a normal domestic garage. Anything bigger than
   a shed-sized space gets a second one, but a garage is one. */
function battenCount(a,b){
  if(!a||!b) return 1;
  var short=Math.min(a,b), long=Math.max(a,b);
  if(long<=8) return 1;                /* single and double garages */
  if(short<=7 && long<=12) return 2;
  return clamp(Math.ceil((a*b)/36),1,6);
}
/* Battens run along the long axis, spread evenly across the short one.
   Points are metres from the room's top-left corner, the same convention
   gridInRoom uses - returning 0 here put every batten on the left wall. */
function battenPoints(w,h,n){
  var pts=[], i, horizontal=(w>=h);
  var across=horizontal?h:w;
  for(i=0;i<n;i++){
    var t=(i+1)/(n+1);                 // even bands, never hard against a wall
    var d=(t-0.5)*across*0.82;         // pull in so light still reaches the walls
    pts.push(horizontal ? {x:w/2, y:h/2+d} : {x:w/2+d, y:h/2});
  }
  return pts;
}

// Diameter of the light pool at bench height, for the on-plan visual.
var WORKPLANE=0.75;   // m — bench height, used for the light-pool visual only
function poolDiameter(ceilingM, beamDeg){
  if(!beamDeg) return null;
  var h=Math.max(0.3, ceilingM-WORKPLANE);
  /* The beam angle is measured to 50% intensity, so the full cone edge is
     where the light has already fallen away to almost nothing — drawing that
     makes every plan look like one big wash. We draw the useful pool: the
     part still doing real work on the bench, which is about 70% of the cone. */
  var full = 2*h*Math.tan((Math.min(beamDeg,170)/2)*Math.PI/180);
  return full*0.70;
}

/* ---------- placement geometry (all in metres, origin = click point) ---------- */

function rowPoints(n,spacing){
  var pts=[],i,span=(n-1)*spacing;
  for(i=0;i<n;i++) pts.push({x:-span/2+i*spacing, y:0});
  return pts;
}
/* The same run, turned on its side. "In a block" and "one at a time" are gone:
   a group of extras is a line with a direction, and it moves as one. */
function colPoints(n,spacing){
  return rowPoints(n,spacing).map(function(q){ return {x:0,y:q.x}; });
}
function gridPoints(n,spacing){
  var cols=Math.ceil(Math.sqrt(n)), rows=Math.ceil(n/cols), pts=[], k=0,r,c;
  for(r=0;r<rows;r++) for(c=0;c<cols;c++){
    if(k++>=n) break;
    pts.push({x:(c-(cols-1)/2)*spacing, y:(r-(rows-1)/2)*spacing});
  }
  return pts;
}
function linePoints(n,ax,ay,bx,by){
  var pts=[],i;
  if(n===1) return [{x:(ax+bx)/2,y:(ay+by)/2}];
  for(i=0;i<n;i++){var t=i/(n-1); pts.push({x:ax+(bx-ax)*t, y:ay+(by-ay)*t});}
  return pts;
}
// Even grid inside a room of w x h metres, kept `off` clear of every wall.
function fillPoints(w,h,spacing,off){
  var uw=Math.max(0,w-2*off), uh=Math.max(0,h-2*off);
  var cols=Math.max(1,Math.round(uw/spacing)+1), rows=Math.max(1,Math.round(uh/spacing)+1);
  var pts=[],r,c,x,y;
  for(r=0;r<rows;r++) for(c=0;c<cols;c++){
    x = cols===1 ? w/2 : off + c*uw/(cols-1);
    y = rows===1 ? h/2 : off + r*uh/(rows-1);
    pts.push({x:x,y:y});
  }
  return pts;
}

// Lay n fittings out inside a w x h room as an even grid that matches the room
// shape, keeping `off` clear of every wall. Any short last row is centred.
/* Lay n fittings out as a complete rectangle.
 *
 * The old version took the band count literally: 8 in a 5.4 x 4.2 m room came
 * out 3-3-2, with an obvious hole in the bottom row. On a real plan a sparky
 * would just run 3 x 3. So we look for the grid whose spacing is most even and
 * closest to the rule of thumb, allowing the count to move by one or two, and
 * only fall back to a ragged last row if nothing sensible fits.
 */
/* `exact` is for a room whose count is pinned rather than suggested - a
   bathroom is two lights whatever it measures, so the grid search is not
   allowed to quietly settle on one. */
function gridInRoom(w,h,n,off,exact){
  if(n<=0) return [];
  off=exact ? Math.min(off, w/4, h/4) : Math.min(off, w/3, h/3);
  var uw=Math.max(0,w-2*off), uh=Math.max(0,h-2*off);
  var target=spacingFor(S.ceiling, 100);      /* the spacing we aim for */

  var best=null, c, r;
  for(c=1;c<=8;c++){
    for(r=1;r<=8;r++){
      var total=c*r;
      /* Small rooms must not creep up: one extra fitting in a bedroom is a
         real cost. Bigger rooms can move by two to square the grid off. */
      var slack = exact ? 0 : (n<=4 ? 1 : 2);
      if(Math.abs(total-n)>slack) continue;
      var sx = c===1 ? w : uw/(c-1);
      var sy = r===1 ? h : uh/(r-1);
      /* Prefer even spacing in both directions, spacing near the rule of
         thumb, and a count close to the recommendation - in that order. */
      var score = Math.abs(sx-sy)*1.0
                + (Math.abs(sx-target)+Math.abs(sy-target))*0.6
                + Math.abs(total-n)*1.10;      /* the band count is a real number, not a hint */
      if(sx>2.6 || sy>2.6) score += 3;         /* never leave a dark gap    */
      if(sx<0.85 || sy<0.85) score += 3;       /* nor a row of spotlights   */
      if(!best || score<best.score) best={c:c,r:r,score:score,n:total};
    }
  }

  var pts=[], x, y, i, j;
  if(best){
    for(j=0;j<best.r;j++){
      y = best.r===1 ? h/2 : off + j*uh/(best.r-1);
      for(i=0;i<best.c;i++){
        x = best.c===1 ? w/2 : off + i*uw/(best.c-1);
        pts.push({x:x,y:y});
      }
    }
    return pts;
  }

  /* Nothing rectangular fits - lay it out anyway, but centre the short row so
     it reads as deliberate rather than as a missing fitting. */
  var cols=clamp(Math.round(Math.sqrt(n*(w/h))),1,n);
  var rows=Math.ceil(n/cols), cnt, span, x0;
  for(j=0;j<rows;j++){
    cnt = (j<rows-1)? cols : (n-cols*(rows-1));
    y = rows===1 ? h/2 : off + j*uh/(rows-1);
    span = cols>1 ? uw*(cnt-1)/(cols-1) : 0;
    x0 = off + (uw-span)/2;
    for(i=0;i<cnt;i++){
      x = cnt===1 ? w/2 : x0 + i*span/(cnt-1);
      pts.push({x:x,y:y});
    }
  }
  return pts;
}

// Lines a new or dragged fitting up with the ones already placed, the way a
// sparky would eye down a row. Returns the snapped point and which guides to draw.
function snapToFittings(p,list,tol){
  var out={x:p.x,y:p.y,gx:null,gy:null}, bx=tol, by=tol;
  list.forEach(function(f){
    var dx=Math.abs(f.x-p.x), dy=Math.abs(f.y-p.y);
    if(dx<=bx){bx=dx;out.x=f.x;out.gx=f.x;}
    if(dy<=by){by=dy;out.y=f.y;out.gy=f.y;}
  });
  return out;
}
function nearestGap(p,list){
  var best=null;
  list.forEach(function(f){
    var d=Math.hypot(f.x-p.x,f.y-p.y);
    if(d>0.5&&(best===null||d<best)) best=d;
  });
  return best;
}

function pointInRect(px,py,r){return px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h;}

/* ---------- scale from the page itself ----------
   A PDF knows its own paper size. Combined with the drawing scale printed on
   the plan (1:100 and so on) that gives metres per pixel exactly, with nothing
   to trace and nothing to estimate. */
var PAPERS=[
  {n:'A0',w:841,h:1189},{n:'A1',w:594,h:841},{n:'A2',w:420,h:594},
  {n:'A3',w:297,h:420},{n:'A4',w:210,h:297},
  {n:'Letter',w:216,h:279},{n:'Tabloid',w:279,h:432}
];
function ptToMm(pt){ return pt*25.4/72; }
function paperName(wMm,hMm,tol){
  tol=tol||4;
  var a=Math.min(wMm,hMm), b=Math.max(wMm,hMm), hit=null;
  PAPERS.forEach(function(p){
    if(Math.abs(p.w-a)<=tol&&Math.abs(p.h-b)<=tol) hit=p.n;
  });
  return hit;
}
// metres per image pixel, from paper width and the drawing ratio (1:ratio)
function mppFromPaper(paperWmm,ratio,imgWpx){
  if(!paperWmm||!ratio||!imgWpx) return null;
  return (paperWmm/1000*ratio)/imgWpx;
}

/* ---------- finding the drawing on the page ----------
   Plans arrive at wildly different sizes: a tight phone photo, or an A1 sheet
   with the floor plan in one corner and a title block around it. Fitting the
   whole page makes the small ones useless, so we look for where the ink
   actually is and fit to that instead. */
function contentBox(lum,w,h){
  var full={x:0,y:0,w:w,h:h};
  if(!lum||!w||!h) return full;
  // background = the median of the page border, so dark scans work too
  var edge=[],i,x,y;
  for(x=0;x<w;x++){edge.push(lum[x]);edge.push(lum[(h-1)*w+x]);}
  for(y=0;y<h;y++){edge.push(lum[y*w]);edge.push(lum[y*w+w-1]);}
  edge.sort(function(a,b){return a-b;});
  var bg=edge[Math.floor(edge.length/2)];
  var TH=28;
  var cols=new Array(w).fill(0), rows=new Array(h).fill(0), ink=0;
  for(y=0;y<h;y++) for(x=0;x<w;x++){
    if(Math.abs(lum[y*w+x]-bg)>TH){cols[x]++;rows[y]++;ink++;}
  }
  if(ink<w*h*0.001) return full;             // effectively a blank page
  var minCol=Math.max(1,Math.round(h*0.004)), minRow=Math.max(1,Math.round(w*0.004));
  var cx=mainSpan(cols,minCol), cy=mainSpan(rows,minRow);
  if(cx[0]<0||cy[0]<0) return full;
  var box={x:cx[0],y:cy[0],w:cx[1]-cx[0]+1,h:cy[1]-cy[0]+1};
  // if the drawing is nearly the whole page, or suspiciously tiny, use the page
  if(box.w*box.h < w*h*0.04) return full;
  return box;
}
// Splits a projection into blocks separated by wide blank gaps, then keeps the
// heaviest one plus any neighbour of comparable weight. That drops a title block
// or a legend sitting off to one side, without cutting a plan drawn in two wings.
function mainSpan(counts,min,gapPct,keepPct){
  gapPct=gapPct||0.06; keepPct=keepPct||0.25;
  var n=counts.length, gap=Math.max(4,Math.round(n*gapPct));
  var segs=[],cur=null,blank=0,k;
  for(k=0;k<n;k++){
    if(counts[k]>=min){
      if(!cur){cur={a:k,b:k,ink:0};segs.push(cur);}
      cur.b=k;cur.ink+=counts[k];blank=0;
    }else if(cur){
      blank++;
      if(blank>gap) cur=null;
    }
  }
  if(!segs.length) return [-1,-1];
  var top=segs.reduce(function(a,b){return b.ink>a.ink?b:a;});
  var keep=segs.filter(function(s){return s.ink>=top.ink*keepPct;});
  return [Math.min.apply(null,keep.map(function(s){return s.a;})),
          Math.max.apply(null,keep.map(function(s){return s.b;}))];
}

function padBox(box,w,h,pct){
  var px=box.w*pct, py=box.h*pct;
  var x=Math.max(0,box.x-px), y=Math.max(0,box.y-py);
  return {x:x,y:y,
          w:Math.min(w-x,box.w+px*2),
          h:Math.min(h-y,box.h+py*2)};
}

/* ---------- money ---------- */
function incGST(ex){return Math.round(ex*1.1*100)/100;}
function money(v){return '$'+(Math.round(v*100)/100).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});}

/* ---------- room briefs ---------- */
var ROOMS={
  /* fan:true      the room can take a ceiling fan, and offers it
     lowGlareOnly  a fan in the room means downlights must be 60 deg, or the
                   blades chop a wide beam and you get shadow flicker
     fan:true is the whole list of rooms a ceiling fan may go in - bedrooms
     and the alfresco. exhaust:true is the whole list for an exhaust fan -
     bathrooms and laundries. Both are enforced on placement, not just offered
     on the card, so a fan cannot be dropped into a lounge by hand either.
     max           hard cap on downlight count, whatever the size table says
     exhaust       a bathroom-style exhaust + light is part of the plan
     rec           the fitting we actually recommend for this room          */
  /* short  what the room is called once there are several of them on one
              plan. "Bedroom / Bedroom / Bedroom" down the side of a plan tells
              you nothing; "Bed 1 / Bed 2 / Bed 3" is how a builder reads it. */
  kitchen : {label:'Kitchen', short:'Kitchen', cct:'4000K natural white', wet:false, dl:true,
             note:'Brightest general level in the house. Keep one fitting over the sink and one over the island rather than only a centred grid.'},
  living  : {label:'Living / lounge',    short:'Living', cct:'3000K warm white', wet:false, dl:true, lowGlareOnly:true,
             note:'Low glare fittings earn their money here \u2014 this is the room you sit in at night looking up.'},
  dining  : {label:'Dining',             short:'Dining', cct:'3000K warm white', wet:false, dl:true, lowGlareOnly:true,
             note:'Centre the grid on the table, not on the room, if the table sits off to one side.'},
  bedroom : {label:'Bedroom',            short:'Bed', cct:'3000K warm white', wet:false, dl:true, fan:true, lowGlareOnly:true,
             note:'Keep a downlight off the pillow line. You will be lying underneath it. Most bedrooms end up with a fan \u2014 if yours does, the fan light does the job and the downlights come out.'},
  /* Two lights in the bathroom, and the exhaust is an extra you tick if you
     want one - not a three-way question about fans before the room is lit. */
  bathroom: {label:'Bathroom / ensuite', short:'Bath', cct:'4000K natural white', wet:true, dl:true, min:2, max:2, exhaust:true,
             rec:'C25-CCT-PA',
             note:'Two lights, sealed for a wet area. Add an exhaust fan if the room needs one.'},
  /* Laundry is lights only. */
  laundry : {label:'Laundry',            short:'Laundry', cct:'4000K natural white', wet:true, dl:true, max:2,
             rec:'C25-CCT-PA',
             note:'A sealed ceiling light does more here than two downlights.'},
  hallway : {label:'Hallway / entry',    short:'Hall', cct:'3000K warm white', wet:false, dl:true, hall:true,
             note:'Hallways are over-lit more than any other space. One fitting every 2\u20132.5 m down the centre line is plenty \u2014 you are walking through, not working here. Sensors are worth considering.'},
  study   : {label:'Study / home office',short:'Study', cct:'4000K natural white', wet:false, dl:true, lowGlareOnly:true,
             note:'Place fittings beside the desk line, not behind your head, or you light your own shadow.'},
  garage  : {label:'Garage / workshop',  short:'Garage', cct:'5000K bright white', wet:false, dl:false,
             note:'Battens, not downlights. A 1.2 m T40 Pro throws far more light per dollar and needs no ceiling cut-outs.'},
  alfresco: {label:'Alfresco / patio',   short:'Alfresco', cct:'3000K warm white', wet:true, dl:true, max:2, fan:true, lowGlareOnly:true,
             rec:'DL9RGBW-BT1',
             note:'Outdoors wants fewer fittings than people think \u2014 two is usually right. Go RGBW out here: warm white most nights, colour when you want it, and it costs nothing extra to run. An outdoor fan makes far more difference to comfort than another downlight.'},
  small   : {label:'Small room \u2014 WC, robe, pantry', short:'Small', cct:'4000K natural white', wet:false, dl:true, max:2,
             note:'One fitting does it, two at most. A small room with four downlights in it looks like a showroom and costs four times as much to run.'},
  other   : {label:'Other space',        short:'Room', cct:'4000K natural white', wet:false, dl:true,
             note:'Treat it like a living space until you know what happens in the room.'}
};


var CATS=[
  {id:'downlights', label:'Downlights',           hint:'Recessed into the ceiling. The default for general lighting through a house.'},
  {id:'ceiling',    label:'Ceiling & wall lights',hint:'Surface mounted. Use where you cannot recess — concrete ceilings, rentals, low voids.'},
  {id:'batten',     label:'Battens',              hint:'Linear surface fittings. Cheap even light for garages, laundries and sheds.'},
  {id:'star',       label:'Star lights',          hint:'Small 3W points. Alfresco ceilings, feature nooks, stair risers.'},
  {id:'fans',       label:'Fans',                 hint:'One per room, centred. A fan with a light does the room on its own; a fan without one still needs four low glare downlights around it.'}
];

/* The planner lays out the lighting inside a house. Track, sensors, outdoor,
   floods, landscape, high bay, industrial, emergency and the drivers and
   controllers are all still on the website - they are just not things you
   place on a floor plan, and having them in the picker was making the list
   harder to get through. Drop them from the catalogue the planner works with,
   so the schedule and the search stay consistent with the picker. */
/* Wall lights are an outdoor fitting in this planner (see SPECIAL.wall), and
   the real outdoor ones live in the 'outdoor' category, which the planner
   otherwise drops. Re-tag just those few into 'ceiling' so they survive the
   cull - without this the "Outdoor" buttons pointed at products that had
   already been spliced out, and clicking one placed nothing at all. */
var WALL_KEEP=['W10-CCT-BW','SEAFORD-UPDOWN-WAL','WL12-18-CCT-SENSOR','WL10R-40K-BLACK'];
/* Strip lighting is not laid out on a floor plan any more. How long the run is,
   which channel it sits in, what drives it and what controls it are a quoting
   conversation, not a spacing one, and the whole range is still on the website.
   The products stay in the catalogue data so a plan saved before this change
   still resolves every fitting on it - they are simply never offered anywhere
   in the planner: not in the extras picker, not in a room's light list, not in
   the search. */
var DATA_ONLY_CATS={strip:1};
(function(){
  WALL_KEEP.forEach(function(id){
    var p=PRODUCTS.filter(function(x){return x.id===id;})[0];
    if(p) p.cat='ceiling';
  });
  var keep={};
  CATS.forEach(function(c){ keep[c.id]=1; });
  for(var i=PRODUCTS.length-1;i>=0;i--)
    if(!keep[PRODUCTS[i].cat] && !DATA_ONLY_CATS[PRODUCTS[i].cat]) PRODUCTS.splice(i,1);
})();

/* ============================================================
   State
   ============================================================ */
var S={
  plan:{src:null,name:null,w:1600,h:1100,loaded:false},
  paper:null,ratio:100,measure:null,snap:true,
  zoom:1,panX:0,panY:0,
  mpp:null,                       // metres per image pixel
  ceiling:2.7,
  tool:'select',
  fixtures:[],rooms:[],
  sel:[],
  seq:1,
  pick:{cat:'downlights',pid:null,qty:4,arr:'row',q:''},
  ownName:'', ownPrice:'',            // the customer's own pendant
  roomOpen:{},
  roomEdit:{},                    // room id -> they asked to open a finished room back up
  roomInfoOpen:{},                // room id -> the "Total information" block is open
  roomMoreOpen:{},                // room id -> the full catalogue list is open
  fanPlan:'ask',                  // whole-job answer: 'ask' | 'none' | 'light' | 'nolight'
  /* The light that goes in a room is nothing to do with whatever is selected
     in "Add extra lights". Rooms light themselves when you box them in; the
     picker in step 4 is only for the extras you add by hand. Keeping them
     apart is what stops changing one from quietly re-laying the other. */
  roomPid:{},                     // room id -> the fitting that lights it
  roomPidAll:null,                // what a new room starts with
  roomFan:{},                     // room id -> '' | 'light' | 'nolight'
  roomFanSize:{},                 // room id -> '' (auto) | '4' | '5' blades
  roomFanManual:{},               // room id -> true once the user set THIS room by hand
  roomExhaust:{},                 // room id -> wet room takes an exhaust + light
  roomComfort:{},                 // big room id -> '' (as measured) | 'less' | 'more'
  roomAskFan:{},                  // room id -> the fan question is still unanswered
  roomType:'kitchen',
  showPools:true,showLabels:false,showGrid:false,hintSeen:false,
  cal:{a:null,b:null},
  undo:[]
};

var lastZoom=null, fxRaf=null;
function scheduleFxRedraw(){
  if(fxRaf||!el.gFx) return;
  var run=function(){ fxRaf=null; if(el.gFx){renderFixtures();renderRooms();} };
  fxRaf = (typeof requestAnimationFrame==='function') ? requestAnimationFrame(run) : setTimeout(run,16);
}
var $=function(s){return document.querySelector(s);};
var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
var svgns='http://www.w3.org/2000/svg';
var el={};

function byId(id){return PRODUCTS.filter(function(p){return p.id===id;})[0]||null;}
/* The planner offers a deliberately short downlight list. Six fittings cover
   every job people actually plan for, and a wall of near-identical options is
   the fastest way to stall someone who just wants their lights laid out.
   The full range is still on the website. */
var DL_ALLOW=[
  'DL8ES-FLAT-ALL-FP-',   /* 8ESF  - 90 mm 8W flat, switch adjustable   */
  'DL9ES-FLAT-HL',        /* 9ESF  - 90 mm high lumen flat, the default */
  'DL8CCT-P-LG',          /* 9W low glare - premium, adjustable         */
  'DL10ES-FLAT-WHITE-',   /* 10ESF - 90 mm 10W flat                     */
  'DL10-PS',              /* 10W low glare 60 deg                       */
  'DL9RGBW-BT1',          /* RGBW bluetooth                             */
  'DL9RGBW-PBT'           /* RGBW low glare bluetooth                   */
];
/* Star lights are deliberately not in the planner. They run off a 12 V driver
   with a hard limit of 6 heads per cable and T-pieces every metre, so laying
   them out is a wiring job, not a spacing job. The finder on the website walks
   people through it properly. */
/* Fittings the planner recommends by room type, which sit outside the
   downlight list but still need to be selectable. */
var EXTRA_ALLOW=['C25-CCT-PA','T40-CCT-BATTEN-PRO'];
/* The one the planner reaches for unless told otherwise. */
var DL_DEFAULT='DL9ES-FLAT-HL';

function catProducts(c){
  return PRODUCTS.filter(function(p){
    if(p.cat!==c) return false;
    /* This picker chooses LIGHTS. Drivers, transformers, remotes, controllers
       and channel profiles stay in the catalogue data (the schedule and saved
       plans still resolve them) but are no longer offered as things to place —
       they were most of the noise in the strip and star lists. */
    if(!isALight(p)) return false;
    if(c==='downlights') return DL_ALLOW.indexOf(p.id)>-1;
    if(c==='ceiling')    return EXTRA_ALLOW.indexOf(p.id)>-1 || /25W|24W/i.test(p.name||'');
    /* One batten, and it is the T40 Pro. The 60 cm T20 and the IP65 version
       were never the right answer for a garage or a laundry, and having three
       near-identical bars in the list only slowed the choice down. */
    if(c==='batten')     return p.id===BATTEN_ONLY;
    return true;
  });
}
var BATTEN_ONLY='T40-CCT-BATTEN-PRO';

/* Exhaust fans, bathroom mates and heat lamps are bathroom fittings, not
   ceiling fans. They only belong in a wet room, so they are kept out of the
   fan list until the room being marked up is one. */
function isBathroomFitting(p){
  return !!p && p.cat==='fans' && /exhaust|bathroom mate|heater|heather|promax/i.test(p.name||'');
}
function isCeilingFanProduct(p){ return !!p && p.cat==='fans' && !isBathroomFitting(p); }
function wetRoomSelected(){
  var b=ROOMS[S.roomType]||ROOMS.other;
  return !!(b.exhaust||b.wet);
}

/* ---------- undo ---------- */
function snapshot(){
  S.undo.push(JSON.stringify({f:S.fixtures,r:S.rooms,mpp:S.mpp,seq:S.seq}));
  if(S.undo.length>50) S.undo.shift();
}
function undo(){
  if(!S.undo.length){toast('Nothing to undo');return;}
  var s=JSON.parse(S.undo.pop());
  S.fixtures=s.f;S.rooms=s.r;S.mpp=s.mpp;S.seq=s.seq;S.sel=[];
  renderAll();
}

/* ---------- toasts ---------- */
function toast(msg){
  var d=document.createElement('div');
  d.className='toast';
  d.innerHTML='<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg><span></span>';
  d.querySelector('span').textContent=msg;
  el.toasts.appendChild(d);
  /* Two at a time. Filling a whole house fired one per room and the stack
     sat over the bottom of the plan for the best part of ten seconds. */
  while(el.toasts.children.length>2) el.toasts.firstChild.remove();
  setTimeout(function(){d.remove();},1900);
}

/* ============================================================
   View transform
   ============================================================ */
/* Fixed zoom stops, so pressing + or − moves a predictable amount
   instead of drifting to odd percentages. */
var ZOOM_STOPS=[0.1,0.15,0.25,0.35,0.5,0.75,1,1.5,2,3,4,6,8];
function zoomStep(cur,dir){
  var i,next;
  if(dir>0){
    for(i=0;i<ZOOM_STOPS.length;i++) if(ZOOM_STOPS[i]>cur+1e-4) return ZOOM_STOPS[i];
    return ZOOM_STOPS[ZOOM_STOPS.length-1];
  }
  for(i=ZOOM_STOPS.length-1;i>=0;i--) if(ZOOM_STOPS[i]<cur-1e-4) return ZOOM_STOPS[i];
  return ZOOM_STOPS[0];
}
/* The plan can never be pushed fully off screen — a strip always stays visible
   so nobody has to work out how to get it back. */
var KEEP=90;
function clampPan(x,y,zoom,pw,ph,cw,ch){
  var w=pw*zoom, h=ph*zoom;
  return {x:Math.min(cw-KEEP, Math.max(KEEP-w, x)),
          y:Math.min(ch-KEEP, Math.max(KEEP-h, y))};
}
/* Trackpad pinch arrives as a wheel event with ctrlKey set. Everything else
   scrolls the plan, which is what people expect from a document. */
function wheelIntent(e){ return (e.ctrlKey||e.metaKey)?'zoom':'pan'; }
function applyView(){
  var r=el.canvas.getBoundingClientRect();
  if(r.width&&r.height){
    var c=clampPan(S.panX,S.panY,S.zoom,S.plan.w,S.plan.h,r.width,r.height);
    S.panX=c.x;S.panY=c.y;
  }
  el.sheet.style.width=S.plan.w+'px';
  el.sheet.style.height=S.plan.h+'px';
  el.sheet.style.transform='translate('+S.panX+'px,'+S.panY+'px) scale('+S.zoom+')';
  el.ov.setAttribute('viewBox','0 0 '+S.plan.w+' '+S.plan.h);
  el.zoomv.textContent=Math.round(S.zoom*100)+'%';
  // Symbols and labels are sized in screen terms, so they redraw when the zoom
  // moves. Coalesced into one frame so a pinch does not redraw per event.
  if(S.zoom!==lastZoom){ lastZoom=S.zoom; scheduleFxRedraw(); }
}
function fitBox(){
  var c=S.plan.content;
  return (c&&c.w>20&&c.h>20) ? c : {x:0,y:0,w:S.plan.w,h:S.plan.h};
}
function fitView(){
  var r=el.canvas.getBoundingClientRect();
  if(!r.width||!r.height) return;
  var b=fitBox();
  var z=Math.min(r.width/b.w, r.height/b.h)*0.94;
  S.zoom=clamp(z,0.02,8);
  S.panX=(r.width - b.w*S.zoom)/2 - b.x*S.zoom;
  S.panY=(r.height - b.h*S.zoom)/2 - b.y*S.zoom;
  applyView();
}
function zoomTo(z,cx,cy){
  var r=el.canvas.getBoundingClientRect();
  if(cx==null){cx=r.left+r.width/2;cy=r.top+r.height/2;}
  var px=(cx-r.left-S.panX)/S.zoom, py=(cy-r.top-S.panY)/S.zoom;
  z=clamp(z,0.1,8);
  S.panX-= px*(z-S.zoom); S.panY-= py*(z-S.zoom);
  S.zoom=z; applyView();
}
function zoomAt(factor,cx,cy){ zoomTo(S.zoom*factor,cx,cy); }
function zoomStepBtn(dir){ zoomTo(zoomStep(S.zoom,dir)); }
function toImg(e){
  var r=el.sheet.getBoundingClientRect();
  return {x:(e.clientX-r.left)/S.zoom, y:(e.clientY-r.top)/S.zoom};
}
function m2px(m){return S.mpp? m/S.mpp : m*60;}   // 60px/m fallback before calibration

/* ============================================================
   Rendering
   ============================================================ */
function roomOf(f){
  for(var i=S.rooms.length-1;i>=0;i--) if(pointInRect(f.x,f.y,S.rooms[i])) return S.rooms[i];
  return null;
}
function roomAreaM2(r){
  if(!S.mpp) return null;
  return (r.w*S.mpp)*(r.h*S.mpp);
}

function renderPlan(){
  if(S.plan.loaded){
    el.img.hidden=false;
    var src=activePlanSrc();
    if(src&&el.img.getAttribute('src')!==src) el.img.src=src;
    el.blank.style.display='none';
    el.blankstate.style.display='none';
  }else{
    el.img.hidden=true; el.blank.style.display='block';
    el.blankstate.style.display=S.fixtures.length||S.rooms.length?'none':'grid';
  }
  renderGrid();
  applyView();
}

/* A layout grid over the plan: half-metre lines with a heavier line on the
   metre once the scale is set, or a plain 50 px grid before it is. */
function renderGrid(){
  var g=el.gGrid; if(!g) return;
  g.textContent='';
  if(!S.showGrid||!S.plan.loaded) return;
  var w=S.plan.w,h=S.plan.h;
  var minor=S.mpp?(0.5/S.mpp):50, major=S.mpp?(1/S.mpp):100;
  while(minor<8){minor*=2;major*=2;}     /* keep a coarse plan from becoming a moiré */
  function lines(step,sw,op){
    var out='',x,y;
    for(x=step;x<w;x+=step) out+='<line x1="'+x.toFixed(1)+'" y1="0" x2="'+x.toFixed(1)+'" y2="'+h+'" stroke="#2C6B45" stroke-width="'+sw+'" stroke-opacity="'+op+'"/>';
    for(y=step;y<h;y+=step) out+='<line x1="0" y1="'+y.toFixed(1)+'" x2="'+w+'" y2="'+y.toFixed(1)+'" stroke="#2C6B45" stroke-width="'+sw+'" stroke-opacity="'+op+'"/>';
    return out;
  }
  g.innerHTML=lines(minor,0.6,0.14)+lines(major,1.2,0.28);
}

function renderRooms(){
  var g=el.gRooms; g.textContent='';
  S.rooms.forEach(function(r){
    var rect=document.createElementNS(svgns,'rect');
    rect.setAttribute('x',r.x);rect.setAttribute('y',r.y);
    rect.setAttribute('width',r.w);rect.setAttribute('height',r.h);
    /* No name tags on the plan any more - the plan shows the plan, and the
       room's name, size and fittings live in the rail's room list. Clicking
       a room there highlights its box here (S.hiRoom). */
    rect.setAttribute('class','room-rect'+(S.hiRoom===r.id?' hi':''));
    rect.setAttribute('data-room',r.id);
    g.appendChild(rect);
  });
}

// Plan symbols by fitting type, so a printed plan reads like a lighting drawing
// rather than a page of identical dots.
function symbolFor(cat,p){
  /* A pendant and a wall light are not ceiling discs, so they are drawn as
     what they are. Both are decided by the product, not the category - a
     pendant the customer supplies is filed under 'ceiling' like everything
     else surface mounted. */
  if(p && /^OWN-PENDANT/.test(p.id||'')) return 'pendant';
  if(isWallLight(p)) return 'wall';
  if(cat==='batten'||cat==='strip'||cat==='track') return 'bar';
  if(cat==='fans') return 'fan';
  if(cat==='sensors') return 'tri';
  if(cat==='flood'||cat==='outdoor'||cat==='landscape'||cat==='highbay'||
     cat==='industrial'||cat==='emergency'||cat==='transformers') return 'square';
  return 'round';
}
/* Symbol strokes are authored in plan units, but the sheet is CSS-scaled by the
   zoom — so a 1.4-unit line drew 0.7px at 50% and 2.8px at 200%, and the
   fittings thinned out to nothing exactly when you zoomed out to see the whole
   plan. Dividing every stroke-width through by the zoom once, here, keeps the
   linework the same weight on screen at any zoom. */
function scaleStrokes(svg, z){
  if(!z || z===1) return svg;
  return svg.replace(/stroke-width="([\d.]+)"/g, function(m,w){
    return 'stroke-width="'+(parseFloat(w)/z).toFixed(2)+'"';
  });
}
function symbolSvg(shape,x,y,r,col,p,rot){
  col = col || FX_COLOURS.other;
  var ink=col.ink, fill=col.fill;
  if(shape==='pendant') return pendantSymbol(x,y,r,ink,fill,p);
  if(shape==='wall')    return wallSymbol(x,y,r,ink,fill,p,rot);
  if(shape==='bar')
    return '<rect x="'+(x-r*2.2)+'" y="'+(y-r*0.55)+'" width="'+(r*4.4)+'" height="'+(r*1.1)+'" rx="'+(r*0.25)+'" fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4"/>'+
           '<line x1="'+(x-r*1.6)+'" y1="'+y+'" x2="'+(x+r*1.6)+'" y2="'+y+'" stroke="'+ink+'" stroke-width="1.1"/>';
  if(shape==='square')
    return '<rect x="'+(x-r)+'" y="'+(y-r)+'" width="'+(r*2)+'" height="'+(r*2)+'" fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4"/>'+
           '<circle cx="'+x+'" cy="'+y+'" r="'+(r*0.3)+'" fill="'+ink+'"/>';
  if(shape==='tri')
    return '<polygon points="'+x+','+(y-r*1.15)+' '+(x+r)+','+(y+r*0.8)+' '+(x-r)+','+(y+r*0.8)+'" fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4"/>';
  if(shape==='fan') return fanSymbol(x,y,r,ink,fill,p);
  /* Downlights: a ring for the fitting and a solid dot for the lamp, the way
     they're drawn on an electrical plan. Two elements, not three — the middle
     ring added nothing except noise at plan scale. */
  return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4"/>'+
         '<circle cx="'+x+'" cy="'+y+'" r="'+Math.max(1.5,r*0.34).toFixed(2)+'" fill="'+ink+'"/>';
}
/* ---------- the customer's own pendant ----------
   A pendant is the one fitting on a plan that hangs, so it is drawn from the
   side rather than as another disc: ceiling canopy, a drop, and a shade with
   the light under it. Anything drawn as a circle here just became a fourth
   kind of downlight and the electrician had to read the label to find it. */
function pendantSymbol(x,y,r,ink,fill,p){
  var R=r*1.35;
  var capW=R*0.86, capH=R*0.20;          /* ceiling canopy */
  var topY=y-R*1.02;                     /* where it meets the ceiling */
  var shadeY=y+R*0.30;                   /* the widest point of the shade */
  var shadeW=R*1.10;
  var out='';
  /* the ceiling line it hangs off, so the drop reads as a drop */
  out+='<line x1="'+(x-capW).toFixed(2)+'" y1="'+topY.toFixed(2)+'" x2="'+(x+capW).toFixed(2)+'" y2="'+topY.toFixed(2)+'" stroke="'+ink+'" stroke-width="1.1" stroke-opacity="0.55"/>';
  /* canopy */
  out+='<rect x="'+(x-capW*0.52).toFixed(2)+'" y="'+topY.toFixed(2)+'" width="'+(capW*1.04).toFixed(2)+'" height="'+capH.toFixed(2)+'" rx="'+(capH*0.4).toFixed(2)+'" fill="'+fill+'" stroke="'+ink+'" stroke-width="1.2"/>';
  /* the drop */
  out+='<line x1="'+x+'" y1="'+(topY+capH).toFixed(2)+'" x2="'+x+'" y2="'+(shadeY-R*0.62).toFixed(2)+'" stroke="'+ink+'" stroke-width="1.3"/>';
  /* the glow the shade throws downward, so it reads as a light on the plan */
  out+='<path d="M '+(x-shadeW*0.92).toFixed(2)+' '+(shadeY+R*0.06).toFixed(2)+
       ' L '+(x-shadeW*1.5).toFixed(2)+' '+(shadeY+R*1.5).toFixed(2)+
       ' L '+(x+shadeW*1.5).toFixed(2)+' '+(shadeY+R*1.5).toFixed(2)+
       ' L '+(x+shadeW*0.92).toFixed(2)+' '+(shadeY+R*0.06).toFixed(2)+' Z" fill="#FFD98A" fill-opacity="0.28"/>';
  /* the shade: a tapered cone, wider at the bottom, the way a pendant reads */
  out+='<path d="M '+(x-shadeW*0.30).toFixed(2)+' '+(shadeY-R*0.62).toFixed(2)+
       ' L '+(x+shadeW*0.30).toFixed(2)+' '+(shadeY-R*0.62).toFixed(2)+
       ' L '+(x+shadeW*0.92).toFixed(2)+' '+(shadeY+R*0.06).toFixed(2)+
       ' L '+(x-shadeW*0.92).toFixed(2)+' '+(shadeY+R*0.06).toFixed(2)+' Z" '+
       'fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4" stroke-linejoin="round"/>';
  /* the lamp under the shade */
  out+='<circle cx="'+x+'" cy="'+(shadeY+R*0.20).toFixed(2)+'" r="'+Math.max(1.6,R*0.19).toFixed(2)+'" fill="#FFF3C8" stroke="'+ink+'" stroke-width="1"/>';
  return out;
}

/* ---------- outdoor wall light ----------
   A wall light is mounted on a wall and throws forward, so it is drawn as a
   plate against the wall with a 180 deg spread in front of it and nothing
   behind. rot is the compass bearing the light faces, in degrees, 0 = up the
   plan. Drawing it as a disc implied it lit the wall it is bolted to. */
function wallSymbol(x,y,r,ink,fill,p,rot){
  var a=(typeof rot==='number'?rot:0)-90;      /* SVG angles run from east */
  var R=r*1.25, rad=Math.PI/180;
  function pt(deg,d){ return [(x+Math.cos(deg*rad)*d).toFixed(2),(y+Math.sin(deg*rad)*d).toFixed(2)]; }
  var out='';
  /* the 180 deg wash in front - a half disc, flat edge on the wall */
  var spread=R*2.6;
  var s1=pt(a-90,spread), s2=pt(a+90,spread);
  out+='<path d="M '+s1[0]+' '+s1[1]+' A '+spread.toFixed(2)+' '+spread.toFixed(2)+' 0 0 1 '+s2[0]+' '+s2[1]+' Z" '+
       'fill="'+fill+'" fill-opacity="0.20" stroke="'+ink+'" stroke-opacity="0.30" stroke-width="0.9" stroke-dasharray="4 4"/>';
  /* the wall it is bolted to: a solid bar across the back */
  var w1=pt(a-90,R*1.05), w2=pt(a+90,R*1.05);
  out+='<line x1="'+w1[0]+'" y1="'+w1[1]+'" x2="'+w2[0]+'" y2="'+w2[1]+'" stroke="'+ink+'" stroke-width="2.2" stroke-linecap="round"/>';
  /* the fitting body, sitting proud of the wall on the lit side */
  var b1=pt(a-90,R*0.60), b2=pt(a+90,R*0.60);
  var f1=pt(a-62,R*0.95), f2=pt(a+62,R*0.95);
  out+='<path d="M '+b1[0]+' '+b1[1]+' L '+f1[0]+' '+f1[1]+' L '+f2[0]+' '+f2[1]+' L '+b2[0]+' '+b2[1]+' Z" '+
       'fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4" stroke-linejoin="round"/>';
  /* the direction it throws, so the plan says which way round it goes */
  var tip=pt(a,R*1.75), t1=pt(a-16,R*1.25), t2=pt(a+16,R*1.25);
  out+='<path d="M '+t1[0]+' '+t1[1]+' L '+tip[0]+' '+tip[1]+' L '+t2[0]+' '+t2[1]+'" '+
       'fill="none" stroke="'+ink+'" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>';
  return out;
}

/* A ceiling fan drawn as a ceiling fan: the real number of blades, swept
   round the hub, inside a dashed ring at the blade sweep. The old symbol was a
   plain circle with a cross through it, which read as a big blank disc sitting
   on top of the plan and told you nothing about what was in the room.
   Exhaust fans are not ceiling fans, so they keep a small vented square. */
function fanSymbol(x,y,r,ink,fill,p){
  var name=(p&&p.name)||'';
  if(isBathroomFitting(p)){
    var g=r*0.95;
    var s='<rect x="'+(x-g)+'" y="'+(y-g)+'" width="'+(g*2)+'" height="'+(g*2)+'" rx="'+(g*0.22)+'" fill="'+fill+'" stroke="'+ink+'" stroke-width="1.4"/>';
    for(var k=-1;k<=1;k++)
      s+='<line x1="'+(x-g*0.6)+'" y1="'+(y+k*g*0.42)+'" x2="'+(x+g*0.6)+'" y2="'+(y+k*g*0.42)+'" stroke="'+ink+'" stroke-width="1.1"/>';
    return s;
  }
  var m=name.match(/(\d)\s*-?\s*blade/i);
  var n=m?parseInt(m[1],10):4;
  if(!(n>=2&&n<=8)) n=4;
  var hasLight=/with cct light/i.test(name)||/-LI$/i.test((p&&p.id)||'');
  var R=r*1.5, hub=r*0.30;
  /* faint blade-sweep ring, so the fan reads against the room it sits in */
  var out='<circle cx="'+x+'" cy="'+y+'" r="'+R.toFixed(2)+'" fill="none" stroke="'+ink+'" '+
          'stroke-opacity="0.4" stroke-width="1" stroke-dasharray="'+(r*0.28).toFixed(2)+' '+(r*0.26).toFixed(2)+'"/>';
  /* Elongated petal blades, the real number for the fitting, swept round the
     hub. Softer charcoal than pure black, so the mark prints like a drawing
     rather than a blot. */
  var Lc=R*0.55, rx=(R*0.52).toFixed(2), ry=(R*0.17).toFixed(2);
  for(var i=0;i<n;i++){
    var deg=i*360/n - 90;
    var bx=(x+Lc*Math.cos(deg*Math.PI/180)).toFixed(2);
    var by=(y+Lc*Math.sin(deg*Math.PI/180)).toFixed(2);
    out+='<ellipse class="fx-blade" cx="'+bx+'" cy="'+by+'" rx="'+rx+'" ry="'+ry+'" '+
         'transform="rotate('+deg.toFixed(2)+' '+bx+' '+by+')" '+
         'fill="#2E2E27" stroke="#15170F" stroke-width="0.8"/>';
  }
  /* motor housing under the hub, so the centre reads as a fitting */
  out+='<circle cx="'+x+'" cy="'+y+'" r="'+(hub*1.55).toFixed(2)+'" fill="#EDEBE0" stroke="#15170F" stroke-width="1"/>';
  if(hasLight){
    /* The light in the fan, drawn as a light: a warm glow round a lamp,
       with the wattage written under the sweep so the plan says what it is. */
    var lw=(String((p&&p.watts)||'').match(/(\d+)\s*[wW]/)||[])[1]||'24';
    out+='<circle cx="'+x+'" cy="'+y+'" r="'+(hub*2.4).toFixed(2)+'" fill="#FFD98A" fill-opacity="0.30"/>'+
         '<circle cx="'+x+'" cy="'+y+'" r="'+(hub*1.6).toFixed(2)+'" fill="#FFE3A1" fill-opacity="0.55"/>'+
         '<circle cx="'+x+'" cy="'+y+'" r="'+hub.toFixed(2)+'" fill="#FFF3C8" stroke="#B8860B" stroke-width="1.3"/>'+
         '<circle cx="'+x+'" cy="'+y+'" r="'+(hub*0.34).toFixed(2)+'" fill="#E0A82E"/>'+
         '<text class="fx-lab" x="'+x+'" y="'+(y+R+Math.max(8,r*0.62)).toFixed(2)+'" text-anchor="middle" '+
           'font-size="'+Math.max(7,r*0.42).toFixed(1)+'">'+lw+'W LIGHT</text>';
  }else{
    /* no light in this one - a plain motor spindle, so the two versions
       tell apart at a glance */
    out+='<circle cx="'+x+'" cy="'+y+'" r="'+hub.toFixed(2)+'" fill="#4A4A42" stroke="#15170F" stroke-width="1.2"/>';
  }
  return out;
}

/* ---------- colour coding ----------
   Each fitting type gets its own colour so a finished plan reads at a glance
   and prints legibly. Colours are picked to stay distinct in greyscale too. */
var FX_COLOURS={
  lowglare : {ink:'#A85B12', fill:'#F4B056', name:'Low glare downlight'},
  standard : {ink:'#B8860B', fill:'#F2D98C', name:'Standard downlight'},
  smart    : {ink:'#2C6B45', fill:'#8FD3A8', name:'Smart / RGBW downlight'},
  batten   : {ink:'#1F5C8B', fill:'#A8CBE8', name:'Batten'},
  strip    : {ink:'#8B3A62', fill:'#E8B6CF', name:'Strip / track'},
  fan      : {ink:'#5A5A4A', fill:'#D2D2C4', name:'Ceiling fan'},
  sensor   : {ink:'#8B4513', fill:'#E8C4A0', name:'Sensor'},
  wall     : {ink:'#A8701E', fill:'#F4C26B', name:'Outdoor wall light'},
  pendant  : {ink:'#8C6D1F', fill:'#F2D98C', name:'Pendant'},
  other    : {ink:'#4A4A42', fill:'#D8D8CE', name:'Other fitting'}
};
function fxKind(p){
  if(!p) return 'other';
  var c=p.cat, n=(p.name||'').toLowerCase();
  /* Wall lights and pendants glow warm like every other light — they were
     falling through to the grey 'other' bucket, which is why they never
     looked like they were shining. */
  if(isWallLight(p)) return 'wall';
  if(/^OWN-PENDANT/.test(p.id||'')) return 'pendant';
  if(c==='batten') return 'batten';
  if(c==='strip'||c==='track') return 'strip';
  if(c==='fans') return 'fan';
  if(c==='sensors') return 'sensor';
  if(c==='downlights'||c==='star'){
    if(/rgbw|smart|tuya|wifi|bluetooth/.test(n)) return 'smart';
    return fittingClass(p)==='lg' ? 'lowglare' : 'standard';
  }
  return 'other';
}
function fxColour(p){ return FX_COLOURS[fxKind(p)]||FX_COLOURS.other; }

/* Which kinds are actually on the plan right now — drives the legend. */
function fxKindsUsed(){
  var seen={}, out=[];
  S.fixtures.forEach(function(f){
    var p=byId(f.pid); if(!p) return;
    var k=fxKind(p);
    if(!seen[k]){ seen[k]=1; out.push(k); }
  });
  return out;
}

/* Physical length of a linear fitting, in metres, read off the product where
   we can and defaulting to the 1.2 m T40 batten we actually stock. */
function fittingLengthM(p){
  var t=((p&&p.name)||'')+' '+((p&&p.id)||'');
  var m=t.match(/(\d(?:\.\d+)?)\s*m\b/i);
  if(m) return parseFloat(m[1]);
  if(/1200|\b4ft\b/i.test(t)) return 1.2;
  if(/900|\b3ft\b/i.test(t))  return 0.9;
  if(/1500|\b5ft\b/i.test(t)) return 1.5;
  if(p&&p.cat==='batten') return 1.2;
  return 1.0;                       /* strip / track run, per metre */
}

function renderFixtures(){
  var pools='', marks='', clips='';
  var labelSize=11/S.zoom;

  S.fixtures.forEach(function(f){
    var p=byId(f.pid); if(!p) return;
    var beam=parseBeam(p.beam);
    /* Wall lights and customer pendants often carry no usable beam figure in
       the catalogue, which left them glowless on the plan. Fall back to the
       defaults our team quotes: 120° for a wall light, 110° for a pendant —
       so they shine like everything else. */
    if(!beam && isWallLight(p)) beam=120;
    if(!beam && /^OWN-PENDANT/.test(p.id||'')) beam=110;
    var cut=parseCutout(p)||90;
    /* A 90 mm cut-out at a whole-house zoom is about four pixels across, which
       is not a symbol any more. Draw it to scale until scale stops being
       readable, then hold a legible floor. */
    var rPix=Math.max(7.5/S.zoom, m2px(cut/1000)/2);
    /* Star lights are pinpricks by design - a run of them drawn at downlight
       size read as a row of downlights. Kept small enough that a run of six
       reads as a string of stars, not a row of downlights. */
    if(isStarLight(p)) rPix=Math.max(3/S.zoom, rPix*0.42);
    /* A batten is a 1.2 m tube, not a 90 mm cut-out. Drawing it from the
       cut-out made it a stub on the plan and gave no sense of how much of the
       garage it actually covers. The bar symbol is 4.4r long, so work back
       from the real fitting length. */
    if(symbolFor(p.cat,p)==='bar'){
      var runM=fittingLengthM(p);
      rPix=Math.max(4/S.zoom, m2px(runM)/4.4);
    }
    /* A fan is drawn at its blade sweep, so you can see whether it actually
       fits the room and how close it comes to the downlights. The fan symbol
       spans 3r, so work back from the real sweep. */
    if(symbolFor(p.cat,p)==='fan'){
      rPix=Math.max(6/S.zoom, m2px(fanSweepM(p))/3);
    }
    var on=S.sel.indexOf(f.id)>-1;
    var col=fxColour(p);

    if(S.showPools){
      var d=poolDiameter(S.ceiling,beam);
      if(d){
        var pr=m2px(d/2);
        /* Light stops at the walls. If the fitting sits in a room, clip its
           pool to that room's rectangle so nothing spills onto the plan
           outside — which was both wrong and ugly. */
        var room=roomOf(f), clipRef='';
        if(room){
          var cid='pclip'+f.id;
          clips+='<clipPath id="'+cid+'"><rect x="'+room.x+'" y="'+room.y+'" width="'+room.w+'" height="'+room.h+'"/></clipPath>';
          clipRef=' clip-path="url(#'+cid+')"';
        }
        /* Light falls off; it doesn't stop at a line. Each pool is a radial
           gradient - bright under the fitting, fading to nothing at the edge -
           so overlapping fittings build up the way real light does. A faint
           dashed ring marks the useful edge for anyone reading it as a plan. */
        var gid='pg'+fxKind(p);
        /* A wall light throws forward only. Drawing it as a full disc put
           half its light inside the wall it is bolted to, which is both wrong
           and the thing that made outdoor plans look over-lit. */
        if(isWallLight(p)){
          var wa=((typeof f.rot==='number'?f.rot:0)-90)*Math.PI/180;
          var hx1=(f.x+Math.cos(wa-Math.PI/2)*pr).toFixed(1), hy1=(f.y+Math.sin(wa-Math.PI/2)*pr).toFixed(1);
          var hx2=(f.x+Math.cos(wa+Math.PI/2)*pr).toFixed(1), hy2=(f.y+Math.sin(wa+Math.PI/2)*pr).toFixed(1);
          var half='M '+hx1+' '+hy1+' A '+pr.toFixed(1)+' '+pr.toFixed(1)+' 0 0 1 '+hx2+' '+hy2+' Z';
          pools+='<g'+clipRef+'>'+
            '<path d="'+half+'" fill="url(#'+gid+')"/>'+
            '<path class="fx-pool" d="'+half+'" fill="none" stroke="'+col.ink+'" stroke-opacity="0.22" '+
              'stroke-width="'+(1.1/S.zoom).toFixed(2)+'" stroke-dasharray="'+(5/S.zoom).toFixed(1)+' '+(4/S.zoom).toFixed(1)+'"/>'+
          '</g>';
        }else{
          pools+='<g'+clipRef+'>'+
            '<circle cx="'+f.x+'" cy="'+f.y+'" r="'+pr.toFixed(1)+'" fill="url(#'+gid+')"/>'+
            '<circle class="fx-pool" cx="'+f.x+'" cy="'+f.y+'" r="'+pr.toFixed(1)+'" '+
              'fill="none" stroke="'+col.ink+'" stroke-opacity="0.22" '+
              'stroke-width="'+(1.1/S.zoom).toFixed(2)+'" stroke-dasharray="'+(5/S.zoom).toFixed(1)+' '+(4/S.zoom).toFixed(1)+'"/>'+
          '</g>';
        }
      }
    }

    /* A selected wall light grows an aim handle: a stalk out in front of it
       with a grab dot on the end. Drag the dot and the light turns to follow,
       which is the only way to aim one on a phone - [ and ] need a keyboard. */
    var aim='';
    if(on && isWallLight(p)){
      var ah=aimHandlePt(f), aw=Math.max(1.4,2/S.zoom), ar=Math.max(5.5,7.5/S.zoom);
      /* An arrow head, not a second dot. Two dots of the same size read as two
         lights, and people were dragging the wrong one. The arrow says which
         way it is pointing and that it is the thing you turn. */
      var adx=ah.x-f.x, ady=ah.y-f.y, alen=Math.hypot(adx,ady)||1;
      var ux=adx/alen, uy=ady/alen, pxv=-uy, pyv=ux;
      var tipx=ah.x+ux*ar*0.9, tipy=ah.y+uy*ar*0.9;
      var b1x=ah.x-ux*ar*0.7+pxv*ar*0.85, b1y=ah.y-uy*ar*0.7+pyv*ar*0.85;
      var b2x=ah.x-ux*ar*0.7-pxv*ar*0.85, b2y=ah.y-uy*ar*0.7-pyv*ar*0.85;
      aim='<g class="fx-aim" data-aim="'+f.id+'">'+
        '<line x1="'+f.x+'" y1="'+f.y+'" x2="'+(ah.x-ux*ar*0.6).toFixed(1)+'" y2="'+(ah.y-uy*ar*0.6).toFixed(1)+'" '+
          'stroke="#00c400" stroke-width="'+aw.toFixed(2)+'" stroke-linecap="round"/>'+
        '<polygon points="'+tipx.toFixed(1)+','+tipy.toFixed(1)+' '+
          b1x.toFixed(1)+','+b1y.toFixed(1)+' '+b2x.toFixed(1)+','+b2y.toFixed(1)+'" '+
          'fill="#00c400" stroke="#00c400" stroke-width="'+aw.toFixed(2)+'" stroke-linejoin="round"/>'+
        '<circle cx="'+ah.x.toFixed(1)+'" cy="'+ah.y.toFixed(1)+'" r="'+(ar*2.4).toFixed(1)+'" fill="transparent"/>'+
      '</g>';
    }
    marks+='<g class="fx'+(on?' sel':'')+'" data-id="'+f.id+'">'+aim+
      (on?'<circle class="fx-ring" cx="'+f.x+'" cy="'+f.y+'" r="'+(rPix+7)+'"/>':'')+
      scaleStrokes(symbolSvg(symbolFor(p.cat,p),f.x,f.y,rPix,col,p,f.rot), S.zoom)+
      (S.showLabels?'<text class="fx-lab" x="'+(f.x+rPix+3)+'" y="'+(f.y-rPix-2)+'" font-size="'+labelSize+'">'+esc(f.pid)+'</text>':'')+
      '<circle class="fx-hit" cx="'+f.x+'" cy="'+f.y+'" r="'+(rPix+9/S.zoom)+'" fill="transparent"/>'+
    '</g>';
  });

  /* Each group draws a faint string through its members, in placement order -
     that is the wire of the feature run, and it is what tells you these dots
     belong together before you ever click one. */
  var strings={}, stringSvg='';
  S.fixtures.forEach(function(f){ if(f.grp){(strings[f.grp]=strings[f.grp]||[]).push(f);} });
  Object.keys(strings).forEach(function(g){
    var run=strings[g]; if(run.length<2) return;
    var pts=run.map(function(f){return f.x+','+f.y;}).join(' ');
    stringSvg+='<polyline class="grp-string" pointer-events="none" points="'+pts+'" fill="none" stroke="#B8860B" stroke-opacity="0.45" '+
      'stroke-width="'+(1.2/S.zoom).toFixed(2)+'" stroke-dasharray="'+(3/S.zoom).toFixed(1)+' '+(4/S.zoom).toFixed(1)+'"/>';
  });
  marks=stringSvg+marks;

  var grads='';
  Object.keys(FX_COLOURS).forEach(function(k){
    var c=FX_COLOURS[k];
    /* These pools overlap by design — that is how you read whether a room is
       evenly lit. At the old opacities six overlapping downlights summed to a
       flat orange block with no readable edges, which told you nothing. Each
       pool is now light enough that four or five can stack and still leave the
       plan legible underneath, and the fall-off is weighted to the centre so
       the bright spot under each fitting still reads. */
    grads+='<radialGradient id="pg'+k+'" cx="50%" cy="50%" r="50%">'+
      '<stop offset="0%" stop-color="'+c.fill+'" stop-opacity="0.30"/>'+
      '<stop offset="30%" stop-color="'+c.fill+'" stop-opacity="0.19"/>'+
      '<stop offset="62%" stop-color="'+c.fill+'" stop-opacity="0.085"/>'+
      '<stop offset="100%" stop-color="'+c.fill+'" stop-opacity="0"/>'+
    '</radialGradient>';
  });
  el.gPools.innerHTML='<defs>'+grads+clips+'</defs>'+pools;
  el.gFx.innerHTML=marks;
  renderLegend();
}

/* A plan that colour-codes needs a key, or the colours are just decoration. */
function renderLegend(){
  var host=document.getElementById('fxlegend');
  if(!host) return;
  var kinds=fxKindsUsed();
  if(!kinds.length || !S.fixtures.length){ host.hidden=true; host.innerHTML=''; return; }
  host.hidden=false;
  host.innerHTML='<div class="lg-t">Legend</div>'+kinds.map(function(k){
    var c=FX_COLOURS[k];
    var n=S.fixtures.filter(function(f){var p=byId(f.pid);return p&&fxKind(p)===k;}).length;
    return '<div class="lg-row">'+
      '<span class="lg-sw" style="background:'+c.fill+';border-color:'+c.ink+'"></span>'+
      '<span class="lg-n">'+esc(c.name)+'</span>'+
      '<b>'+n+'</b></div>';
  }).join('');
}

function renderReadout(){
  var parts=[];
  parts.push('SCALE <b>'+(S.mpp?(1/S.mpp).toFixed(1)+' px/m':'not set')+'</b>');
  parts.push('CEILING <b>'+S.ceiling.toFixed(2)+' m</b>');
  parts.push('FITTINGS <b>'+S.fixtures.length+'</b>');
  if(S.sel.length) parts.push('SELECTED <b>'+S.sel.length+'</b>');
  el.readout.innerHTML=parts.map(function(p){return '<span>'+p+'</span>';}).join('');
  renderTools();
}

// Only surface controls that can actually do something right now.
function toolState(){
  var hasPlan=!!(S.plan.loaded||S.fixtures.length||S.rooms.length);
  var hasFx=S.fixtures.length>0;
  var selFx=S.fixtures.filter(function(f){return S.sel.indexOf(f.id)>-1;});
  return {view:hasPlan,show:hasFx,
          undo:S.undo.length>0, del:S.sel.length>0, clear:hasFx,
          /* The turn controls only appear when an outdoor wall light is
             selected - they do nothing for a downlight, and a button that
             does nothing is worse than no button. */
          aim:selFx.some(function(f){return isWallLight(byId(f.pid));}),
          group:selFx.length>1,
          ungroup:selFx.some(function(f){return f.grp;}),
          edit:(S.undo.length>0||S.sel.length>0||hasFx),
          hint:!hasPlan};
}
function renderTools(){
  var t=toolState();
  var nh=document.getElementById('navhint');
  if(nh) nh.hidden=!(S.plan.loaded&&S.rooms.length>0&&!S.hintSeen);
  [['grp-view','view'],['grp-show','show'],['grp-edit','edit'],
   ['t-undo','undo'],['t-del','del'],['t-clear','clear'],
   ['t-rotl','aim'],['t-rotr','aim'],['t-aimreset','aim'],
   ['t-group','group'],['t-ungroup','ungroup'],['toolhint','hint']].forEach(function(pair){
    var el=document.getElementById(pair[0]);
    if(el) el.hidden=!t[pair[1]];
  });
}

var RATIOS=[20,25,50,75,100,125,150,200,250,500];
function renderPaper(){
  var w=document.getElementById('paperbox'); if(!w) return;
  if(!S.paper||!S.plan.loaded){
    w.innerHTML='<details class="whyd" style="margin:0 0 12px"><summary>Got a PDF?</summary>'+
      '<div class="teach">Load a PDF and the app reads the page size and works the scale out for '+
      'you. For a photo or a screenshot, put the 2 points on a door as above.</div></details>';
    return;
  }
  var nm=paperName(S.paper.wMm,S.paper.hMm);
  var mpp=mppFromPaper(S.paper.wMm,S.ratio,S.plan.w);
  var coverW=(S.plan.w*mpp), coverH=(S.plan.h*mpp);
  w.innerHTML=
    '<div class="q"><label class="qlabel">Straight from the PDF</label>'+
    '<ul class="plist" style="margin-bottom:10px">'+
      '<li><span class="k">Page size</span><span class="v">'+(nm?nm+' — ':'')+S.paper.wMm+' × '+S.paper.hMm+' mm</span></li>'+
    '</ul>'+
    '<label class="qlabel" for="ratio">Drawing scale printed on the plan</label>'+
    '<div class="selwrap"><select class="sel" id="ratio">'+
      RATIOS.map(function(r){return '<option value="'+r+'"'+(r===S.ratio?' selected':'')+'>1 : '+r+'</option>';}).join('')+
    '</select></div>'+
    '<div class="teach"><h5>At 1 : '+S.ratio+'</h5>This page covers <b>'+coverW.toFixed(1)+' × '+coverH.toFixed(1)+' m</b>'+
      ' — that is <b>'+(1/mpp).toFixed(1)+' px per metre</b>. If the building looks the wrong size, the ratio is wrong.</div>'+
    '<button type="button" class="act go" id="btn-paper" style="margin-top:10px">Use this scale</button>'+
    '</div>';
  document.getElementById('ratio').onchange=function(){S.ratio=+this.value;renderPaper();};
  document.getElementById('btn-paper').onclick=function(){
    snapshot();
    S.mpp=mppFromPaper(S.paper.wMm,S.ratio,S.plan.w);
    toast('Scale set from the page — 1 m is '+(1/S.mpp).toFixed(1)+' pixels');
    renderAll();openStep(3);
  };
}
// Everything downstream is a guess without a scale, so say so where it matters
// rather than burying it in a paragraph.
function renderScaleWarn(){
  var set=!!S.mpp, needed=S.plan.loaded||S.rooms.length||S.fixtures.length;
  document.querySelectorAll('[data-scalewarn]').forEach(function(w){
    w.hidden = set || !needed;
    if(w.hidden) return;
    w.innerHTML='<b>The scale is not set yet.</b>'+
      '<span>Counts, spacing and fitting sizes are only guesses until it is. It takes about ten seconds.</span>'+
      '<button type="button" class="act pri sm" data-goscale>Set the scale</button>';
  });
  document.querySelectorAll('[data-goscale]').forEach(function(b){
    b.onclick=function(){
      openStep(2);
      var el=document.getElementById('btn-cal');
      if(el){ el.scrollIntoView({block:'nearest'}); el.focus(); }
    };
  });
}

function renderScaleBox(){
  var w=document.getElementById('scalebox'); if(!w) return;
  if(!S.mpp){ w.innerHTML=''; return; }
  /* Getting the scale wrong is the one mistake that quietly ruins everything
     downstream, so there are three ways back to it: drag the points again,
     check a known length with the tape, or type the number straight in. */
  w.innerHTML=
    '<label class="qlabel">Scale in use</label>'+
    '<div class="hint" style="margin:0 0 8px">The plan covers <b>'+(S.plan.w*S.mpp).toFixed(1)+' × '+
      (S.plan.h*S.mpp).toFixed(1)+' m</b>. Does that sound right for this building?'+
      (S.measure?' Last measured: <b>'+S.measure.toFixed(2)+' m</b>.':'')+'</div>'+
    '<button type="button" class="act pri sm" id="btn-redoscale" style="width:100%">Drag the 2 points again</button>'+
    '<button type="button" class="act ghost sm" id="btn-tape" style="width:100%;margin-top:6px">Check a known length with the tape</button>'+
    '<details class="whyd" style="margin-top:8px"><summary>Type the number instead</summary>'+
      '<div class="row2" style="margin-top:8px"><input class="txt" id="pxm" type="number" step="0.1" min="1" value="'+(1/S.mpp).toFixed(1)+'">'+
      '<span class="hint" style="align-self:center">pixels per metre</span></div>'+
    '</details>';
  document.getElementById('pxm').onchange=function(){
    var v=parseFloat(this.value);
    if(v>0){ snapshot(); S.mpp=1/v; renderAll(); toast('Scale adjusted'); }
  };
  document.getElementById('btn-redoscale').onclick=function(){
    openStep(2);
    setTool('scale');
    toast('Drag the 2 red points onto something you know the length of');
  };
  document.getElementById('btn-tape').onclick=function(){ setTool(S.tool==='measure'?'select':'measure'); };
}

/* Steps 01 and 02 are done once, at the start, and then they are just two
   rows in the way of the one you are actually using. Once the plan is in and
   the scale is set they fold away into a single line at the top, which puts
   them back if anything needs changing. */
var setupShown=false;
function renderSetupBar(){
  var bar=document.getElementById('setupbar'); if(!bar) return;
  /* Never while they are still dragging the points - that is the moment the
     whole section used to vanish from under them. */
  var done = S.plan.loaded && !!S.mpp && !setupShown && S.tool!=='scale';
  step(1).classList.toggle('gone',done);
  step(2).classList.toggle('gone',done);
  if(!done){ bar.hidden=true; bar.innerHTML=''; return; }
  bar.hidden=false;
  bar.innerHTML='<span class="sb-t">'+esc(S.plan.name||'Plan loaded')+'</span>'+
    '<span class="sb-v">'+(1/S.mpp).toFixed(1)+' px/m</span>'+
    '<button type="button" class="linkbtn" id="setup-change">Change</button>';
  var b=document.getElementById('setup-change');
  if(b) b.onclick=function(){ setupShown=true; renderSetupBar(); openStep(1); };
}
function renderSteps(){
  $('#st1').textContent=S.plan.loaded?(S.plan.name||'Plan loaded'):'No plan yet';
  step(1).classList.toggle('done',S.plan.loaded);
  $('#st2').textContent=S.mpp?(1/S.mpp).toFixed(1)+' px/m':'Not set';
  step(2).classList.toggle('done',!!S.mpp);
  renderSetupBar();
  var doneRooms=S.rooms.filter(roomIsDone).length;
  $('#st3').textContent=!S.rooms.length ? 'No rooms yet'
    : doneRooms===S.rooms.length ? S.rooms.length+(S.rooms.length===1?' room done':' rooms done')
    : doneRooms+' of '+S.rooms.length+' done';
  step(3).classList.toggle('done',S.rooms.length>0);
  /* Step 4 only counts the extras. What the rooms lit themselves with is the
     rooms' business, and putting it here made this step look compulsory. */
  var extras=extraFixtures().length;
  $('#st4').textContent=extras?extras+' extra':'Optional';
  $('#st4').classList.toggle('opt',!extras);
  step(4).classList.toggle('done',extras>0);
  renderNext();
}
/* Anything not sitting inside a room box, plus anything inside one that is not
   part of the room's own lighting - the strip under the bench, the star lights
   in the alfresco ceiling. */
function extraFixtures(){
  return S.fixtures.filter(function(f){
    var r=roomOf(f);
    return !r || !isRoomLight(f);
  });
}

/* The single next thing to do, in the plainest words there are. */
function nextAction(){
  if(!S.plan.loaded)
    return {n:1,t:'Add your floor plan',
            s:'Drop a photo or a PDF into the box below. No plan handy? Press \u201cUse sample plan\u201d and have a play.'};
  if(!S.mpp)
    return {n:2,t:'Tell it how big',
            s:'Press \u201cPut 2 points on the plan\u201d, then drag the 2 red points across any internal door. That sets the scale.'};
  if(!S.rooms.length)
    return {n:3,t:'Draw your first room',
            s:'Press the black button, then drag a box around one room. The lights go in by themselves.'};
  var unlit=S.rooms.filter(function(r){return !roomIsDone(r);});
  if(unlit.length)
    return {n:3,t:unlit.length===1?'One room still to finish':unlit.length+' rooms still to finish',
            s:'Open the room below and press the green \u201cFill this room\u201d button.'};
  /* Every DRAWN room is lit - but with one or two rooms boxed on a plan that
     almost certainly has more, "that is everything" was telling people to stop
     four rooms early. Keep them drawing until the plan is plausibly covered,
     and always leave the get-your-list path visible as the way out. */
  if(S.rooms.length<3)
    return {n:3,t:(S.rooms.length===1?'First room lit \u2014 box in the next one':'Nice \u2014 keep boxing rooms'),
            s:'Drag a box around the next room, the same way. Boxed every room on the plan? Open step 05 \u2014 your list is ready.'};
  return {n:5,t:'Looks like everything \u2014 get your list',
          s:'Every room you boxed is lit. Still one to do? Just drag a box around it. Otherwise open your list to print it or send it to Greenhse.'};
}
function renderNext(){
  var b=document.getElementById('nextup');
  if(!b) return;
  var a=nextAction();
  document.getElementById('nextup-t').textContent=a.t;
  document.getElementById('nextup-s').innerHTML=a.s;
  b.dataset.step=a.n;
}
function step(n){return document.querySelector('.step[data-step="'+n+'"]');}

function renderAll(){
  renderPlan();renderRooms();renderFixtures();renderReadout();
  renderSteps();renderRoomList();renderDoneRooms();renderBOM();renderPlaceTeach();renderPaper();renderScaleBox();renderScaleWarn();
}

/* ============================================================
   Bill of materials
   ============================================================ */
function bomLines(){
  var map={};
  S.fixtures.forEach(function(f){
    var p=byId(f.pid); if(!p) return;
    if(!map[f.pid]) map[f.pid]={p:p,qty:0,rooms:{}};
    map[f.pid].qty++;
    var r=roomOf(f);
    var key=r?(ROOMS[r.type]||ROOMS.other).label:'Unassigned';
    map[f.pid].rooms[key]=(map[f.pid].rooms[key]||0)+1;
  });
  return Object.keys(map).map(function(k){
    var m=map[k];
    return {id:k,name:m.p.name,sku:m.p.sku||m.p.id,qty:m.qty,
            unit:m.p.price||0,line:Math.round((m.p.price||0)*m.qty*100)/100,
            rooms:m.rooms};
  }).sort(function(a,b){return b.line-a.line;});
}
function bomTotals(lines){
  var ex=lines.reduce(function(a,l){return a+l.line;},0);
  ex=Math.round(ex*100)/100;
  return {ex:ex,inc:incGST(ex),units:lines.reduce(function(a,l){return a+l.qty;},0)};
}

function renderBOM(){
  var lines=bomLines(), t=bomTotals(lines), w=$('#bomwrap');
  if(!lines.length){
    w.innerHTML='<div class="empty">Nothing placed yet.<br>Fittings you drop on the plan land here with live pricing.</div>';
    $('#st5').textContent='$0';
    return;
  }
  var html='<table class="bom"><thead><tr><th colspan="2">Fitting</th><th style="width:34px">Qty</th><th style="width:76px">Total</th></tr></thead><tbody>';
  lines.forEach(function(l){
    var p=byId(l.id);
    var rooms=Object.keys(l.rooms).map(function(k){return k+' ×'+l.rooms[k];}).join(' · ');
    html+='<tr><td class="thumb">'+(p?thumb(p,'th'):'')+'</td>'+
          '<td class="nm">'+esc(l.name)+'<span class="sku">'+esc(l.sku)+' · '+esc(rooms)+'</span></td>'+
          '<td class="qty">'+l.qty+'</td><td>'+money(l.line)+'</td></tr>';
  });
  html+='</tbody></table>';
  html+='<div class="tot"><span>'+t.units+' fittings, ex GST</span><b>'+money(t.ex)+'</b></div>';
  html+='<div class="tot big"><span>Inc GST</span><span>'+money(t.inc)+'</span></div>';
  html+='<div class="hint">Catalogue pricing. Excludes drivers, cable, downlight kits and labour unless you have added them above.</div>';
  w.innerHTML=html;
  $('#st5').textContent=money(t.inc)+' inc';
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

/* ============================================================
   Room list + recommendation
   ============================================================ */
// Best value fitting for a room type, chosen from catalogue figures only.
// Nothing is inferred: if a spec is missing the product is not a candidate.
function bestValue(list){
  return list.slice().sort(function(a,b){
    var la=parseLumens(a.lumens)/a.price, lb=parseLumens(b.lumens)/b.price;
    if(lb!==la) return lb-la;
    return (parseBeam(b.beam)||0)-(parseBeam(a.beam)||0);
  })[0];
}
function recommendProduct(type){
  var brief=ROOMS[type]||ROOMS.other;
  if(!brief.dl){
    var bat=byId('T40-CCT-BATTEN-PRO');
    if(bat) return {p:bat,why:'battens are the right fitting for this space'};
  }
  /* Some rooms have a named answer rather than a best-value calculation:
     a sealed ceiling light in a bathroom, RGBW outdoors. */
  if(brief.rec){
    var named=byId(brief.rec);
    if(named){
      var out={p:named, why:(
        brief.exhaust ? 'sealed, bright enough on its own, and no cut-outs over the shower'
                      : 'warm white most nights, colour when you want it'
      )};
      /* A named answer still has to be right for a wet room. The IP check
         below never ran for a bathroom, because the named product returned
         first - so a fitting with no rating recorded went onto the schedule
         with nothing said about it. */
      if(brief.wet && !named.ip)
        out.warn='No IP rating is recorded against '+named.id+' in the catalogue. '+
                 'Confirm the wet-area rating with Greenhse before ordering.';
      return out;
    }
  }
  var pool=catProducts('downlights');
  var cands=pool.filter(function(p){return parseLumens(p.lumens)&&p.price>0;});
  if(!cands.length) return null;
  if(brief.wet){
    var rated=cands.filter(function(p){return p.ip;});
    if(rated.length) return {p:bestValue(rated),why:'best lumens per dollar with an IP rating recorded'};
    return {p:bestValue(cands),
            why:'best lumens per dollar in the category',
            warn:'No IP rating is recorded against any of these in the catalogue. Confirm the wet-area rating with Greenhse before ordering.'};
  }
  return {p:bestValue(cands),why:'best lumens per dollar in the category'};
}
/* ---------- fans ----------
   A fan with a light IS the room's light. When one goes in, the downlight grid
   comes out - a fan in the middle of a downlight grid gives you shadow flicker
   every time the blades cross a beam, which is the single most common complaint
   we get about new lighting.

   Blade sweep is sized to the room, the way the manufacturers spec them:
   a 52" fan suits rooms up to about 18 m2, a 56" beyond that. */
var FANS={
  small : {id:'AMARI-DC-52-FAN-LI', sweep:1.32, label:'52" 4-blade with CCT light'},
  large : {id:'AMARI-DC-FAN-56-LI', sweep:1.42, label:'56" 5-blade with CCT light'},
  /* The same two fans without the light in them. Pick one of these and the
     room still needs downlights - four low glare, kept clear of the blades. */
  smallNoLight : {id:'AMARI-DC-52-FAN-BW', sweep:1.32, label:'52" 4-blade, no light'},
  largeNoLight : {id:'AMARI-DC-FAN-56-BW', sweep:1.42, label:'56" 5-blade, no light'},
  exhaustSmall:{id:'BLIZZARD-EXHAUST-C',   label:'Exhaust + CCT light, small'},
  exhaustLarge:{id:'BLIZZARD-EXHAUST-C-1', label:'Exhaust + CCT light, large'},
  /* The same two fans with no light in them, for people who would rather have
     a plain extractor and light the room with downlights. */
  exhaustPlainSmall:{id:'BLIZZARD-EXHAUST-S', label:'Exhaust only, small'},
  exhaustPlainLarge:{id:'BLIZZARD-EXHAUST-L', label:'Exhaust only, large'}
};
/* withLight defaults to true so every existing caller keeps its behaviour. */
function fanForRoom(areaM2,withLight){
  var big=areaM2>18;
  if(withLight===false) return byId(big?FANS.largeNoLight.id:FANS.smallNoLight.id);
  return byId(big ? FANS.large.id : FANS.small.id);
}
/* The same pick, but honouring a blade count the customer chose by hand:
   '4' forces the 52" 4-blade, '5' the 56" 5-blade, anything else sizes to
   the room the way the manufacturers spec them. */
function fanForRoomSized(areaM2,withLight,sz){
  if(sz==='4') return byId(withLight===false?FANS.smallNoLight.id:FANS.small.id);
  if(sz==='5') return byId(withLight===false?FANS.largeNoLight.id:FANS.large.id);
  return fanForRoom(areaM2,withLight);
}
/* Any room with a fan in it gets 60 deg downlights. A wide beam crossing the
   blades is what gives you shadow flicker, and it is the single most common
   complaint about a new install. */
var FAN_DL_COUNT=4;
function lowGlareDownlight(){
  return byId('DL10-PS') ||
    catProducts('downlights').filter(function(q){return fittingClass(q)==='lg';})[0] || null;
}
function exhaustForRoom(areaM2,withLight){
  var big = areaM2 > 6;
  if(withLight===false) return byId(big?FANS.exhaustPlainLarge.id:FANS.exhaustPlainSmall.id);
  return byId(big ? FANS.exhaustLarge.id : FANS.exhaustSmall.id);
}
/* '' | 'light' | 'plain'. Older saved plans stored true, which meant the
   version with the light in it. */
function exhaustMode(r){
  var v=S.roomExhaust[r&&r.id];
  /* 'light' (and the older `true`) was the exhaust-with-a-light-in-it option,
     which is not offered any more: it replaced the room's downlights. A plan
     saved with it still opens - it just reads as a plain exhaust now, so the
     room keeps its lights. */
  if(v===true||v==='light'||v==='plain') return 'plain';
  return null;
}
/* "Amari 52\" Fan Black or White 4-Blade with CCT Light" is the catalogue
   name. In a dropdown you only want the part that tells them apart. */
function niceName(p){
  if(!p) return 'fitting';
  var n=(p.name||p.id||'fitting');
  return n.length>42 ? n.slice(0,40).replace(/[ ,]+$/,'')+'\u2026' : n;
}
/* The catalogue name carries every option after the first comma, which is
   noise when you are only choosing between three fittings. */
function plainName(p){
  if(!p) return 'fitting';
  var n=String(p.name||p.id||'').split(',')[0].trim();
  return n || niceName(p);
}
/* One short, plain line under each choice. No product codes, no jargon the
   customer has to look up - what it is, how bright, what it costs. */
function lightBlurb(p){
  if(!p) return '';
  var bits=[], lm=parseLumens(p.lumens);
  var w=String(p.watts||'').match(/(\d+)/);
  if(w) bits.push(w[1]+'W');
  if(lm) bits.push('about '+lm+' lumens');
  if(fittingClass(p)==='lg') bits.push('low glare');
  if(p.price>0) bits.push('$'+p.price.toFixed(2)+' each');
  return bits.join(' \u00b7 ');
}
function fanShortName(p){
  return ((p&&p.name)||'')
    .replace(/^Amari\s*/i,'')
    .replace(/\s*(Black or White|White or Black)\s*/i,' ')
    .replace(/\s*with CCT Light\s*$/i,'')
    .replace(/\bFan\b\s*/i,'')
    .replace(/(\d)-Blade/i,'$1-blade')
    .replace(/\s+/g,' ').trim();
}
/* Blade sweep in metres, for drawing the fan to scale on the plan. */
function fanSweepM(p){
  var t=((p&&p.name)||'')+' '+((p&&p.dims)||'');
  var m=t.match(/(\d{2})\s*"/);
  if(m) return parseInt(m[1],10)*0.0254;
  m=t.match(/(\d{3,4})\s*mm/i);
  if(m) return parseInt(m[1],10)/1000;
  return /exhaust|bathroom mate/i.test(t) ? 0.30 : 1.32;
}
function isFan(p){ return p && p.cat==='fans'; }
function isCeilingFan(p){ return isFan(p) && /\bfan\b/i.test(p.name||'') && !/exhaust|bathroom mate|heater/i.test(p.name||''); }

function recommendForRoom(r){
  if(!S.mpp) return null;
  var brief=ROOMS[r.type]||ROOMS.other;
  if(!brief.dl) return null;                       // the table is for downlights
  var w=r.w*S.mpp, h=r.h*S.mpp, band=bandFor(w,h);
  var p=roomFittingFor(r);
  // klass and n are only set when a downlight is actually selected
  var isDl=p&&p.cat==='downlights';
  var klass=isDl?fittingClass(p):null;
  /* Some room types are capped no matter what the table says - a WC does not
     need four downlights just because it measures 2.4 x 2.6 m. */
  /* min and max both pin the count. A bathroom is two lights, always - not
     one because the room measured small. */
  var cap=function(n){
    if(brief.max && n>brief.max) n=brief.max;
    if(brief.min && n<brief.min) n=brief.min;
    return n;
  };
  var std=cap(countForRoom(w,h,'std')), lg=cap(countForRoom(w,h,'lg'));
  var n=klass?cap(countForRoom(w,h,klass)):null;

  /* Two house rules that override the size table.

     A fan in the room means 60 deg downlights, four of them, wherever the fan
     is - a wide beam crossing the blades is what gives you shadow flicker.
     A fan WITH a light in it does the room on its own, so there are no
     downlights at all; a fan without one still wants its four.

     Bedrooms are four downlights, whatever the table says. */
  var fan=roomFanMode(r);
  if(fan){
    klass='lg';
    std=FAN_DL_COUNT; lg=FAN_DL_COUNT;
    n=(fan==='light') ? 0 : FAN_DL_COUNT;
  }else if(r.type==='bedroom'){
    std=4; lg=4; n=klass?4:null;
  }else if(isBigRoom(r)){
    /* Big rooms are the only ones that ask. The answer moves the count
       between 6 and 9; no answer keeps the table's number inside that
       window, so the room never jumps when they finally pick one. */
    var mode=roomComfort(r);
    std=applyComfort(std,mode); lg=applyComfort(lg,mode);
    if(n!=null) n=applyComfort(n,mode);
  }
  return {w:w, h:h, band:band, bandLabel:bandLabel(band), max:brief.max||null,
          big:isBigRoom(r), comfort:roomComfort(r),
          std:std, lg:lg,
          klass:klass, n:n,
          fan:fan||null, fanOnly:fan==='light',
          pid:isDl?p.id:null,
          spacing:spacingFor(S.ceiling, fan?60:(isDl?parseBeam(p.beam):100))};
}
// The garage is battens only — a downlight grid is the wrong answer in there.
function garageFitting(){ return byId('T40-CCT-BATTEN-PRO'); }

/* The smart fittings are spread across downlights and ceiling lights in the
   catalogue, so there is no category to point at. fxKind already knows which
   ones they are - it colours them differently on the plan - so the room
   picker reads the same test rather than inventing a second one. */
function smartLights(){
  return PRODUCTS.filter(function(p){ return isALight(p) && fxKind(p)==='smart'; });
}
/* The room picker offers the MAIN fittings only - the ones people actually
   choose between. Every group had grown to the full category, so a bedroom
   dropdown ran to two dozen names, several of which read identically once the
   trailing spec was trimmed off (two "90mm 9W Downlight", two "24W Smart WiFi
   Ceiling Light", two "3W Smart RGBW Star Lights"). Three or four real choices
   per group is the whole point of the picker; the full range is one click away
   on the website. Order matters - the first in each list is the one we lead
   with. An id that is not in the catalogue is skipped, so this list can never
   empty a group out. */
var PICKER_MAIN={
  downlights:['DL9ES-FLAT-HL',        /* 8W high lumen flat - the default   */
              'DL8ES-FLAT-ALL-FP-',   /* 8W flat, switch adjustable         */
              'DL10ES-FLAT-WHITE-',   /* 10W flat                           */
              'DL10-PS'],             /* 10W low glare 60 deg               */
  smart:     ['DL9RGBW-BT1',          /* RGBW bluetooth                     */
              'DL9RGBW-PBT',          /* RGBW low glare bluetooth           */
              '25W-SMART-LED-TUYA'],  /* 25W smart wifi                     */
  ceiling:   ['C25-CCT-PA',           /* premium 25W oyster                 */
              'P24SE-CCT',            /* 24W slim                           */
              'P24-WIFI'],            /* 24W smart wifi                     */
  batten:    ['T40-CCT-BATTEN-PRO'],
  star:      ['DL03-ALL-1',           /* single 3W starlight                */
              'DL03-4KIT-2',          /* 4 head kit                         */
              'DL03-6KIT-1']          /* 6 head kit                         */
};
/* One lookup for the room picker, so a real category and the virtual smart
   group are fetched the same way. */
function pickerGroupProducts(key){
  var main=PICKER_MAIN[key];
  if(main){
    var out=[];
    main.forEach(function(id){ var p=byId(id); if(p&&isALight(p)) out.push(p); });
    if(out.length) return out;
  }
  return key==='smart' ? smartLights() : catProducts(key).filter(isALight);
}
/* What a fitting is called in the picker. plainName cuts the catalogue name at
   the first comma, which is what makes the list readable - but it also turns
   several of these into the same line ("90mm 8W Downlight" for two different
   fittings, "90mm 9W Downlight" for two more), so the customer is choosing
   blind between them. These are the fourteen fittings the picker offers, named
   the way you would say them out loud: what size, what wattage, and the one
   thing that tells it apart from the one above it. */
var PICKER_NAME={
  'DL9ES-FLAT-HL':      '90mm 8W Downlight \u2014 high lumen',
  'DL8ES-FLAT-ALL-FP-': '90mm 8W Downlight \u2014 switch adjustable',
  'DL10ES-FLAT-WHITE-': '90mm 10W Downlight',
  'DL10-PS':            '90mm 10W Downlight \u2014 low glare',
  'DL9RGBW-BT1':        '90mm 9W Downlight \u2014 RGBW colour',
  'DL9RGBW-PBT':        '90mm 9W Downlight \u2014 RGBW, low glare',
  '25W-SMART-LED-TUYA': '25W Smart Downlight \u2014 WiFi',
  'C25-CCT-PA':         '25W Ceiling Light \u2014 premium',
  'P24SE-CCT':          '24W Ceiling Light \u2014 slim',
  'P24-WIFI':           '24W Ceiling Light \u2014 smart WiFi',
  'T40-CCT-BATTEN-PRO': '1.2m 40W Batten Pro',
  'DL03-ALL-1':         '3W Star Light \u2014 single',
  'DL03-4KIT-2':        '3W Star Light Kit \u2014 4 heads',
  'DL03-6KIT-1':        '3W Star Light Kit \u2014 6 heads'
};
function pickerLabel(p){
  if(!p) return 'fitting';
  if(PICKER_NAME[p.id]) return PICKER_NAME[p.id];
  /* Anything reaching this line came off an older saved plan, not the short
     list. Fall back to the plain name, and say "low glare" if the name does
     not - except on a star light, where the narrow beam is the whole point of
     the fitting and calling it low glare means nothing to anybody. */
  var n=plainName(p);
  if(!isStarLight(p) && fittingClass(p)==='lg' && !/low glare|anti.?glare/i.test(n))
    n+=' \u2014 low glare';
  return n;
}

/* What lights this room. Three things decide it, in order:
     a garage gets a batten, whatever anyone picked;
     a room with a fan gets a 60 deg low glare, because of the blades;
     otherwise it is whatever was chosen on that room's card, or the default.
   Nothing here reads the extras picker, so adding a strip light under a
   kitchen bench can never change what is lighting the kitchen. */
function roomFittingFor(r){
  var b=ROOMS[r.type]||ROOMS.other;
  if(!b.dl) return garageFitting()||byId(DL_DEFAULT);
  var chosen=byId(S.roomPid[r.id]);
  if(roomFanMode(r)){
    if(chosen && chosen.cat==='downlights' && fittingClass(chosen)==='lg') return chosen;
    return lowGlareDownlight()||byId(DL_DEFAULT);
  }
  return chosen || byId(S.roomPidAll) || byId(DL_DEFAULT);
}
/* Place a group as a named product without disturbing the extras picker. */
function placeAs(pid,pts){
  var prod=byId(pid); if(!prod||!pts.length) return;
  var pc=S.pick.cat, pp=S.pick.pid;
  S.pick.cat=prod.cat; S.pick.pid=prod.id;
  addFixtures(pts);
  S.pick.cat=pc; S.pick.pid=pp;
}

/* Is there a fan in this room, and does it have a light in it?

   Two ways a fan gets into a room: the dropdown on the room card, or somebody
   dropping one on the plan by hand from the picker. Both have to count, or a
   hand-placed fan would sit in the middle of a grid of wide beams and strobe
   the floor with nothing in the app saying so.

   An explicit 'none' on the card beats a fan that is physically there, so
   choosing "No fan" is always the last word. */
function fanInRoom(r){
  for(var i=0;i<S.fixtures.length;i++){
    var f=S.fixtures[i], p=byId(f.pid);
    if(p && isCeilingFanProduct(p) && pointInRect(f.x,f.y,r)) return p;
  }
  return null;
}
function roomFanMode(r){
  var set=S.roomFan[r.id];
  if(set==='none') return null;
  if(set) return set;
  var p=fanInRoom(r);
  if(!p) return null;
  return /with cct light/i.test(p.name||'') || /-LI$/i.test(p.id||'') ? 'light' : 'nolight';
}

/* A fan went into a room, so the downlights in that room have to be 60 deg.
   The fan itself is left exactly where it was put - only the downlights are
   re-laid, four of them, in a grid that keeps them outside the blade sweep. */
var fanRelayGuard=false;
function enforceLowGlare(r){
  if(fanRelayGuard || !S.mpp) return false;
  if(!fanInRoom(r)) return false;
  var lgp=lowGlareDownlight(); if(!lgp) return false;
  var wrong=S.fixtures.filter(function(f){
    var p=byId(f.pid);
    return p && p.cat==='downlights' && fittingClass(p)!=='lg' && pointInRect(f.x,f.y,r);
  }).length;
  var anyDl=S.fixtures.some(function(f){
    var p=byId(f.pid); return p&&p.cat==='downlights'&&pointInRect(f.x,f.y,r);
  });
  if(!wrong && anyDl) return false;          /* already low glare, leave it */
  fanRelayGuard=true;
  try{
    S.fixtures=S.fixtures.filter(function(f){
      var p=byId(f.pid);
      return !(p && p.cat==='downlights' && pointInRect(f.x,f.y,r));
    });
    var w=r.w*S.mpp, h=r.h*S.mpp;
    var off=wallOffsetFor(spacingFor(S.ceiling,parseBeam(lgp.beam)));
    var pc=S.pick.cat, pp=S.pick.pid;
    S.pick.cat=lgp.cat; S.pick.pid=lgp.id;
    addFixtures(gridInRoom(w,h,FAN_DL_COUNT,off).map(function(q){
      return {x:r.x+m2px(q.x), y:r.y+m2px(q.y)};
    }));
    S.pick.cat=pc; S.pick.pid=pp;
  } finally { fanRelayGuard=false; }
  return true;
}
/* Called after anything is placed. If one of the new fittings is a ceiling fan
   sitting inside a room box, that room switches to low glare on the spot. */
function applyFanRule(newIds){
  if(fanRelayGuard || !S.mpp || !S.rooms.length) return;
  var hit=[];
  S.fixtures.forEach(function(f){
    if(newIds.indexOf(f.id)<0) return;
    var p=byId(f.pid); if(!p||!isCeilingFanProduct(p)) return;
    S.rooms.forEach(function(r){
      if(pointInRect(f.x,f.y,r) && hit.indexOf(r)<0) hit.push(r);
    });
  });
  var changed=0;
  hit.forEach(function(r){ if(enforceLowGlare(r)) changed++; });
  if(changed) toast('Fan in the room \u2014 switched to '+FAN_DL_COUNT+
                    ' \u00d7 60\u00b0 low glare so the blades cannot strobe the light');
}

/* Drivers, remotes, controllers and channel are things a run needs, not
   things you choose as the light in a room. They stay on the schedule; they
   just do not belong in a "change the type of light" list. */
function isALight(p){
  return !!p && !/driver|remote|controller|channel|transformer/i.test((p.name||'')+' '+(p.id||''));
}
/* The general lighting of a room: what the planner lays out for you, and what
   filling the room replaces. Strip and star lights are accents somebody placed
   deliberately, so they survive a re-fill. */
function isRoomLight(f){
  var p=byId(f.pid);
  return !!p && (p.cat==='downlights'||p.cat==='ceiling'||p.cat==='batten'||p.cat==='fans');
}
// A room is done once it holds at least the fittings it was told it needs.
function roomFittings(r){
  return S.fixtures.filter(function(f){return pointInRect(f.x,f.y,r);}).length;
}
function roomIsDone(r){
  var n=roomFittings(r);
  if(!n) return false;
  /* A fan with a light in it finishes the room on its own - it is not waiting
     on a downlight grid, because the fan light replaced it. A fan without a
     light still needs its four low glare downlights, so it falls through to
     the count check below. */
  if(roomFanMode(r)==='light') return true;
  var rec=recommendForRoom(r);
  return rec&&rec.n ? n>=rec.n : true;
}
// Collapsed once finished, unless the person has opened it back up themselves.
function roomIsOpen(r){
  /* Done means done: one small row in the finished list. The only way a
     finished room opens back up is the Edit button on that row. */
  if(roomIsDone(r)) return !!S.roomEdit[r.id];
  if(Object.prototype.hasOwnProperty.call(S.roomOpen,r.id)) return S.roomOpen[r.id];
  return true;
}

/* What a room is called on this plan. One kitchen is "Kitchen"; three
   bedrooms are "Bed 1", "Bed 2", "Bed 3", numbered in the order they were
   marked. Numbering only appears once there is more than one of that type -
   a single bedroom labelled "Bed 1" reads like something is missing. */
function roomName(r){
  if(!r) return '';
  var b=ROOMS[r.type]||ROOMS.other;
  var short=b.short||b.label;
  var same=S.rooms.filter(function(x){return x.type===r.type;});
  if(same.length<2) return short;
  return short+' '+(same.indexOf(r)+1);
}

/* The finished-rooms panel on the plan side. Only rooms that are actually
   done appear - it is a record of progress, not a second copy of the room
   list, and a half-finished room showing up here would say the opposite of
   what the panel is for. */
function renderDoneRooms(){
  var panel=document.getElementById('donep'),
      body=document.getElementById('donep-b'),
      cnt=document.getElementById('donep-c');
  if(!panel||!body) return;
  var done=S.rooms.filter(roomIsDone);
  /* Nothing to report until at least one room is finished. */
  if(!S.rooms.length || !done.length){ panel.hidden=true; body.innerHTML=''; return; }
  panel.hidden=false;
  if(cnt) cnt.textContent=done.length+' of '+S.rooms.length;

  body.innerHTML=done.map(function(r){
    var q=roomFittings(r);
    var sel=S.sel.length && S.fixtures.some(function(f){
      return S.sel.indexOf(f.id)>-1 && pointInRect(f.x,f.y,r); });
    /* One line per finished room: what it is, how many went in, and the two
       ways to act on it. Everything else - the type, the fitting, the fan -
       lives on the card that Edit opens, so this list stays readable at six
       rooms the way it did at one. */
    return '<div class="donep-row'+(sel?' on':'')+'">'+
      '<button type="button" class="donep-nm" data-donejump="'+r.id+'" '+
        'title="Show this room on the plan">'+
        '<span class="tick">\u2713</span><b>'+esc(roomName(r))+'</b>'+
        '<span class="q">'+q+'\u00d7</span></button>'+
      '<button type="button" class="donep-e" data-doneedit="'+r.id+'" '+
        'title="Open this room to change it">Edit</button>'+
      '<button type="button" class="donep-x" data-donedel="'+r.id+'" '+
        'title="Remove this room" aria-label="Remove '+esc(roomName(r))+'">\u00d7</button>'+
    '</div>';
  }).join('');

  /* Clicking a room selects what is in it and brings it into view, so the
     panel is a way of getting around the plan as well as a checklist. */
  body.querySelectorAll('[data-donejump]').forEach(function(b){
    b.onclick=function(){
      var r=S.rooms.filter(function(x){return x.id===b.dataset.donejump;})[0];
      if(!r) return;
      S.sel=S.fixtures.filter(function(f){return pointInRect(f.x,f.y,r);})
                      .map(function(f){return f.id;});
      S.hiRoom=r.id;
      S.rooms.forEach(function(x){ S.roomOpen[x.id]=(x.id===r.id); });
      setTimeout(function(){flashRoom(r.id);},0);
      openStep(3);
      renderAll();
      var card=document.querySelector('[data-toggle="'+r.id+'"]');
      if(card&&card.scrollIntoView) card.scrollIntoView({block:'nearest'});
      toast(roomName(r)+' \u2014 '+S.sel.length+' fitting'+(S.sel.length===1?'':'s')+' selected');
    };
  });
  body.querySelectorAll('[data-donetype]').forEach(function(sel){
    sel.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===sel.dataset.donetype;})[0];
      if(!r||!ROOMS[sel.value]) return;
      snapshot();
      var relit=setRoomType(r,sel.value);
      renderAll();
      toast(roomName(r)+' \u2014 '+ROOMS[r.type].label.toLowerCase()+(relit?', lights updated':''));
    };
  });
  body.querySelectorAll('[data-donedel]').forEach(function(b){
    b.onclick=function(){ removeRoom(b.dataset.donedel); };
  });
  body.querySelectorAll('[data-doneedit]').forEach(function(b){
    b.onclick=function(){
      var id=b.dataset.doneedit;
      S.rooms.forEach(function(x){ delete S.roomEdit[x.id]; });   /* one at a time */
      S.roomEdit[id]=true; S.hiRoom=id;
      openStep(3); renderAll(); flashRoom(id);
      var card=document.querySelector('[data-toggle="'+id+'"]');
      if(card&&card.scrollIntoView) card.scrollIntoView({block:'center',behavior:'smooth'});
    };
  });
  /* Changing the light here does exactly what changing it on the room card
     does - one code path, so the two can never disagree. */

}

/* Pulse a room's box so the eye lands on it. "Which room am I looking at"
   is the question the rail could not answer on its own. */
var flashTimer=null;
function flashRoom(id){
  var g=el&&el.gRooms; if(!g) return;
  var rect=g.querySelector('[data-room="'+id+'"]'); if(!rect) return;
  if(flashTimer) clearTimeout(flashTimer);
  Array.prototype.slice.call(g.querySelectorAll('.flash'))
    .forEach(function(n){n.classList.remove('flash');});
  void rect.getBoundingClientRect();
  rect.classList.add('flash');
  flashTimer=setTimeout(function(){rect.classList.remove('flash');flashTimer=null;},1500);
}

/* Every room as one small pill - Bed 1, Bed 2, Kitchen - so the whole house
   reads at a glance instead of as a stack of open cards. Pressing one flashes
   that box on the plan and opens its card to edit. */
function focusRoom(id){
  var r=S.rooms.filter(function(x){return x.id===id;})[0];
  if(!r) return;
  S.hiRoom=id;
  S.sel=S.fixtures.filter(function(f){return pointInRect(f.x,f.y,r);})
                  .map(function(f){return f.id;});
  S.rooms.forEach(function(x){ S.roomOpen[x.id]=(x.id===id); });
  renderAll();
  flashRoom(id);
  var card=document.querySelector('[data-toggle="'+id+'"]');
  if(card&&card.scrollIntoView) card.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function renderRoomChips(){
  var w=document.getElementById('roomchips');
  if(!w) return;   /* the chip row was a third copy of the room list; it is gone */
  if(!S.rooms.length){ w.hidden=true; w.innerHTML=''; return; }
  w.hidden=false;
  w.innerHTML=S.rooms.map(function(r){
    var n=roomFittings(r), done=roomIsDone(r);
    return '<button type="button" class="rchip'+(S.hiRoom===r.id?' on':'')+(done?' done':'')+
      '" data-chip="'+r.id+'" title="Show this room on the plan">'+
      (done?'<span class="ck">\u2713</span>':'')+esc(roomName(r))+
      (n?'<span class="n">'+n+'</span>':'')+'</button>';
  }).join('');
  w.querySelectorAll('[data-chip]').forEach(function(b){
    b.onclick=function(){ focusRoom(b.dataset.chip); };
  });
}

/* Changing what a room IS, and deleting one, are both reachable from two
   places now - the room card and the finished list - so they live here once.
   Doing it twice is how the two lists drifted apart. */
function setRoomType(r,type){
  if(!r||!ROOMS[type]) return;
  r.type=type;
  /* Options belong to the room type - a kitchen has no exhaust box, so
     drop any flags the new type doesn't offer. */
  var nb=ROOMS[r.type]||ROOMS.other;
  if(!nb.fan){ delete S.roomFan[r.id]; delete S.roomFanSize[r.id]; delete S.roomFanManual[r.id]; delete S.roomAskFan[r.id]; }
  else if(S.roomFan[r.id]==null) S.roomAskFan[r.id]=true;
  if(!nb.exhaust) delete S.roomExhaust[r.id];
  /* The comfort answer belongs to the room at the size it is. Changing
     what the room IS does not change its size, so the answer is kept -
     but a type that no longer asks the question drops it. */
  if(!isBigRoom(r)) delete S.roomComfort[r.id];
  /* A garage's batten is not the right light for a bedroom, and the other
     way round, so the room goes back to the default when its type changes. */
  delete S.roomPid[r.id];
  /* A room's lights ARE its type. Switching dining to bathroom has to put
     bathroom lighting in that box then and there. */
  var had=roomFittings(r), relit=false;
  if(had){
    if(S.roomAskFan[r.id]){
      S.fixtures=S.fixtures.filter(function(f){return !(isRoomLight(f)&&pointInRect(f.x,f.y,r));});
      S.sel=[];
    } else if(S.mpp){ doFill(r); relit=true; }
  }
  S.hiRoom=r.id;
  if(S.roomAskFan[r.id]) S.roomOpen[r.id]=true;   // it has a question to answer
  else delete S.roomOpen[r.id];                   // otherwise let it settle where it belongs
  flashRoom(r.id);
  return relit;
}
function removeRoom(id){
  snapshot();
  /* Take the room's fittings with it. Anything sitting inside the box is
     there because of this room, so leaving them behind left lights on the
     plan and on the invoice for a room that no longer exists. */
  var gone=S.rooms.filter(function(r){return r.id===id;})[0];
  if(gone){
    S.fixtures=S.fixtures.filter(function(f){return !pointInRect(f.x,f.y,gone);});
    S.sel=[];
    if(S.hiRoom===gone.id) S.hiRoom=null;
  }
  S.rooms=S.rooms.filter(function(r){return r.id!==id;});
  delete S.roomOpen[id]; delete S.roomEdit[id]; delete S.roomFan[id]; delete S.roomFanSize[id];
  delete S.roomFanManual[id]; delete S.roomExhaust[id]; delete S.roomComfort[id];
  delete S.roomAskFan[id]; delete S.roomPid[id];
  renderAll();
}

function renderRoomList(){
  renderRoomChips();
  var w=$('#roomlist');
  if(!S.rooms.length){
    w.innerHTML='<div class="empty">No rooms yet \u2014 drag a box around your first one.</div>';
    return;
  }
  var html='';
  /* Once a room is done it lives in the finished list below, not here. Keeping
     a collapsed card AND a finished row for the same room was the same
     information twice, which is what made a five-room plan hard to follow. */
  var working=S.rooms.filter(function(r){ return !roomIsDone(r) || roomIsOpen(r); });
  if(!working.length){
    w.innerHTML='';
  } else {
  working.forEach(function(r){
    var brief=ROOMS[r.type]||ROOMS.other;
    var a=roomAreaM2(r);
    var rec=recommendForRoom(r);
    var n=roomFittings(r);
    var done=roomIsDone(r), open=roomIsOpen(r);
    html+='<div class="rcard'+(open?' open':'')+(done?' done':'')+'">'+
      '<button type="button" class="rcard-head" data-toggle="'+r.id+'">'+
        (done?'<span class="rtick">✓</span>':'<span class="rdot"></span>')+
        '<span class="rcard-t">'+esc(roomName(r))+
          '<span class="rcard-sub">'+(a?a.toFixed(1)+' m²':'set the scale')+
            ' · '+n+' placed'+(rec&&rec.n&&n<rec.n?' of '+rec.n:'')+'</span></span>'+
        '<i class="chev"></i></button>'+
      '<div class="rcard-body">'+
      '<label class="qlabel" for="rt-'+r.id+'">This room is a…</label>'+
      '<div class="selwrap" style="margin-bottom:12px"><select class="sel" id="rt-'+r.id+'" data-roomtype="'+r.id+'">'+
        Object.keys(ROOMS).map(function(k){
          return '<option value="'+k+'"'+(k===r.type?' selected':'')+'>'+ROOMS[k].label+'</option>';
        }).join('')+'</select></div>'+
      /* The controls first, the numbers behind a dropdown. The card used to
         open with a wall of figures, so the two things that actually change
         the room were below the fold and people missed them. */
      (function(){
        if(!brief.fan) return '';
        /* A bedroom or an alfresco is a fan decision before it is a lighting
           decision - a fan with a light in it means no downlights at all, so
           laying a grid first and asking afterwards did the room twice and
           showed the customer a plan that was about to change. The room is
           left empty until this is answered. */
        var asking=!!S.roomAskFan[r.id];
        var fsz=S.roomFanSize[r.id]||'';
        var fl=a?fanForRoomSized(a,true,fsz):null, fnl=a?fanForRoomSized(a,false,fsz):null;
        var cur=roomFanMode(r)||'';
        /* Three big rows you can read and press, instead of a dropdown you
           have to open before you can see what the choices even are. */
        function fopt(val,title,sub){
          /* While the room is still asking, no row is ticked - "No fan" is a
             real answer as well as the empty state, and showing it selected
             made the question look like it had already been dealt with. */
          var on=!asking && cur===val;
          return '<label class="ropt'+(on?' on':'')+'">'+
                 '<input type="radio" name="rf-'+r.id+'" value="'+val+'" data-roomfan="'+r.id+'"'+
                 (on?' checked':'')+'>'+
                 '<span><b>'+title+'</b><em>'+sub+'</em></span></label>';
        }
        return (asking
            ? '<div class="rask"><b>First \u2014 is there a fan in this '+
              esc(brief.label.toLowerCase().split(' / ')[0])+'?</b>'+
              '<em>A fan with a light in it does the room on its own, so the answer changes how many downlights go in. Nothing is laid out until you pick one.</em></div>'
            : '')+
          '<div class="rsub">Ceiling fan</div>'+
          fopt('','No fan in this room','Just lights.')+
          fopt('light','A fan with a light in it',
               (fl?esc(fanShortName(fl))+' \u2014 ':'')+'the fan\u2019s own light does the room, so no downlights go in.')+
          fopt('nolight','A fan, and downlights for the light',
               (fnl?esc(fanShortName(fnl))+' \u2014 ':'')+FAN_DL_COUNT+' low glare downlights go around it, clear of the blades.')+
          /* Blade count only matters once a fan is going in. Auto follows the
             manufacturers' sizing; 4 and 5 pin the 52" and 56" by hand. */
          (cur?'<div class="rsub" style="margin-top:10px">Blades</div>'+
            '<div class="selwrap"><select class="sel" data-roomfansize="'+r.id+'">'+
              '<option value=""'+(fsz?'':' selected')+'>Sized to the room'+
                (a?' \u2014 '+(a>18?'5 blades (56")':'4 blades (52")'):'')+'</option>'+
              '<option value="4"'+(fsz==='4'?' selected':'')+'>4 blades \u2014 52"</option>'+
              '<option value="5"'+(fsz==='5'?' selected':'')+'>5 blades \u2014 56"</option>'+
            '</select></div>':'');
      })()+
      (function(){
        /* Only the two big bands ask. Everything else has one right answer
           and a question with a foregone conclusion is just another thing to
           read. */
        if(!isBigRoom(r) || roomFanMode(r)==='light') return '';
        var cm=roomComfort(r);
        /* What this room gets with no answer at all. A very large room clamps
           to the top of the window, so the middle option would be the same
           number as "more light" - two rows saying one thing. */
        var asMeasured=applyComfort(countForRoom(a? r.w*S.mpp:0, a? r.h*S.mpp:0,
                                    (rec&&rec.klass)||'std'),'');
        var midIsReal = asMeasured>COMFORT.less && asMeasured<COMFORT.more;
        function copt(val,title,sub2,forceOn){
          var on = cm===val || (!cm && forceOn);
          return '<label class="ropt'+(on?' on':'')+'">'+
                 '<input type="radio" name="rc-'+r.id+'" value="'+val+'" data-roomcomfort="'+r.id+'"'+
                 (on?' checked':'')+'>'+
                 '<span><b>'+title+'</b><em>'+sub2+'</em></span></label>';
        }
        return '<div class="rsub">How much light in here?</div>'+
          '<p class="rhint">A room this size can be run two ways and both are right. '+
          'Fewer fittings is calmer to sit in; more is brighter to work in.</p>'+
          copt('less','Less light, more comfortable',
               COMFORT.less+' fittings \u2014 softer and easier on the eye at night. Best for a lounge you sit in.',
               asMeasured<=COMFORT.less)+
          (midIsReal
            ? copt('','As measured',
                   'Whatever the room size calls for \u2014 '+asMeasured+' here. The middle road.',true)
            : '')+
          copt('more','More light, brighter',
               COMFORT.more+' fittings \u2014 an even, bright wash. Best for open plan with a kitchen in it.',
               asMeasured>=COMFORT.more);
      })()+
      (function(){
        if(!brief.exhaust) return '';
        var mode=exhaustMode(r);
        var exL=a?exhaustForRoom(a,true):null, exP=a?exhaustForRoom(a,false):null;
        function opt(val,title,sub){
          return '<label class="ropt'+((mode||'')===val?' on':'')+'">'+
                 '<input type="radio" name="ex-'+r.id+'" value="'+val+'"'+
                 ' data-roomexhaust="'+r.id+'"'+((mode||'')===val?' checked':'')+'>'+
                 '<span><b>'+title+'</b><em>'+sub+'</em></span></label>';
        }
        /* One tick box. The old three-way question - none / with a light /
           without - put a lighting decision inside a ventilation one, and the
           "exhaust with a light in it" option quietly took the room's
           downlights away. The room gets its lights either way now. */
        return '<div class="rsub">Exhaust fan</div>'+
          '<label class="ropt ropt-tick'+(mode==='plain'?' on':'')+'">'+
            '<input type="checkbox" data-roomexhaust="'+r.id+'" value="plain"'+
            (mode==='plain'?' checked':'')+'>'+
            '<span><b>Add an exhaust fan</b><em>'+
            (exP?esc(exP.name):'A plain extractor')+
            ' \u2014 on top of the lights, not instead of them.</em></span></label>';
      })()+
      (function(){
        /* Change the fitting from inside the room card, rather than scrolling
           back up to the picker. A fan with a light in it has no downlights,
           so there is nothing to change. */
        if(roomFanMode(r)==='light') return '';
        /* A fan in the room means 60 deg downlights, so only offer the ones
           that qualify - otherwise the dropdown says one thing and the plan
           does another. */
        var fanRoom=!!roomFanMode(r);
        /* Smart lights sit in the room picker as their own group. They are
           the one thing a customer asks for by name, and they were only
           reachable by scrolling a hundred product names looking for "RGBW".
           In a fan room only the 60 deg ones are offered, same as the rest. */
        var groups=fanRoom
          ? [['downlights','Low glare downlights'],['smart','Smart & colour changing']]
          : [['downlights','Downlights'],['smart','Smart & colour changing'],
             ['ceiling','Ceiling & wall lights'],
             ['batten','Battens'],['star','Star lights']];
        var current=(roomFittingFor(r)||{}).id;
        var opts='';
        var takenInGroup={};
        groups.forEach(function(g){
          var list=pickerGroupProducts(g[0]).filter(function(pp){
            /* A smart downlight is in both the downlights category and the
               smart group, and two different ids can trim down to the same
               words. Either way it is one choice to the person reading it, so
               the first group that claims that line keeps it. */
            var k=pickerLabel(pp).toLowerCase();
            if(takenInGroup[k] && pp.id!==current) return false;
            takenInGroup[k]=1; return true;
          });
          if(fanRoom) list=list.filter(function(pp){return fittingClass(pp)==='lg';});
          if(!list.length) return;
          opts+='<optgroup label="'+g[1]+'">'+list.map(function(pp){
            return '<option value="'+pp.id+'"'+(pp.id===current?' selected':'')+'>'+
                   esc(pickerLabel(pp))+'</option>';
          }).join('')+'</optgroup>';
        });
        if(!opts) return '';
        /* Three or four plain choices, ours first and already ticked. Every
           other fitting is still one click away under "Show every light",
           but nobody has to read a hundred product names to light a bedroom. */
        var flat=[], seenFlat={};
        groups.forEach(function(g){
          var list=pickerGroupProducts(g[0]);
          if(fanRoom) list=list.filter(function(pp){return fittingClass(pp)==='lg';});
          list.forEach(function(pp){ if(!seenFlat[pp.id]){ seenFlat[pp.id]=1; flat.push(pp); } });
        });
        var rp=recommendProduct(r.type);
        var short=[], seen={};
        function add(pp,tag){
          if(!pp||seen[pp.id]) return;
          if(!flat.some(function(x){return x.id===pp.id;})) return;
          seen[pp.id]=1; short.push({p:pp,tag:tag});
        }
        if(rp&&rp.p) add(rp.p,'Our pick');
        add(byId(current),'');
        flat.forEach(function(pp){ if(short.length<4) add(pp,''); });
        var rows=short.map(function(s){
          var on=s.p.id===current;
          return '<label class="ropt'+(on?' on':'')+'">'+
            '<input type="radio" name="rl-'+r.id+'" value="'+s.p.id+'" data-roomlightpick="'+r.id+'"'+
            (on?' checked':'')+'>'+
            '<span><b>'+esc(plainName(s.p))+(s.tag?'<span class="rtag">'+s.tag+'</span>':'')+'</b>'+
            '<em>'+esc(lightBlurb(s.p))+'</em></span></label>';
        }).join('');
        return '<div class="rsub">The light in this room</div>'+rows+
          '<details class="rmore"'+(S.roomMoreOpen[r.id]?' open':'')+' data-roommore="'+r.id+'">'+
            '<summary>Show every light we sell</summary>'+
            '<div class="rmore-body"><div class="selwrap"><select class="sel" id="rl-'+r.id+'" '+
            'data-roomlight="'+r.id+'">'+opts+'</select></div></div>'+
          '</details>';
      })()+
      /* One green button, and it says what pressing it will do in words -
         not "(2 standard)", which meant nothing to anyone who had not read
         the manual. */
      (a?'<button type="button" class="act go sm" style="margin-top:12px" data-fillroom="'+r.id+'">'+
          (n?'Do this room again':'Put the lights in this room')+
          (rec&&rec.fanOnly?' \u2014 the fan light only':
           rec&&rec.n?' \u2014 '+rec.n+' of them':'')+'</button>':'')+
      '<button type="button" class="act ghost sm" style="margin-top:9px" data-delroom="'+r.id+'">Remove this room</button>'+
      '<details class="rinfo"'+(S.roomInfoOpen[r.id]?' open':'')+' data-roominfo="'+r.id+'">'+
        '<summary>All the numbers</summary>'+
        '<div class="rinfo-body">'+
        '<ul class="plist">'+
          '<li><span class="k">Area</span><span class="v">'+(a?a.toFixed(1)+' m²':'set scale first')+'</span></li>'+
          '<li><span class="k">Colour</span><span class="v">'+esc(brief.cct)+'</span></li>'+
          (roomFanMode(r)?'<li><span class="k">Fan</span><span class="v">'+
            (roomFanMode(r)==='light'?'With a light':'No light')+
            (S.roomFan[r.id]?'':' <span style="color:var(--muted)">(placed on the plan)</span>')+
            '</span></li>':'')+
          (rec?'<li><span class="k">Size band</span><span class="v">'+esc(rec.bandLabel)+'</span></li>'+
               '<li><span class="k">Needs</span><span class="v">'+
                 (rec.fanOnly?'the fan light only'
                   :rec.fan?FAN_DL_COUNT+' low glare (fan rule)'
                   :rec.std+' standard <span style="color:var(--muted)">/</span> '+rec.lg+' low glare')+
                 '</span></li>'+
               (rec.n?'<li><span class="k">Selected</span><span class="v">'+rec.n+' × '+esc(rec.pid||'')+
                 ' <span style="color:var(--muted)">('+(rec.klass==='lg'?'low glare':'standard')+')</span></span></li>':'')+
               '<li><span class="k">Off the walls</span><span class="v">'+
                 (wallOffsetFor(rec.spacing)*1000).toFixed(0)+' mm</span></li>':
               (!brief.dl?'<li><span class="k">Use</span><span class="v">battens — T40 Pro</span></li>':''))+
          '<li><span class="k">Placed</span><span class="v">'+n+'</span></li>'+
        '</ul>'+
        '<div class="teach" style="margin-top:11px">'+esc(brief.note)+'</div>'+
        '</div></details>'+
      '</div></div>';
  });
  w.innerHTML=html;
  }
  w.querySelectorAll('[data-toggle]').forEach(function(b){
    b.onclick=function(){
      var id=b.dataset.toggle;
      var r=S.rooms.filter(function(x){return x.id===id;})[0];
      var opening=!roomIsOpen(r);
      if(roomIsDone(r)){
        /* Toggling a finished room is really toggling "I want to edit this". */
        if(opening) S.roomEdit[id]=true; else delete S.roomEdit[id];
      }
      /* One room open at a time. Six cards open at once was the rail people
         called "too much on the side", and it buried the room being worked on. */
      S.rooms.forEach(function(x){ S.roomOpen[x.id]=(opening&&x.id===id); });
      S.hiRoom=opening?id:null;
      renderRooms();
      renderRoomList();
      if(opening) flashRoom(id);
    };
  });
  w.querySelectorAll('[data-roomtype]').forEach(function(sel){
    sel.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===sel.dataset.roomtype;})[0];
      if(!r) return;
      snapshot();
      var relit=setRoomType(r,sel.value);
      renderAll();
      toast('Changed to '+(ROOMS[r.type]||ROOMS.other).label+(relit?' \u2014 lights updated':''));
    };
  });
  w.querySelectorAll('[data-delroom]').forEach(function(b){
    b.onclick=function(){ removeRoom(b.dataset.delroom); };
  });
  w.querySelectorAll('[data-userec]').forEach(function(b){
    b.onclick=function(){
      var r=S.rooms.filter(function(x){return x.id===b.dataset.userec;})[0];
      if(!r) return;
      var rp=recommendProduct(r.type); if(!rp) return;
      snapshot();
      S.roomPid[r.id]=rp.p.id; S.roomPidAll=rp.p.id;
      S.roomOpen[r.id]=true;
      if(S.mpp) doFill(r);
      renderAll();
      toast(rp.p.name+' \u2014 '+rp.why);
      if(rp.warn) showModal('Check the rating before you order','<p>'+esc(rp.warn)+'</p>');
    };
  });
  w.querySelectorAll('[data-fillroom]').forEach(function(b){
    b.onclick=function(){
      var r=S.rooms.filter(function(x){return x.id===b.dataset.fillroom;})[0];
      /* Pressing the button IS an answer - they have looked at the question
         and chosen to go ahead without a fan. */
      if(r){ var fresh=!!S.roomAskFan[r.id];
             delete S.roomAskFan[r.id]; if(S.roomFan[r.id]==null) S.roomFan[r.id]='none';
             delete S.roomOpen[r.id]; doFill(r);
             /* The question interrupted a marking-up run, so hand the pen
                back: the room tool re-arms for the next room. Answering the
                same controls later, on a finished room, changes nothing. */
             if(fresh){ setTool('select'); toast('Room lit \u2014 draw another room whenever you like'); } }
    };
  });
  /* Ticking either box re-plans the room straight away - no separate
     "apply" step, because the whole point is to see the change. */
  w.querySelectorAll('[data-roomfan]').forEach(function(sel){
    sel.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===sel.dataset.roomfan;})[0];
      if(!r) return;
      /* "No fan" has to stick even when there is a fan sitting in the box,
         so it is stored rather than just cleared. */
      var fresh=!!S.roomAskFan[r.id];
      S.roomFan[r.id]=sel.value||'none';
      /* Set by hand, so the whole-house fan answer must not overwrite it later. */
      S.roomFanManual[r.id]=true;
      delete S.roomAskFan[r.id];
      S.roomOpen[r.id]=true;
      if(S.mpp) doFill(r); else renderRoomList();
      if(fresh&&S.mpp){ setTool('select'); toast('Room lit \u2014 draw another room whenever you like'); }
      renderAll();
    };
  });
  /* Picking a blade count swaps the fan and re-lays the room straight away,
     same as ticking a fan option. */
  /* Picking a comfort level re-lays the room straight away, same as every
     other answer on the card - the whole point is to see the difference. */
  w.querySelectorAll('[data-roomcomfort]').forEach(function(rb){
    rb.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===rb.dataset.roomcomfort;})[0];
      if(!r) return;
      snapshot();
      if(rb.value) S.roomComfort[r.id]=rb.value; else delete S.roomComfort[r.id];
      S.roomOpen[r.id]=true;
      if(S.mpp) doFill(r);
      renderAll();
    };
  });
  w.querySelectorAll('[data-roomfansize]').forEach(function(sel){
    sel.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===sel.dataset.roomfansize;})[0];
      if(!r) return;
      if(sel.value) S.roomFanSize[r.id]=sel.value; else delete S.roomFanSize[r.id];
      S.roomOpen[r.id]=true;
      if(S.mpp&&roomFanMode(r)) doFill(r); else renderRoomList();
      renderAll();
    };
  });
  /* Changing the fitting from inside the room card re-lays that room straight
     away, so you see the new count and spacing instead of having to press
     re-fill afterwards. */
  w.querySelectorAll('[data-roomlightpick]').forEach(function(rb){
    rb.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===rb.dataset.roomlightpick;})[0];
      applyRoomLight(r,byId(rb.value));
    };
  });
  w.querySelectorAll('[data-roommore]').forEach(function(d){
    d.addEventListener('toggle',function(){ S.roomMoreOpen[d.dataset.roommore]=d.open; });
  });
  w.querySelectorAll('[data-roomlight]').forEach(function(sel){
    sel.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===sel.dataset.roomlight;})[0];
      var p=byId(sel.value);
      if(!r||!p) return;
      S.roomMoreOpen[r.id]=true;
      applyRoomLight(r,p);
    };
  });
  function applyRoomLight(r,p){
      if(!r||!p) return;
      snapshot();
      /* This is the light for THIS room. It does not touch the extras picker,
         and it does not disturb any other room. */
      S.roomPid[r.id]=p.id;
      S.roomPidAll=p.id;              /* and it becomes the default for new rooms */
      S.roomOpen[r.id]=true;
      if(S.mpp) doFill(r);
      renderAll();
      toast((ROOMS[r.type]||ROOMS.other).label+': '+niceName(p));
      /* A wet room with no rating recorded used to be flagged only when you
         pressed the old recommendation button. Now any choice is checked. */
      var wb=ROOMS[r.type]||ROOMS.other;
      if(wb.wet && !p.ip)
        showModal('Check the rating before you order',
          '<p>'+esc(niceName(p))+' has no IP rating recorded in the catalogue. '+
          'Confirm the wet-area rating with Greenhse before ordering.</p>');
  }
  /* Remember which cards had their numbers open, or every re-render would
     snap them shut again. */
  w.querySelectorAll('[data-roominfo]').forEach(function(d){
    d.addEventListener('toggle',function(){ S.roomInfoOpen[d.dataset.roominfo]=d.open; });
  });
  w.querySelectorAll('[data-roomexhaust]').forEach(function(cb){
    cb.onchange=function(){
      var r=S.rooms.filter(function(x){return x.id===cb.dataset.roomexhaust;})[0];
      if(!r) return;
      /* A tick box now: on means a plain extractor goes in beside the lights. */
      if(cb.checked) S.roomExhaust[r.id]='plain'; else delete S.roomExhaust[r.id];
      S.roomOpen[r.id]=true;
      if(S.mpp) doFill(r); else renderRoomList();
      renderAll();
    };
  });
}

/* ============================================================
   Placement
   ============================================================ */
/* Where a fitting is allowed to land. A ceiling fan belongs in a bedroom or
   out on the alfresco; an exhaust fan belongs in a bathroom or a laundry.
   Dropping one anywhere else is refused rather than quietly accepted, because
   the room card, the low glare rule and the schedule all plan around it.

   Outside a room box there is nothing to judge it against, so it is allowed -
   plenty of people place fittings before they mark the rooms up. */
function placementBlock(p,x,y){
  if(!p) return null;
  var r=roomOf({x:x,y:y});
  if(!r) return null;
  var b=ROOMS[r.type]||ROOMS.other;
  if(isCeilingFanProduct(p) && !b.fan)
    return 'A ceiling fan goes in a bedroom or on the alfresco \u2014 not in a '+
           b.label.toLowerCase()+'.';
  if(isBathroomFitting(p) && !b.exhaust)
    return 'An exhaust fan goes in a bathroom or a laundry \u2014 not in a '+
           b.label.toLowerCase()+'.';
  return null;
}
/* Which way a wall light should throw, given where it was dropped.
   A wall light goes ON a wall and lights the space in front of it, so the
   bearing is "away from the nearest wall". Inside a marked room that is the
   nearest of the room's four edges; outside one it is the nearest edge of the
   plan itself. Returned in degrees, 0 = up the plan, and always one of the
   four square bearings, because that is how a wall light actually gets
   mounted. Rotate by hand (R, or [ and ]) when a plan has a wall running
   diagonally or a return the app cannot see. */
function wallFacing(x,y){
  var r=null, i;
  for(i=0;i<S.rooms.length;i++){ if(pointInRect(x,y,S.rooms[i])){ r=S.rooms[i]; break; } }
  var box=r||{x:0,y:0,w:S.plan.w,h:S.plan.h};
  var dL=x-box.x, dR=(box.x+box.w)-x, dT=y-box.y, dB=(box.y+box.h)-y;
  var m=Math.min(dL,dR,dT,dB);
  if(m===dL) return 90;      /* on the left wall  -> throws right */
  if(m===dR) return 270;     /* on the right wall -> throws left  */
  if(m===dT) return 180;     /* on the top wall   -> throws down  */
  return 0;                  /* on the bottom wall-> throws up    */
}

function addFixtures(pts){
  if(!S.pick.pid){toast('Pick a fitting first');return;}
  var prod=byId(S.pick.pid);
  var ok=[], refused=null;
  pts.forEach(function(q){
    var why=fanRelayGuard?null:placementBlock(prod,Math.round(q.x),Math.round(q.y));
    if(why){ refused=why; return; }
    ok.push(q);
  });
  if(refused && !ok.length){ toast(refused); return; }
  snapshot();
  var ids=[];
  /* Dropping several star lights in one action is placing a feature string,
     so it arrives as a group and moves as one. Ungroup is on the toolbar the
     moment it is selected. */
  var starRun = isStarLight(prod) && ok.length>1 ? 'g'+(S.seq++) : null;
  ok.forEach(function(p){
    var f={id:'f'+(S.seq++),pid:S.pick.pid,x:Math.round(p.x),y:Math.round(p.y)};
    if(starRun) f.grp=starRun;
    /* A wall light carries the direction it throws. Everything else is a
       ceiling fitting and has no orientation to keep. */
    if(isWallLight(prod)) f.rot=wallFacing(f.x,f.y);
    S.fixtures.push(f);ids.push(f.id);
  });
  S.sel=ids;
  if(refused) toast(refused+' The rest were placed.');
  applyFanRule(ids);
  renderAll();
}
// Where a click would drop fittings, given the current picker settings.
function groupPointsAt(x,y){
  var p=byId(S.pick.pid); if(!p) return [];
  var sp=isStarLight(p) ? m2px(STAR_SPACING_M)
                        : m2px(spacingFor(S.ceiling,parseBeam(p.beam)));
  var pts=(S.pick.arr==='col'?colPoints(S.pick.qty,sp)
          :S.pick.arr==='grid'?gridPoints(S.pick.qty,sp)   /* older saved plans */
          :rowPoints(S.pick.qty,sp));
  return pts.map(function(q){return {x:x+q.x,y:y+q.y};});
}
function drawGhost(pts,snap){
  guideClear();
  var p=byId(S.pick.pid); if(!p||!pts.length) return;
  var cut=parseCutout(p)||90, r=Math.max(4,m2px(cut/1000)/2);
  var beam=parseBeam(p.beam), d=poolDiameter(S.ceiling,beam);
  var s='';
  if(snap&&snap.gx!=null) s+='<line class="snapline" x1="'+snap.gx+'" y1="0" x2="'+snap.gx+'" y2="'+S.plan.h+'"/>';
  if(snap&&snap.gy!=null) s+='<line class="snapline" x1="0" y1="'+snap.gy+'" x2="'+S.plan.w+'" y2="'+snap.gy+'"/>';
  pts.forEach(function(q){
    if(d) s+='<circle class="ghost-pool" cx="'+q.x+'" cy="'+q.y+'" r="'+m2px(d/2).toFixed(1)+'"/>';
    s+='<circle class="ghost-body" cx="'+q.x+'" cy="'+q.y+'" r="'+r.toFixed(1)+'"/>';
  });
  if(pts.length>1&&S.mpp){
    var gap=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)*S.mpp;
    s+='<text class="guide-lab" x="'+((pts[0].x+pts[1].x)/2)+'" y="'+(pts[0].y-r-8)+'" text-anchor="middle" '+
       'font-size="'+Math.max(11,Math.min(24,S.plan.w/80))+'">'+gap.toFixed(2)+' m apart</text>';
  }
  el.gGuide.innerHTML=s;
}
function snapTol(){ return 9/S.zoom; }


/* ============================================================
   Special lights - star lights, wall lights, your own pendant
   Three big buttons instead of the four-question picker, plus a
   plain-English card on the right of the plan telling you exactly
   what to do. Everything routes into the normal placement machinery.
   ============================================================ */
var SPECIAL={
  star:{
    label:'Star lights', icon:'✦', pid:'DL03-ALL-1',
    blurb:'Tiny 30 mm points in the ceiling — a starlit sky. 3 W each, so they are an effect, not the room\'s light.',
    steps:['How many.',
           'Which way they run.',
           'Click the plan — they all go down together and move as one.'],
    counts:[1,2,3,4,5,6],
    note:'They will not light a room on their own — keep the normal downlights as well.'
  },
  wall:{
    /* Outdoor only. Inside a house a wall light is a decorative extra that
       does not light the room, and offering it beside the downlights had
       people picking it as the light for a bedroom. Outside is where it does
       a real job - entries, alfresco walls, along a path. */
    label:'Outdoor wall lights', icon:'◨', pid:'MR10-CCT-WALL-B',
    blurb:'For outside walls \u2014 entries, the alfresco, along a path. They bolt to the wall and throw light out in front of them, about 180\u00b0, and nothing behind. Drop one and it points away from the nearest wall on its own.',
    steps:['Pick which one.',
           'Click the plan against the outside wall you want it on.',
           'Drag the green arrow to turn it. Drag the light itself to move it.'],
    /* The budget wall light (W10-CCT-BW) is no longer offered - Lazar:
       "BUDGET OUTDOOR LIGHT NEEDS TO BE REMOVED". It is deliberately still in
       WALL_KEEP, so a plan saved before today still resolves and prices it;
       it just cannot be reached from the picker any more. */
    choices:[{id:'MR10-CCT-WALL-B', t:'Up/down, IP65'},
             {id:'SEAFORD-UPDOWN-WAL', t:'Seaford up/down'},
             {id:'WL12-18-CCT-SENSOR', t:'With sensor'}],
    note:'Mount them about 1.6\u20131.8 m off the floor, above eye level, and keep them off a wall you look straight at from a window.'
  },
  pendant:{
    label:'My own pendant',
    /* A pendant drawn as a pendant - canopy, drop, shade - so the button
       matches the mark that lands on the plan. The bullseye it used to carry
       was the same glyph family as every ceiling fitting. */
    icon:'<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">'+
         '<line x1="6" y1="3.5" x2="18" y2="3.5" stroke="currentColor" stroke-width="1.3" stroke-opacity=".5"/>'+
         '<rect x="10.4" y="3.2" width="3.2" height="1.7" rx="0.7" fill="currentColor"/>'+
         '<line x1="12" y1="4.9" x2="12" y2="11" stroke="currentColor" stroke-width="1.3"/>'+
         '<path d="M9.6 11 L14.4 11 L18 16.4 L6 16.4 Z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'+
         '<circle cx="12" cy="18.1" r="1.6" fill="currentColor"/>'+
         '</svg>',
    own:true,
    blurb:'A pendant you are supplying yourself — over an island bench, a dining table or a stairwell. Put it on the plan so your electrician knows where to leave the point.',
    steps:['Type what it is called.',
           'Type what it cost (or leave it at 0).',
           'Click the plan where it hangs.'],
    note:'Greenhse does not supply this one. It goes on the list at the price you type.'
  }
};
var specPick=null, specArr='row', specOwnSeq=0;

function showHowTo(title,body,steps){
  var h=document.getElementById('howto'); if(!h) return;
  document.getElementById('howto-t').textContent=title;
  document.getElementById('howto-b').textContent=body;
  document.getElementById('howto-l').innerHTML=(steps||[]).map(function(s){
    return '<li>'+esc(s)+'</li>';
  }).join('');
  h.hidden=false;
}
function hideHowTo(){ var h=document.getElementById('howto'); if(h) h.hidden=true; }

function renderSpecial(){
  var row=document.getElementById('specrow'); if(!row) return;
  row.innerHTML=Object.keys(SPECIAL).map(function(k){
    var s=SPECIAL[k];
    return '<button type="button" class="specbtn'+(specPick===k?' on':'')+'" data-spec="'+k+'">'+
           '<span class="ic">'+s.icon+'</span><span class="nm">'+esc(s.label)+'</span></button>';
  }).join('');
  row.querySelectorAll('[data-spec]').forEach(function(b){
    b.onclick=function(){
      specPick=(specPick===b.dataset.spec)?null:b.dataset.spec;
      if(!specPick){ hideHowTo(); setTool('select'); }
      renderSpecial();
      if(specPick) applySpecial();
    };
  });
  var panel=document.getElementById('specpanel');
  if(!panel) return;
  if(!specPick){ panel.innerHTML=''; return; }
  var s=SPECIAL[specPick], html='<div class="specpanel"><h4>'+esc(s.label)+'</h4>'+
      '<p class="blurb">'+esc(s.blurb)+'</p>';
  if(s.counts){
    html+='<div class="lbl">How many?</div><div class="numrow">'+
      s.counts.map(function(n){
        return '<button type="button" class="numbtn'+(S.pick.qty===n?' on':'')+'" data-specn="'+n+'">'+n+'</button>';
      }).join('')+'</div>'+
      '<div class="lbl">Which way do they run?</div><div class="howrow">'+
      [['row','Across \u2192'],['col','Up and down \u2193']].map(function(a){
        return '<button type="button" class="howbtn'+(specArr===a[0]?' on':'')+'" data-specarr="'+a[0]+'">'+a[1]+'</button>';
      }).join('')+'</div>';
  }
  if(s.choices){
    html+='<div class="lbl">Which one?</div><div class="howrow">'+
      s.choices.map(function(c){
        var pr=byId(c.id);
        return '<button type="button" class="howbtn'+(S.pick.pid===c.id?' on':'')+'" data-specpid="'+c.id+'">'+
               esc(c.t)+(pr?' · $'+pr.price.toFixed(0):'')+'</button>';
      }).join('')+'</div>';
  }
  if(s.own){
    html+='<div class="lbl">Your pendant</div><div class="ownrow">'+
      '<input id="ownname" placeholder="e.g. Black glass pendant" value="'+esc(S.ownName||'')+'">'+
      '<input id="ownprice" type="number" min="0" step="1" placeholder="$0" value="'+(S.ownPrice||'')+'">'+
      '</div>';
  }
  html+='<p class="blurb" style="margin:12px 0 0;color:#6b6e5f"><b>Tip:</b> '+esc(s.note)+'</p></div>';
  panel.innerHTML=html;

  panel.querySelectorAll('[data-specn]').forEach(function(b){
    b.onclick=function(){ S.pick.qty=+b.dataset.specn; renderSpecial(); applySpecial(); };
  });
  panel.querySelectorAll('[data-specarr]').forEach(function(b){
    b.onclick=function(){ specArr=b.dataset.specarr; renderSpecial(); applySpecial(); };
  });
  panel.querySelectorAll('[data-specpid]').forEach(function(b){
    b.onclick=function(){ S.pick.pid=b.dataset.specpid; renderSpecial(); applySpecial(); };
  });
  var nm=document.getElementById('ownname'), pp=document.getElementById('ownprice');
  if(nm) nm.oninput=function(){ S.ownName=nm.value; };
  if(pp) pp.oninput=function(){ S.ownPrice=pp.value; };
}

/* Turn the chosen special light into a real pick and arm the plan. */
function applySpecial(){
  if(!specPick) return;
  var s=SPECIAL[specPick];
  if(s.own){
    var nm=(S.ownName||'').trim()||'My pendant';
    var price=parseFloat(S.ownPrice||0)||0;
    /* One catalogue row per distinct pendant, kept in an existing category so
       nothing downstream sees an unknown one. */
    var id='OWN-PENDANT'+(specOwnSeq?('-'+specOwnSeq):'');
    var existing=byId(id);
    if(existing){ existing.name=nm; existing.price=price; }
    else PRODUCTS.push({id:id,name:nm,cat:'ceiling',price:price,sku:null,watts:null,
        lumens:null,beam:null,cutout:null,ip:null,cct:null,dims:null,url:'',img:'',
        specs:['Supplied by you'],
        desc:'A pendant you are supplying yourself. Listed here so the plan shows where the point goes.'});
    S.pick.pid=id; S.pick.qty=1; S.pick.arr='row';
  }else{
    if(!s.choices || !s.choices.some(function(c){return c.id===S.pick.pid;})) S.pick.pid=s.pid;
    if(s.counts){
      S.pick.arr=(specArr==='col')?'col':'row';
    }else{ S.pick.qty=1; S.pick.arr='row'; }
  }
  S.pick.cat=(byId(S.pick.pid)||{}).cat||S.pick.cat;
  showHowTo(s.label, s.blurb, s.steps.slice());
  setTool('place');
  if(typeof renderTools==='function') renderTools();
}

function placeGroupAt(x,y){
  var p=byId(S.pick.pid); if(!p) return;
  /* They all land in one go and they stay together. Star lights especially -
     dropping six of them one click at a time, then trying to keep them evenly
     spaced by hand, was the job nobody could finish. */
  addFixtures(groupPointsAt(x,y));   /* star runs group themselves in addFixtures */
  toast(S.pick.qty+' × '+niceName(p)+' placed');
}
/* pickDefaultDownlight and relayRoomsForPick are gone. Both existed because
   one selection drove both the rooms and the hand-placed fittings: marking a
   room hijacked the picker, and changing the picker silently re-laid rooms.
   Rooms now carry their own fitting (roomFittingFor) and step 4 is extras
   only, so neither job exists any more. */

/* doFill lays a room out from scratch and already knows the fan rules, so the
   automatic "a fan just landed here" pass must not fire while it runs - it
   would lay a second set of downlights on top of the ones doFill placed. */
function doFill(r){
  fanRelayGuard=true;
  try{ return doFillInner(r); }
  finally{
    fanRelayGuard=false;
    /* Every fill path - drawing a room, answering the fan question, pressing
       "Fill this room", re-laying after a comfort change - left the new lights
       selected: heavy rings over every symbol and the whole room one Delete
       press from gone. A filled room starts calm. */
    S.sel=[];
  }
}
function doFillInner(r){
  if(!S.mpp){toast('Set the scale before filling a room');return;}
  var brief=ROOMS[r.type]||ROOMS.other;
  var w=r.w*S.mpp, h=r.h*S.mpp;

  /* The room lights itself with its own fitting. It used to borrow whatever
     was selected in the picker, which is why adding an extra light somewhere
     could re-lay a room you had already finished. */
  var p=roomFittingFor(r); if(!p){toast('No fitting available');return;}

  var sp=spacingFor(S.ceiling,parseBeam(p.beam));
  var off=wallOffsetFor(sp);
  var before=S.fixtures.length;
  /* Filling a room replaces every light already in it, not only the ones that
     happen to match the current pick. Matching on the pick alone was why
     changing the fitting and re-filling stacked a second set of lights on top
     of the first, and why unticking a fan left the fan on the plan. */
  var keep=S.fixtures.filter(function(f){return !(isRoomLight(f)&&pointInRect(f.x,f.y,r));});
  var replaced=before-keep.length;

  var area=w*h;

  /* A fan with a light is the room's light. Put one in and the downlights come
     out - a wide beam crossing the blades is what causes shadow flicker. */
  var fanMode=roomFanMode(r);
  if(fanMode){
    var fan=fanForRoomSized(area, fanMode==='light', S.roomFanSize[r.id]||'');
    if(fan){
      snapshot();
      S.fixtures=S.fixtures.filter(function(f){ return !(isRoomLight(f)&&pointInRect(f.x,f.y,r)); });
      placeAs(fan.id,[{x:r.x+r.w/2, y:r.y+r.h/2}]);

      var msg=fan.name.replace(/ with.*$/,'');
      if(fanMode!=='light'){
        /* The fan has no light in it, so the room still needs downlights.
           Four 60 deg low glare in a 2 x 2 grid, which keeps every one of
           them outside the blade sweep. */
        var lgp=p&&p.cat==='downlights'&&fittingClass(p)==='lg' ? p : lowGlareDownlight();
        if(lgp){
          var offN=wallOffsetFor(spacingFor(S.ceiling,parseBeam(lgp.beam)));
          placeAs(lgp.id,gridInRoom(w,h,FAN_DL_COUNT,offN).map(function(q){
            return {x:r.x+m2px(q.x), y:r.y+m2px(q.y)};
          }));
          msg+=' + '+FAN_DL_COUNT+' low glare downlights';
        }
      }else{
        msg+=' \u2014 the fan light does the room';
      }
      toast(brief.label+': '+msg);
      return;
    }
  }

  /* A wet room is lit like any other room. If the exhaust box is ticked, the
     extractor goes in as well - on top of the lights, never instead of them.
     The old "exhaust with a light in it" option took the downlights away,
     which is why a bathroom kept ending up with no light in it. */
  if(brief.exhaust && exhaustMode(r)==='plain'){
    var exP=exhaustForRoom(area,false);
    snapshot();
    S.fixtures=S.fixtures.filter(function(f){ return !(isRoomLight(f)&&pointInRect(f.x,f.y,r)); });
    if(exP) placeAs(exP.id,[{x:r.x+r.w*0.5, y:r.y+r.h*0.85}]);
    var recP=recommendForRoom(r);
    var ptsP=(recP&&recP.n)? gridInRoom(w,h,recP.n,off,!!brief.min) : fillPoints(w,h,sp,off);
    placeAs(p.id, ptsP.map(function(q){return {x:r.x+m2px(q.x), y:r.y+m2px(q.y)};}));
    toast(brief.label+': exhaust fan + '+ptsP.length+' \u00d7 '+niceName(p));
    return;
  }

  var rec=recommendForRoom(r), pts, why;
  if(!brief.dl){
    /* Battens: Greenhse's rule is one 1.2 m batten up to 5 × 5 m, two beyond
       that, run parallel to the long wall so the band of light covers the bay. */
    var n=battenCount(w,h);
    pts=battenPoints(w,h,n);
    why=n+' × 1.2 m batten'+(n>1?'s':'')+' for a '+w.toFixed(1)+' × '+h.toFixed(1)+' m space';
  }else if(brief.hall){
    /* A hallway is a corridor, not a room. One run down the centre, one
       fitting every 2.2 m or so - anything denser is money on the ceiling. */
    var along=Math.max(w,h), across=Math.min(w,h);
    var nHall=Math.max(1, Math.round(along/2.2));
    pts=[];
    for(var hi=0; hi<nHall; hi++){
      var t=(hi+0.5)/nHall;
      pts.push(w>=h ? {x:t*w, y:h/2} : {x:w/2, y:t*h});
    }
    why=nHall+' down the centre line, one every '+(along/nHall).toFixed(1)+' m';
  }else if(rec&&rec.n){
    pts=gridInRoom(w,h,rec.n,off,!!brief.min);
    why=rec.n+' '+(rec.klass==='lg'?'low glare':'standard')+' downlights for a '+rec.bandLabel+' room';
  }else if(p.cat==='ceiling'){
    /* A 24-25 W surface ceiling light does a whole small room on its own.
       Running it through the downlight spacing rule put nine of them in a
       lounge, which is where the "why are there so many lights" reports were
       coming from. One per 12 m2, minimum one. */
    var nC=Math.max(1,Math.min(4,Math.ceil((w*h)/12)));
    pts=gridInRoom(w,h,nC,off);
    why=nC+' ceiling light'+(nC>1?'s':'')+' for '+(w*h).toFixed(1)+' m\u00b2';
  }else{
    pts=fillPoints(w,h,sp,off);
    why=pts.length+' on the '+sp.toFixed(2)+' m spacing rule';
  }
  if(replaced){snapshot();S.fixtures=keep;}
  placeAs(p.id,pts.map(function(q){return {x:r.x+m2px(q.x), y:r.y+m2px(q.y)};}));
  toast(brief.label+': '+why+(replaced?' (replaced '+replaced+')':''));
}

/* ============================================================
   Pointer interaction
   ============================================================ */
var drag=null, pointers={}, pinch=null;
var planhintSeen={}, planhintTimer=null;   /* the on-plan hint is a one-off intro */

function hidePlanHint(){var p=document.getElementById('planhint'); if(p) p.hidden=true;}
function setTool(t){
  S.tool=t;
  el.canvas.className='canvas tool-'+t;
  $('#btn-place').classList.toggle('pri',t==='place');
  $('#placelabel').textContent=t==='place'?'Now click the plan':'Put them on the plan';
  $('#btn-cal').textContent=t==='scale'?'Now drag the 2 red points…':'Put 2 points on the plan';
  $('#btn-room').textContent=t==='room'?'Now drag a box on the plan…':'Drag a box around the room';
  var msg=armedMessage(t);
  $('#armed').hidden=!msg;
  if(msg) $('#armedmsg').textContent=msg;
  /* Arming the scale tool drops the two red points on the plan. Leaving it
     takes them away again so they cannot be confused with a fitting. */
  if(t!=='place'){ hideHowTo(); if(specPick){ specPick=null; if(typeof renderSpecial==='function') renderSpecial(); } }
  if(t==='scale') armCalHandles();
  else if(el&&el.gGuide&&el.gGuide.querySelector('.cal-grab')) guideClear();
  /* Entering or leaving the scale tool changes whether the setup steps are
     allowed to fold away, so keep that bar in step with it. */
  if(typeof renderSetupBar==='function') renderSetupBar();
  var ph=$('#planhint');
  if(ph){
    var big={scale:['Drag the 2 red points to a known length','Then type what that length really is'],
             room:['Drag a box around the room','Click one corner, drag to the opposite one'],
             measure:['Drag across anything to measure it','Click and hold, drag, then let go'],
             place:['Click the plan to drop a light','Each click places one fitting']}[t];
    /* The hint is an introduction, not a permanent overlay: it shows once per
       tool, for five seconds, then gets out of the way. */
    if(planhintTimer){ clearTimeout(planhintTimer); planhintTimer=null; }
    if(big&&!planhintSeen[t]){
      planhintSeen[t]=true;
      $('#planhint-t').textContent=big[0]; $('#planhint-s').textContent=big[1];
      ph.hidden=false;
      planhintTimer=setTimeout(function(){ ph.hidden=true; planhintTimer=null; },5000);
    } else ph.hidden=true;
  }
}
/* The fan pre-question used to live in step 03. Rooms ask it themselves now,
   one at a time, which is how people actually decide - so the reasoning that
   sat under the question moved to the FAQ, with everything else worth knowing. */
function armedMessage(t){
  var p=byId(S.pick.pid);
  if(t==='measure') return 'Drag across anything on the plan to measure it.';
  if(t==='scale'){
    var r=document.getElementById('calref');
    var lab=r&&r.selectedOptions[0]?r.selectedOptions[0].textContent:'';
    var L=calRefLength();
    if(L===undefined) return 'Pick what you are measuring first, in step 02.';
    return L!=null ? 'Drag the 2 red points onto it: '+lab.toLowerCase()+'.'
      : 'Drag the 2 red points to something you know the length of, then type how long it really is.';
  }
  if(t==='room')  return 'Drag a box around the '+((ROOMS[S.roomType]||ROOMS.other).label).toLowerCase()+'.';
  if(t==='place') return S.pick.arr==='line' ? 'Drag a line across the plan and '+S.pick.qty+' fittings will space themselves along it.'
                : S.pick.arr==='fill' ? 'Click inside one of your room boxes and it will be filled for you.'
                : 'Click the plan to drop '+S.pick.qty+' × '+niceName(p)+
                  '. They line up with anything already placed.';
  return null;
}

function guideClear(){el.gGuide.textContent='';}
function guideLine(a,b){
  guideClear();
  var l=document.createElementNS(svgns,'line');
  l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);
  l.setAttribute('class',S.tool==='scale'?'cal-line':'guide');
  el.gGuide.appendChild(l);
  if(S.tool==='scale'){
    [a,b].forEach(function(p){
      var c=document.createElementNS(svgns,'circle');
      c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',5);
      c.setAttribute('class','cal-node');el.gGuide.appendChild(c);
    });
  }
}
function guideLabel(x,y,text){
  var t=document.createElementNS(svgns,'text');
  t.setAttribute('x',x);t.setAttribute('y',y-10);
  t.setAttribute('text-anchor','middle');
  t.setAttribute('class','guide-lab');
  t.setAttribute('font-size',Math.max(11,Math.min(26,S.plan.w/70)));
  t.textContent=text;
  el.gGuide.appendChild(t);
}
function guideRect(a,b,cls){
  guideClear();
  var r=document.createElementNS(svgns,'rect');
  r.setAttribute('x',Math.min(a.x,b.x));r.setAttribute('y',Math.min(a.y,b.y));
  r.setAttribute('width',Math.abs(b.x-a.x));r.setAttribute('height',Math.abs(b.y-a.y));
  r.setAttribute('class',cls||'guide');
  el.gGuide.appendChild(r);
}

/* ---- the two red scale points ----------------------------------------
   Setting the scale used to need a drag gesture people did not always find.
   Two red points are dropped on the plan instead: drag either one onto
   something you know the length of, then type what it is. Dragging a fresh
   line still works for anyone who prefers it. */
function defaultCalPoints(){
  var cr=el.canvas.getBoundingClientRect(), sr=el.sheet.getBoundingClientRect();
  var cx=(cr.left+cr.width/2-sr.left)/S.zoom, cy=(cr.top+cr.height/2-sr.top)/S.zoom;
  var span=Math.max(40,(cr.width/S.zoom)*0.18);
  return {a:{x:cx-span,y:cy}, b:{x:cx+span,y:cy}};
}
function calHandleAt(pt){
  if(!S.cal.a||!S.cal.b) return null;
  var tol=16/S.zoom;
  if(Math.hypot(pt.x-S.cal.a.x,pt.y-S.cal.a.y)<=tol) return 'a';
  if(Math.hypot(pt.x-S.cal.b.x,pt.y-S.cal.b.y)<=tol) return 'b';
  return null;
}
function renderCalHandles(){
  guideClear();
  if(!S.cal.a||!S.cal.b) return;
  var a=S.cal.a, b=S.cal.b;
  var l=document.createElementNS(svgns,'line');
  l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);
  l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);
  l.setAttribute('class','cal-line'); el.gGuide.appendChild(l);
  var r=Math.max(5,9/S.zoom);
  [a,b].forEach(function(pnt){
    var h=document.createElementNS(svgns,'circle');
    h.setAttribute('cx',pnt.x);h.setAttribute('cy',pnt.y);h.setAttribute('r',r);
    h.setAttribute('class','cal-node cal-grab'); el.gGuide.appendChild(h);
  });
}
/* Show or hide "Use this scale" from wherever the points last moved. */
function refreshCalApply(){
  var ap=document.getElementById('btn-calapply'); if(!ap) return;
  var ready = !!S.cal.px && calReady();
  ap.disabled=!ready;
  ap.style.display=ready?'':'none';
  ap.textContent='Use this scale \u2192';
}
function armCalHandles(){
  if(!el||!el.canvas||!el.gGuide) return;
  if(!S.cal.a||!S.cal.b){ var d=defaultCalPoints(); S.cal.a=d.a; S.cal.b=d.b; }
  S.cal.px=Math.hypot(S.cal.b.x-S.cal.a.x,S.cal.b.y-S.cal.a.y);
  renderCalHandles();
  refreshCalApply();
}
function updateCalFromHandles(commit){
  if(!S.cal.a||!S.cal.b) return;
  S.cal.px=Math.hypot(S.cal.b.x-S.cal.a.x,S.cal.b.y-S.cal.a.y);
  renderCalHandles();
  /* Live: the metres update as you drag, and the points stay where you put
     them. Moving on is a separate, deliberate press - see applyScale. */
  refreshCalApply();
  if(commit&&S.cal.px>=8&&calReady()) setScaleFromCal();
}

function onDown(e){
  pointers[e.pointerId]={x:e.clientX,y:e.clientY};
  if(Object.keys(pointers).length===2){ startPinch(); drag=null; return; }
  if(e.button===1||spaceDown){ drag={mode:'pan',sx:e.clientX,sy:e.clientY,px:S.panX,py:S.panY}; el.canvas.classList.add('panning'); return; }
  var pt=toImg(e);
  if(S.tool==='pan'){drag={mode:'pan',sx:e.clientX,sy:e.clientY,px:S.panX,py:S.panY};el.canvas.classList.add('panning');return;}
  if(S.tool==='scale'){
    /* Only the two red points move. Clicking anywhere else on the plan used to
       start a brand new line from that spot, which is why the points kept
       jumping somewhere unexpected the moment you touched the drawing. */
    var ch=calHandleAt(pt);
    if(ch){drag={mode:'calpt',which:ch};return;}
    drag={mode:'pan',sx:e.clientX,sy:e.clientY,px:S.panX,py:S.panY};
    el.canvas.classList.add('panning');return;}
  if(S.tool==='measure'){drag={mode:'tape',a:pt,b:pt};guideLine(pt,pt);return;}
  if(S.tool==='room'){drag={mode:'room',a:pt,b:pt};guideRect(pt,pt);return;}
  if(S.tool==='place'){
    if(S.pick.arr==='line'){drag={mode:'line',a:pt,b:pt};guideLine(pt,pt);return;}
    if(S.pick.arr==='fill'){
      var r=null;
      for(var i=S.rooms.length-1;i>=0;i--) if(pointInRect(pt.x,pt.y,S.rooms[i])){r=S.rooms[i];break;}
      if(!r){toast('Click inside a room box, or mark one in step 3');return;}
      doFill(r);return;
    }
    var sn=S.snap&&!e.altKey?snapToFittings(pt,S.fixtures,snapTol()):{x:pt.x,y:pt.y};
    placeGroupAt(sn.x,sn.y);
    guideClear();
    return;
  }
  // select tool
  /* The aim handle is checked first: it sits outside the fitting's own hit
     circle, but it overlaps neighbouring fittings often enough that grabbing
     it has to win. */
  var ah=aimHandleAt(pt);
  if(ah){ snapshot(); drag={mode:'aim',id:ah.id}; aimTowards(ah,pt); renderAll(); return; }
  var hit=e.target.closest?e.target.closest('.fx'):null;
  if(hit){
    var id=hit.dataset.id;
    if(e.shiftKey){ var k=S.sel.indexOf(id); if(k>-1) S.sel.splice(k,1); else S.sel.push(id); }
    else if(S.sel.indexOf(id)===-1){
      /* A grouped fitting brings its whole run: that is what the group is for.
         Shift-click still reaches an individual member. */
      var gf=S.fixtures.filter(function(f){return f.id===id;})[0];
      S.sel=(gf&&gf.grp)?S.fixtures.filter(function(f){return f.grp===gf.grp;}).map(function(f){return f.id;}):[id];
    }
    snapshot();
    drag={mode:'move',a:pt,moved:false,orig:S.fixtures.filter(function(f){return S.sel.indexOf(f.id)>-1;}).map(function(f){return {id:f.id,x:f.x,y:f.y};})};
    renderFixtures();renderReadout();
    return;
  }
  // Empty space: drag moves the plan. Hold Shift to rubber-band select instead.
  if(e.shiftKey){ drag={mode:'marquee',a:pt,b:pt}; guideRect(pt,pt); return; }
  if(S.sel.length){ S.sel=[]; renderFixtures(); renderReadout(); }
  drag={mode:'pan',sx:e.clientX,sy:e.clientY,px:S.panX,py:S.panY};
  el.canvas.classList.add('panning');
}

function startPinch(){
  var ids=Object.keys(pointers), a=pointers[ids[0]], b=pointers[ids[1]];
  pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:S.zoom,
         cx:(a.x+b.x)/2, cy:(a.y+b.y)/2,
         px:S.panX, py:S.panY};
  el.canvas.classList.remove('panning');
}
function movePinch(){
  var ids=Object.keys(pointers); if(ids.length<2||!pinch) return;
  var a=pointers[ids[0]], b=pointers[ids[1]];
  var d=Math.hypot(a.x-b.x,a.y-b.y);
  if(pinch.d<10) return;
  S.panX=pinch.px;S.panY=pinch.py;S.zoom=pinch.z;
  zoomTo(pinch.z*(d/pinch.d), pinch.cx, pinch.cy);
}

function onHover(e){
  if(S.tool!=='place'||drag) return;
  if(S.pick.arr==='fill'||S.pick.arr==='line'){ guideClear(); return; }
  var pt=toImg(e);
  var snap=S.snap?snapToFittings(pt,S.fixtures,snapTol()):{x:pt.x,y:pt.y};
  drawGhost(groupPointsAt(snap.x,snap.y),snap);
}
function onMove(e){
  if(pointers[e.pointerId]){pointers[e.pointerId].x=e.clientX;pointers[e.pointerId].y=e.clientY;}
  if(pinch){ movePinch(); return; }
  if(!drag){ onHover(e); return; }
  if(drag.mode==='pan'){
    S.panX=drag.px+(e.clientX-drag.sx);S.panY=drag.py+(e.clientY-drag.sy);applyView();
    if(!S.hintSeen&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>40){
      S.hintSeen=true;var nh=document.getElementById('navhint');if(nh)nh.hidden=true;
    }
    return;
  }
  var pt=toImg(e);
  if(drag.mode==='tape'){
    drag.b=pt;guideLine(drag.a,pt);
    if(S.mpp){
      var mm=Math.hypot(pt.x-drag.a.x,pt.y-drag.a.y)*S.mpp;
      guideLabel((drag.a.x+pt.x)/2,(drag.a.y+pt.y)/2,mm.toFixed(2)+' m');
    }
    return;
  }
  if(drag.mode==='aim'){
    var af=S.fixtures.filter(function(f){return f.id===drag.id;})[0];
    if(af){ aimTowards(af,pt); renderFixtures(); }
    return;
  }
  if(drag.mode==='calpt'){S.cal[drag.which]={x:pt.x,y:pt.y};updateCalFromHandles(false);return;}
  if(drag.mode==='cal'||drag.mode==='line'){drag.b=pt;guideLine(drag.a,pt);
    if(drag.mode==='line'&&S.mpp){/* live length shown in readout */}
    return;}
  if(drag.mode==='room'||drag.mode==='marquee'){drag.b=pt;guideRect(drag.a,pt,drag.mode==='room'?'room-rect drag':'guide drag');return;}
  if(drag.mode==='move'){
    var dx=pt.x-drag.a.x, dy=pt.y-drag.a.y;
    if(Math.abs(dx)>1||Math.abs(dy)>1) drag.moved=true;
    var others=S.fixtures.filter(function(f){return S.sel.indexOf(f.id)===-1;});
    var lead=drag.orig[0], sn={x:lead.x+dx,y:lead.y+dy,gx:null,gy:null};
    if(S.snap&&!e.altKey) sn=snapToFittings({x:lead.x+dx,y:lead.y+dy},others,snapTol());
    dx=sn.x-lead.x; dy=sn.y-lead.y;
    drag.orig.forEach(function(o){
      var f=S.fixtures.filter(function(x){return x.id===o.id;})[0];
      if(f){f.x=Math.round(o.x+dx);f.y=Math.round(o.y+dy);}
    });
    renderFixtures();renderRooms();
    guideClear();
    var s='';
    if(sn.gx!=null) s+='<line class="snapline" x1="'+sn.gx+'" y1="0" x2="'+sn.gx+'" y2="'+S.plan.h+'"/>';
    if(sn.gy!=null) s+='<line class="snapline" x1="0" y1="'+sn.gy+'" x2="'+S.plan.w+'" y2="'+sn.gy+'"/>';
    el.gGuide.innerHTML=s;
    if(S.mpp&&others.length){
      var gap=nearestGap({x:sn.x,y:sn.y},others);
      if(gap!=null){
        var m=gap*S.mpp, v=m<1.2?'bad':m>1.8?'bad':'ok';
        guideLabel(sn.x,sn.y-14,m.toFixed(2)+' m');
        el.gGuide.lastChild.setAttribute('class','guide-lab '+v);
      }
    }
  }
}

function onUp(e){
  delete pointers[e.pointerId];
  if(pinch&&Object.keys(pointers).length<2){ pinch=null; }
  if(!drag) return;
  var d=drag; drag=null;
  el.canvas.classList.remove('panning');
  if(d.mode==='calpt'){ updateCalFromHandles(true); return; }
  if(d.mode==='cal'){
    var len=Math.hypot(d.b.x-d.a.x,d.b.y-d.a.y);
    if(len<8){guideClear();toast('Drag a bit further — that line is too short to be accurate');return;}
    S.cal={a:d.a,b:d.b,px:len};
    renderCalHandles();   /* the ends of a traced line are draggable too */
    $('#btn-calapply').disabled=false;
    var L=calRefLength();
    if(L===undefined){ toast('Pick what you are measuring first'); $('#calref').focus(); return; }
    if(L!=null){ applyScale(); return; }
    $('#callen').focus();
    toast('Now type what that length is in real life');
    return;
  }
  if(d.mode==='room'){
    var x=Math.min(d.a.x,d.b.x),y=Math.min(d.a.y,d.b.y),
        w=Math.abs(d.b.x-d.a.x),h=Math.abs(d.b.y-d.a.y);
    guideClear();
    if(w<12||h<12){toast('That box is too small \u2014 try again, corner to corner');return;}
    snapshot();
    var nr={id:'r'+(S.seq++),type:S.roomType,x:x,y:y,w:w,h:h};
    S.rooms.push(nr); delete S.roomOpen[nr.id];
    /* They answered the fan question before marking anything up, so a room
       that can take a fan starts with that answer already in it. */
    var nb=ROOMS[nr.type]||ROOMS.other;
    if(nb.fan && (S.fanPlan==='light'||S.fanPlan==='nolight')) S.roomFan[nr.id]=S.fanPlan;
    else if(S.fanPlan==='none') S.roomFan[nr.id]='none';
    /* A room that can take a fan and has no answer yet asks first, and stays
       empty until it gets one. Every other room is lit the moment it is
       marked - the whole point of the tool is that you shouldn't have to ask
       for the obvious next step. */
    var mustAskFan = nb.fan && S.roomFan[nr.id]==null;
    if(mustAskFan){
      /* Drop back to select so their attention goes to the question. */
      setTool('select');
      S.roomAskFan[nr.id]=true;
      S.roomOpen[nr.id]=true;
      toast(nb.label+' marked \u2014 is there a fan in this room?');
      /* The question renders at the bottom of the rail, which on most screens
         is below the fold - the app would sit waiting on an answer the user
         could not see. Bring the card to them. */
      setTimeout(function(){
        var card=document.querySelector('[data-toggle="'+nr.id+'"]');
        if(card&&card.scrollIntoView) card.scrollIntoView({block:'center',behavior:'smooth'});
      },150);
    } else if(S.mpp){
      var hadFx=S.fixtures.length;
      doFill(nr);
      var lit=S.fixtures.length>hadFx;   /* doFill already said what went in */
      /* Freshly placed lights arrive selected, which painted every fitting in
         the heavy selection ring and left the whole room one Delete press from
         gone. A filled room starts calm. */
      S.sel=[];
      /* Marking up a house is five or six rooms in a row, so the tool stays
         armed for the next one instead of making them re-press the button for
         every room. Esc (or the Cancel chip) puts it away. */
      /* Letting go of the box finishes the job: the room is marked, lit and
         the tool puts itself away. Staying armed for the next room read as
         "stuck in a mode" and sent people hunting for Esc to get out - the
         button is right there when they want another room. */
      setTool('select');
      if(!lit) toast(nb.label+' marked \u2014 draw another room whenever you like');
    } else {
      setTool('select');
      toast((ROOMS[S.roomType]||ROOMS.other).label+' marked \u2014 set the scale to lay the lights');
    }
    renderAll();
    return;
  }
  if(d.mode==='tape'){
    var len=Math.hypot(d.b.x-d.a.x,d.b.y-d.a.y);
    S.measure=S.mpp?len*S.mpp:null;
    setTool('select');guideClear();
    toast(S.measure?'That is '+S.measure.toFixed(2)+' m':'Set the scale first');
    renderAll();
    return;
  }
  if(d.mode==='line'){
    guideClear();
    var dist=Math.hypot(d.b.x-d.a.x,d.b.y-d.a.y);
    if(dist<10){placeGroupAt(d.a.x,d.a.y);return;}
    addFixtures(linePoints(S.pick.qty,d.a.x,d.a.y,d.b.x,d.b.y));
    toast(S.pick.qty+' placed along the line');
    return;
  }
  if(d.mode==='marquee'){
    guideClear();
    var r={x:Math.min(d.a.x,d.b.x),y:Math.min(d.a.y,d.b.y),w:Math.abs(d.b.x-d.a.x),h:Math.abs(d.b.y-d.a.y)};
    if(r.w>4&&r.h>4){
      S.fixtures.forEach(function(f){if(pointInRect(f.x,f.y,r)&&S.sel.indexOf(f.id)===-1) S.sel.push(f.id);});
      renderFixtures();renderReadout();
    }
    return;
  }
  if(d.mode==='aim'){
    guideClear(); renderAll();
    var af=S.fixtures.filter(function(f){return f.id===d.id;})[0];
    if(af) toast('Aimed '+Math.round(af.rot)+'\u00b0 — drag the green dot again to change it');
    return;
  }
  if(d.mode==='move'){
    guideClear();
    if(d.moved){
      /* A dragged wall light re-reads which wall it is now closest to, so it
         keeps throwing into the space — never back into the wall. But only
         while nobody has aimed it by hand: once they have, moving it must
         carry that aim with it, or aiming and moving fight each other. */
      S.fixtures.forEach(function(f){
        if(S.sel.indexOf(f.id)>-1 && !f.aimed && isWallLight(byId(f.pid))) f.rot=wallFacing(f.x,f.y);
      });
      renderAll();
    }
  }
}

var spaceDown=false;

/* ============================================================
   Plan loading
   ============================================================ */
function measureContent(img,w,h){
  try{
    var S1=Math.min(420,w), sc=S1/w;
    var c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w*sc)); c.height=Math.max(1,Math.round(h*sc));
    var ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(img,0,0,c.width,c.height);
    var d=ctx.getImageData(0,0,c.width,c.height).data;
    var lum=new Array(c.width*c.height);
    for(var i=0,p=0;i<d.length;i+=4,p++)
      lum[p]=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
    var box=contentBox(lum,c.width,c.height);
    box=padBox(box,c.width,c.height,0.03);
    return {x:box.x/sc,y:box.y/sc,w:box.w/sc,h:box.h/sc};
  }catch(e){ return null; }
}
/* ------------------------------------------------------------
   Plan scan. An imported plan arrives covered in furniture, door
   swings, hatching and shading. This strips it back to the two
   things the layout needs - the walls and the dimensions - by:
   1. binarising the image (Otsu), which drops grey shading and fills;
   2. keeping small dense blobs whole - dimension text and labels;
   3. running the remaining linework through a thickness filter
      (morphological opening), which keeps the heavy wall strokes
      and drops the fine furniture and fixture lines.
   Plans drawn with thin walls would lose everything to step 3, so if
   the filter eats nearly all the linework we keep the lines and settle
   for the declutter from steps 1-2. Returns null when the scan fails,
   and the original plan stays. */
function activePlanSrc(){ return S.plan.src; }
function loadImageSrc(src,name,openTo,knownMpp){
  var img=new Image();
  img.onload=function(){
    var w=img.naturalWidth||1600, h=img.naturalHeight||1100;
    S.plan={src:src,name:name||'plan',w:w,h:h,loaded:true,
            content:measureContent(img,w,h)};
    /* knownMpp is for a plan whose scale we already know. The sample draws its
       own 2 m bar, so making a first-time visitor calibrate it teaches them
       nothing and costs them the first thirty seconds. */
    S.mpp=knownMpp||null;S.cal={a:null,b:null};
    renderAll();fitView();
    openStep(openTo||2);
    if(!openTo){
      /* The scale is the first thing to do, so it starts itself: step 02 opens
         with the two red points already sitting on the plan, ready to be
         dragged onto a door. Nothing is measured off that default silently -
         the points are visible and the instruction is on screen. */
      var ref=document.getElementById('calref');
      if(ref && !ref.value){ ref.value='0.82'; ref.dispatchEvent(new Event('change')); }
      setTool('scale');
      toast('Drag the 2 red points across a door on your plan');
    }
    else if(knownMpp) toast('Sample plan loaded, already to scale — box in a room to light it');
  };
  img.onerror=function(){toast('That image would not load');};
  img.src=src;
}

function handleFile(file){
  if(!file) return;
  S.paper=null;
  var isPdf=/pdf$/i.test(file.type)||/\.pdf$/i.test(file.name);
  if(isPdf) return handlePdf(file);
  if(!/^image\//.test(file.type)){toast('Use a PNG, JPG or PDF');return;}
  var fr=new FileReader();
  fr.onload=function(){loadImageSrc(fr.result,file.name);};
  fr.readAsDataURL(file);
}

// PDFs are rendered with pdf.js pulled at the moment of use. If that fails
// (offline, blocked CDN) we say so plainly rather than silently doing nothing.
var pdfDoc=null, pdfPageNo=1;
function handlePdf(file){
  var note=$('#pdfnote');
  note.innerHTML='<div class="teach">Opening the PDF…</div>';
  file.arrayBuffer().then(function(buf){
    return (new Function('u','return import(u)'))('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs').then(function(pdfjs){
      pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';
      return pdfjs.getDocument({data:buf}).promise;
    }).then(function(doc){
      pdfDoc=doc; pdfDoc.__name=file.name;
      return renderPdfPage(1);
    });
  }).catch(function(){
    pdfDoc=null;
    note.innerHTML='<div class="teach warn"><h5>Could not open that PDF</h5>'+
      'Reading a PDF needs an internet connection. If you are offline, open the PDF, '+
      'screenshot or export the page as a PNG or JPG, and drop that in instead — it works exactly the same.</div>';
  });
}
function renderPdfPage(n){
  if(!pdfDoc) return Promise.resolve();
  pdfPageNo=Math.min(Math.max(1,n),pdfDoc.numPages);
  $('#pdfnote').innerHTML='<div class="teach">Rendering page '+pdfPageNo+'…</div>';
  return pdfDoc.getPage(pdfPageNo).then(function(page){
    var vp0=page.getViewport({scale:1});
    S.paper={wMm:Math.round(ptToMm(vp0.width)),hMm:Math.round(ptToMm(vp0.height))};
    var scale=Math.min(3.5, 2400/vp0.width);
    var vp=page.getViewport({scale:scale});
    var c=document.createElement('canvas');
    c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    var ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    return page.render({canvasContext:ctx,viewport:vp}).promise.then(function(){
      var multi=pdfDoc.numPages>1;
      // Multi-page plans keep step 01 open so the page buttons stay in reach.
      loadImageSrc(c.toDataURL('image/jpeg',0.92),
                   (pdfDoc.__name||'plan')+(multi?' — page '+pdfPageNo:''),
                   multi?1:0);
      renderPdfPager();
      if(multi) toast('Page '+pdfPageNo+' of '+pdfDoc.numPages+' loaded — change page in step 01, or move on to step 02');
    });
  });
}
function renderPdfPager(){
  var note=$('#pdfnote');
  if(!pdfDoc||pdfDoc.numPages<2){ note.innerHTML=''; return; }
  note.innerHTML='<div class="teach"><h5>This PDF has '+pdfDoc.numPages+' pages</h5>'+
    'Showing page <b>'+pdfPageNo+'</b>. Marking up a different page starts that page fresh.'+
    '<div class="row2" style="margin-top:9px">'+
      '<button type="button" class="act ghost sm" id="pdf-prev"'+(pdfPageNo<=1?' disabled':'')+'>← Previous page</button>'+
      '<button type="button" class="act ghost sm" id="pdf-next"'+(pdfPageNo>=pdfDoc.numPages?' disabled':'')+'>Next page →</button>'+
    '</div></div>';
  var pv=document.getElementById('pdf-prev'), nx=document.getElementById('pdf-next');
  if(pv) pv.onclick=function(){renderPdfPage(pdfPageNo-1);};
  if(nx) nx.onclick=function(){renderPdfPage(pdfPageNo+1);};
}

/* sample plan: a small drawn floor plan so the tool can be tried without a file */
function samplePlan(){
  var W=1400,H=1000,c=document.createElement('canvas');
  c.width=W;c.height=H;var x=c.getContext('2d');
  x.fillStyle='#fbfaf6';x.fillRect(0,0,W,H);
  x.strokeStyle='#15170F';x.lineWidth=7;x.strokeRect(120,110,1160,790);
  x.lineWidth=5;
  function wall(a,b,cc,d){x.beginPath();x.moveTo(a,b);x.lineTo(cc,d);x.stroke();}
  wall(660,110,660,470); wall(120,470,660,470);
  wall(660,470,660,900); wall(660,640,1280,640);
  wall(960,640,960,900);
  x.fillStyle='#15170F';
  x.font='600 26px "Poppins",sans-serif';
  x.fillText('KITCHEN / DINING',170,165);
  x.fillText('LIVING',170,525);
  x.fillText('BED 1',720,165);
  x.fillText('BATH',720,695);
  x.fillText('BED 2',1010,695);
  // door gaps drawn as white breaks
  x.strokeStyle='#fbfaf6';x.lineWidth=9;
  wall(400,470,520,470); wall(660,300,660,400); wall(660,760,660,850); wall(880,640,940,640);
  // scale bar
  x.strokeStyle='#15170F';x.lineWidth=3;
  wall(120,960,320,960); wall(120,950,120,970); wall(320,950,320,970);
  x.font='400 20px "JetBrains Mono",monospace';
  x.fillText('2.00 m',150,945);
  loadImageSrc(c.toDataURL('image/png'),'Sample plan',3,2.00/200);
}

/* ============================================================
   Export
   ============================================================ */
function composePNG(cb){
  /* The exported copy shows JUST the lights on the plan - no fitting-name
     text, no light pools. What each dot is lives in the summary underneath
     (composeExport) and in the printed schedule, not scattered over the
     drawing. Screen state is restored once the image is built. */
  var wasLabels=S.showLabels, wasPools=S.showPools, orig=cb;
  if(wasLabels||wasPools){S.showLabels=false;S.showPools=false;renderFixtures();}
  cb=function(url){
    S.showLabels=wasLabels;S.showPools=wasPools;renderFixtures();
    orig(url);
  };
  /* Export at 2x and let the browser downsample. A plan printed or zoomed
     from a 1x canvas looks soft, and this is the artefact people hand to
     their electrician. */
  var SCALE=2;
  var c=document.createElement('canvas');
  c.width=S.plan.w*SCALE;c.height=S.plan.h*SCALE;
  var ctx=c.getContext('2d');
  ctx.imageSmoothingEnabled=true;
  if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
  function drawOverlay(){
    var clone=el.ov.cloneNode(true);
    clone.setAttribute('width',S.plan.w);clone.setAttribute('height',S.plan.h);
    clone.setAttribute('xmlns',svgns);
    var css='<style>'+
      '.room-rect{fill:none;stroke:#00c400;stroke-opacity:.55;stroke-width:1.4;stroke-dasharray:7 5}'+
      '.room-rect.drag{stroke:#14512C;stroke-opacity:1;stroke-width:2.6}'+
      '.room-lab{font-family:monospace;fill:#14150f}'+
      '.fx-lab{font-family:monospace;fill:#14150f}'+
      '.fx-ring{fill:none;stroke:#00c400;stroke-width:2}'+
      '</style>';
    clone.insertAdjacentHTML('afterbegin',css);
    /* Exports are a marking-up plan: the plan and the lights, nothing else.
       Room boxes and their label chips are working aids for the screen (the
       chip backgrounds also carry no inline style here, so they would render
       as solid black rectangles) - both are stripped from the exported copy. */
    Array.prototype.slice.call(clone.querySelectorAll('.room-rect,.room-chip,.room-lab,.guide,.fx-lab,.fx-ring'))
      .forEach(function(n){if(n.parentNode)n.parentNode.removeChild(n);});
    var svg=new XMLSerializer().serializeToString(clone);
    var im=new Image();
    im.onload=function(){ctx.drawImage(im,0,0,c.width,c.height);cb(c.toDataURL('image/png'));};
    im.onerror=function(){cb(c.toDataURL('image/png'));};
    im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }
  if(S.plan.loaded){
    var p=new Image();
    p.onload=function(){ctx.drawImage(p,0,0,c.width,c.height);drawOverlay();};
    p.onerror=drawOverlay;
    p.src=activePlanSrc();
  }else drawOverlay();
}
/* ------------------------------------------------------------
   Export artefact - TWO pages (owner request, R25):
     page 1: the clean plan, lights only, nothing else on it
     page 2: the light schedule - LIGHTS USED, totals, BY ROOM
   cb receives {plan, summary} canvases, or null on failure.
   ------------------------------------------------------------ */
function composeExport(cb){
  composePNG(function(base){
    var img=new Image();
    img.onload=function(){
      var plan=document.createElement('canvas');
      plan.width=img.width;plan.height=img.height;
      var pctx=plan.getContext('2d');
      pctx.fillStyle='#ffffff';pctx.fillRect(0,0,plan.width,plan.height);
      pctx.drawImage(img,0,0);
      cb({plan:plan,summary:summaryCanvas(img.width)});
    };
    img.onerror=function(){cb(null);};
    img.src=base;
  });
}
/* Page 2 of the export: everything that used to sit under the plan, on its
   own clean page. Width matches the plan page so both PDF pages print at
   the same scale; height is at least A4-shaped so a short list still looks
   like a document page rather than a strip. */
function summaryCanvas(W){
  var lines=bomLines(), t=bomTotals(lines);
  var name=$('#projname').value||'Untitled plan';
  var fs=Math.max(20,Math.round(W/72));
  var lh=Math.round(fs*1.55), pad=Math.round(fs*1.8);
  var body=[];
  body.push({t:'LIGHTS USED',h:1});
  if(lines.length) lines.forEach(function(l){
    body.push({t:l.qty+' ×  '+l.name+'   ['+l.sku+']'});
  });
  else body.push({t:'No fittings placed yet'});
  body.push({t:'Total fittings: '+t.units+'   ·   Total inc GST: '+money(t.inc)});
  if(S.rooms.length){
    body.push({sp:1});
    body.push({t:'BY ROOM',h:1});
    S.rooms.forEach(function(r){
      var inR=S.fixtures.filter(function(f){return pointInRect(f.x,f.y,r);});
      var byP={};
      inR.forEach(function(f){
        var p=byId(f.pid);
        var k=p?p.name+'   ['+(p.sku||p.id)+']':String(f.pid);
        byP[k]=(byP[k]||0)+1;
      });
      var a=roomAreaM2(r);
      body.push({t:roomName(r).toUpperCase()+
        (a?'  ·  '+a.toFixed(1)+' m²':'')+
        '  ·  '+inR.length+' light'+(inR.length===1?'':'s'),h:2});
      Object.keys(byP).forEach(function(k){
        body.push({t:'      '+byP[k]+' ×  '+k});
      });
    });
  }
  var contentH=pad*2 + fs + lh*2 +
    body.reduce(function(a,b){return a+(b.sp?Math.round(lh*0.5):lh);},0);
  var c=document.createElement('canvas');
  c.width=W; c.height=Math.max(Math.round(W*1.414),contentH);
  var ctx=c.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
  function fit(s){
    s=String(s);
    while(s.length>6&&ctx.measureText(s).width>W-pad*2) s=s.slice(0,-2);
    return s;
  }
  var y=pad;
  ctx.fillStyle='#14150f';
  ctx.font='bold '+Math.round(fs*1.15)+'px monospace';
  ctx.fillText(fit(name.toUpperCase()),pad,y+fs);
  ctx.font=fs+'px monospace';
  ctx.fillStyle='#5c6b62';
  ctx.fillText(fit('Greenhse lighting plan  ·  '+
    new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})+
    '  ·  ceiling '+S.ceiling.toFixed(2)+' m'),pad,y+fs+lh);
  ctx.strokeStyle='#d8dcd2';ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(pad,y+fs+Math.round(lh*1.6));
  ctx.lineTo(W-pad,y+fs+Math.round(lh*1.6));
  ctx.stroke();
  y+=fs+lh*2;
  body.forEach(function(b){
    if(b.sp){y+=Math.round(lh*0.5);return;}
    if(b.h===1){ctx.font='bold '+fs+'px monospace';ctx.fillStyle='#14512C';}
    else if(b.h===2){ctx.font='bold '+fs+'px monospace';ctx.fillStyle='#14150f';}
    else{ctx.font=fs+'px monospace';ctx.fillStyle='#14150f';}
    ctx.fillText(fit(b.t),pad,y+fs);
    y+=lh;
  });
  return c;
}
/* Wrap JPEGs of one or more canvases in a minimal multi-page PDF. Hand-built
   so the standalone file stays self-contained - no library needed. */
function canvasToPdfBlob(cs){
  if(Object.prototype.toString.call(cs)!=='[object Array]') cs=[cs];
  var enc=function(s){var b=new Uint8Array(s.length);for(var i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255;return b;};
  var head='%PDF-1.4\n';
  var parts=[head], pos=head.length, off=[0];
  function push(s){parts.push(s);pos+=s.length;}
  function obj(n,s){off[n]=pos;push(n+' 0 obj '+s+' endobj\n');}
  var n=cs.length, kids=[], i;
  for(i=0;i<n;i++) kids.push((3+i*3)+' 0 R');
  obj(1,'<</Type/Catalog/Pages 2 0 R>>');
  obj(2,'<</Type/Pages/Kids['+kids.join(' ')+']/Count '+n+'>>');
  cs.forEach(function(c,idx){
    var pageN=3+idx*3, imgN=pageN+1, contN=pageN+2;
    var jpeg=atob(c.toDataURL('image/jpeg',0.92).split(',')[1]);
    var W=(c.width/2).toFixed(2), H=(c.height/2).toFixed(2);   /* 2x canvas -> pt */
    var content='q '+W+' 0 0 '+H+' 0 0 cm /Im0 Do Q';
    obj(pageN,'<</Type/Page/Parent 2 0 R/MediaBox[0 0 '+W+' '+H+']'+
        '/Resources<</XObject<</Im0 '+imgN+' 0 R>>/ProcSet[/PDF/ImageC]>>/Contents '+contN+' 0 R>>');
    off[imgN]=pos;
    push(imgN+' 0 obj <</Type/XObject/Subtype/Image/Width '+c.width+'/Height '+c.height+
         '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length '+jpeg.length+'>> stream\n');
    push(jpeg);
    push('\nendstream endobj\n');
    off[contN]=pos;
    push(contN+' 0 obj <</Length '+content.length+'>> stream\n'+content+'\nendstream endobj\n');
  });
  var last=2+n*3;
  var xref=pos;
  var x='xref\n0 '+(last+1)+'\n0000000000 65535 f \n';
  for(var j=1;j<=last;j++) x+=('0000000000'+off[j]).slice(-10)+' 00000 n \n';
  x+='trailer <</Size '+(last+1)+'/Root 1 0 R>>\nstartxref\n'+xref+'\n%%EOF';
  push(x);
  return new Blob(parts.map(enc),{type:'application/pdf'});
}
function download(name,url){
  var a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
}
function scheduleText(){
  var lines=bomLines(),t=bomTotals(lines);
  var out=[$('#projname').value||'Untitled plan','Greenhse layout — light schedule',''];
  lines.forEach(function(l){
    out.push(l.qty+' x  '+l.name+'  ['+l.sku+']  '+money(l.unit)+' ea  =  '+money(l.line));
  });
  out.push('');
  out.push('Total ex GST: '+money(t.ex));
  out.push('Total inc GST: '+money(t.inc));
  out.push('Ceiling height used: '+S.ceiling.toFixed(2)+' m');
  out.push('');
  out.push('Indicative only — to be verified on site by a licensed electrician.');
  return out.join('\n');
}
function roomSummary(){
  return S.rooms.map(function(r){
    var brief=ROOMS[r.type]||ROOMS.other;
    var a=roomAreaM2(r);
    var n=S.fixtures.filter(function(f){return pointInRect(f.x,f.y,r);}).length;
    var rec=recommendForRoom(r);
    return {label:brief.label,area:a,cct:brief.cct,fittings:n,
            band:rec?rec.bandLabel:null, klass:rec?(rec.klass==='lg'?'Low glare':'Standard'):null};
  });
}
function doPrint(){
  var lines=bomLines(), t=bomTotals(lines), rooms=roomSummary();
  var name=$('#projname').value||'Untitled plan';
  composePNG(function(png){
    var h='<div class="pdoc">'+
      '<div class="phead"><div><div class="pbrand">GREENHSE</div>'+
        '<div class="psub">Lighting layout &amp; light schedule</div></div>'+
        '<div class="pmeta">'+esc(new Date().toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'}))+
        '<br>(08) 9297 2969<br>greenhse.com</div></div>'+
      '<h1>'+esc(name)+'</h1>'+
      '<table class="pkv"><tr>'+
        '<td><b>Ceiling</b>'+S.ceiling.toFixed(2)+' m</td>'+
        '<td><b>Scale</b>'+(S.mpp?(1/S.mpp).toFixed(1)+' px/m':'not set')+'</td>'+
        '<td><b>Rooms</b>'+rooms.length+'</td>'+
        '<td><b>Fittings</b>'+t.units+'</td>'+
        '<td><b>Total inc GST</b>'+money(t.inc)+'</td></tr></table>'+
      '<img class="pplan" src="'+png+'">'+
      '<div class="pleg">Symbols: ● downlight / oyster &nbsp; ▬ batten or linear run &nbsp; ' +
        '■ outdoor, flood or driver &nbsp; ▲ sensor &nbsp; ⊕ fan</div>';

    if(rooms.length){
      h+='<h2>Rooms</h2><table class="ptab"><thead><tr><th>Room</th><th>Area</th>'+
         '<th>Size band</th><th>Type</th><th>Colour</th><th>Fittings</th></tr></thead><tbody>'+
        rooms.map(function(r){
          return '<tr><td>'+esc(r.label)+'</td><td>'+(r.area?r.area.toFixed(1)+' m²':'—')+
                 '</td><td>'+esc(r.band||'—')+'</td><td>'+esc(r.klass||'—')+
                 '</td><td>'+esc(r.cct)+'</td><td>'+r.fittings+'</td></tr>';
        }).join('')+'</tbody></table>';
    }

    h+='<h2>Light schedule</h2><table class="ptab"><thead><tr><th></th><th>Fitting</th><th>Code</th>'+
       '<th>Qty</th><th>Unit ex GST</th><th>Line ex GST</th></tr></thead><tbody>';
    lines.forEach(function(l){
      var p=byId(l.id);
      h+='<tr><td class="pth">'+(p&&p.img?'<img src="'+p.img+'">':'')+'</td>'+
         '<td>'+esc(l.name)+'<br><span class="pdim">'+esc(Object.keys(l.rooms).map(function(k){
           return k+' ×'+l.rooms[k];}).join(' · '))+'</span></td>'+
         '<td>'+esc(l.sku)+'</td><td>'+l.qty+'</td><td>'+money(l.unit)+'</td><td>'+money(l.line)+'</td></tr>';
    });
    h+='</tbody></table>'+
      '<table class="ptot"><tr><td>'+t.units+' fittings, ex GST</td><td>'+money(t.ex)+'</td></tr>'+
      '<tr class="big"><td>Total inc GST</td><td>'+money(t.inc)+'</td></tr></table>'+
      '<div class="pnote"><b>Indicative only.</b> Quantities and spacings are calculated from the dimensions '+
      'entered by the customer using standard lighting rules of thumb, and prices are catalogue rates. '+
      'Verify all measurements, ceiling access, joist and truss positions, IP ratings for wet areas and '+
      'circuit loads on site. Installation by a licensed electrician. Excludes cable, downlight kits and labour.</div>'+
      '</div>';
    $('#printout').innerHTML=h;
    setTimeout(function(){window.print();},150);
  });
}

/* ============================================================
   UI wiring
   ============================================================ */
function openStep(n){
  /* Moving on from the setup puts it away again. */
  if(n>=3 && setupShown && S.plan.loaded && S.mpp){ setupShown=false; renderSetupBar(); }
  $$('.step').forEach(function(s){s.classList.toggle('open',+s.dataset.step===n);});
}

/* Count what the list will actually show. Bathroom fittings are hidden
   outside a wet room, so counting the whole category promised twelve fans
   and then showed four. */
function catCount(id){
  var list=catProducts(id);
  if(id==='fans')
    list=list.filter(wetRoomSelected() ? isBathroomFitting
                                       : function(p){return !isBathroomFitting(p);});
  return list.length;
}
function refreshCatCounts(){
  var cat=document.getElementById('cat');
  if(!cat) return;
  CATS.forEach(function(c,i){
    if(cat.options[i]) cat.options[i].textContent=c.label+' ('+catCount(c.id)+')';
  });
}
function buildSelects(){
  var cat=$('#cat');
  cat.innerHTML=CATS.map(function(c){
    return '<option value="'+c.id+'">'+c.label+' ('+catCount(c.id)+')</option>';
  }).join('');
  cat.value=S.pick.cat;
  var rt=$('#rtype');
  rt.innerHTML=Object.keys(ROOMS).map(function(k){
    return '<option value="'+k+'">'+ROOMS[k].label+'</option>';
  }).join('');
  rt.value=S.roomType;
  var qc=$('#qtychips');
  qc.innerHTML=[1,2,3,4,6,8,10,12].map(function(n){
    return '<button type="button" class="chip'+(n===S.pick.qty?' on':'')+'" data-qty="'+n+'">'+n+'</button>';
  }).join('');
  qc.querySelectorAll('[data-qty]').forEach(function(b){
    b.onclick=function(){S.pick.qty=+b.dataset.qty;
      qc.querySelectorAll('.chip').forEach(function(x){x.classList.toggle('on',x===b);});
      renderPlaceTeach();};
  });
  refreshProducts();
  renderRoomTeach();
}

function productSpecLine(p){
  var bits=[];
  var w=parseWatts(p.watts), lm=parseLumens(p.lumens), bm=parseBeam(p.beam), cut=parseCutout(p);
  if(w) bits.push(w+'W');
  bits.push(lm?lm+' lm':'lm n/a');
  if(bm) bits.push(bm+'°');
  if(cut) bits.push(cut+'mm cut-out');
  if(p.ip&&/IP\d/i.test(p.ip)) bits.push(String(p.ip).match(/IP\d+/i)[0]);
  return bits.join(' · ');
}
function productMatches(p,q){
  if(!q) return true;
  q=q.toLowerCase();
  return (p.name+' '+p.id+' '+(p.sku||'')+' '+(p.watts||'')+' '+(p.specs||[]).join(' ')).toLowerCase().indexOf(q)>-1;
}
function visibleProducts(){
  var list=catProducts(S.pick.cat).filter(function(p){return productMatches(p,S.pick.q);});
  /* The fan list follows the room type in step 3, because the two kinds of
     fan go in different rooms and neither can be placed in the other's.
     Bathrooms and laundries see exhausts; everywhere else sees ceiling fans. */
  if(S.pick.cat==='fans')
    list=list.filter(wetRoomSelected() ? isBathroomFitting
                                       : function(p){return !isBathroomFitting(p);});
  var rec=recommendedId();
  return list.slice().sort(function(a,b){
    return (b.id===rec?1:0)-(a.id===rec?1:0);
  });
}
// The fitting we would suggest for whichever room type is currently selected.
function recommendedId(){
  var r=recommendProduct(S.roomType);
  return r&&r.p.cat===S.pick.cat ? r.p.id : null;
}
function thumb(p,cls){
  return p.img ? '<img class="'+(cls||'')+'" src="'+p.img+'" alt="" loading="lazy">'
               : '<span class="'+(cls||'noimg')+'"></span>';
}
function refreshProducts(){
  var list=visibleProducts(), all=catProducts(S.pick.cat), rec=recommendedId(), w=$('#prodcards');
  if(!all.filter(function(p){return p.id===S.pick.pid;}).length) S.pick.pid=all.length?all[0].id:null;
  $('#cathint').textContent=(CATS.filter(function(c){return c.id===S.pick.cat;})[0]||{}).hint||'';
  $('#prodcount').textContent=list.length===all.length?all.length+' available':list.length+' of '+all.length;
  if(!list.length){
    w.innerHTML='<div class="empty">Nothing matches that.<br>Try a code like DL10ES, or clear the search.</div>';
    return;
  }
  /* One line per light: photo, name, price. The spec line and the fold-out
     description/spec panel were more reading than anyone wanted here — the
     product page (a click away on the site) carries all of that. */
  w.innerHTML=list.map(function(p){
    var on=p.id===S.pick.pid;
    return '<button type="button" class="pcard'+(on?' on':'')+'" data-pid="'+p.id+'">'+
      thumb(p)+
      '<span>'+(p.id===rec?'<span class="pc-badge">Recommended</span>':'')+
        '<span class="pc-name">'+esc(p.name)+'</span></span>'+
      '<span class="pc-price">'+money(p.price||0)+'<small>EX GST</small></span></button>';
  }).join('');
  w.querySelectorAll('[data-pid]').forEach(function(b){
    b.onclick=function(){
      /* Step 4 is for the extras you add by hand. Picking here used to re-lay
         every room that had the old fitting in it, which is exactly the
         surprise this step should not spring on anyone. Rooms are changed
         from their own cards now. */
      S.pick.pid=b.dataset.pid;
      refreshProducts();renderPlaceTeach();renderAll();
    };
  });
  var sel=w.querySelector('.pcard.on');
  if(sel&&sel.scrollIntoView) sel.scrollIntoView({block:'nearest'});
}
/* detailBlock (the fold-out description + spec table under the selected card)
   was removed 1 Sep 2026 — the cards now show photo, name and price only. */


/* Low glare vs standard. Same measured drawings the downlight finder uses,
   so the two tools tell one consistent story. Geometry in mkbeam.py. */
var LAY_BEAM={std:"<svg viewBox=\"0 0 380 282\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"Standard, 110 degree beam, source in view\"><rect x=\"65.0\" y=\"12\" width=\"250\" height=\"40\" rx=\"20\" fill=\"#C0563E\"/><path d=\"M84.0 25.0 l14 14 M98.0 25.0 l-14 14\" stroke=\"#fff\" stroke-width=\"3.2\" stroke-linecap=\"round\"/><text x=\"110.0\" y=\"38.0\" font-size=\"16\" font-weight=\"700\" fill=\"#fff\" font-family=\"system-ui,-apple-system,sans-serif\">Glare</text><text x=\"190.0\" y=\"70\" font-size=\"12\" font-weight=\"600\" text-anchor=\"middle\" fill=\"#15170F\" font-family=\"system-ui,-apple-system,sans-serif\">120\u00b0 standard \u2014 lamp on show</text><defs><radialGradient id=\"beamst\" cx=\"50%\" cy=\"0%\" r=\"118%\"><stop offset=\"0%\" stop-color=\"#E8A33D\" stop-opacity=\"0.42\"/><stop offset=\"45%\" stop-color=\"#E8A33D\" stop-opacity=\"0.20\"/><stop offset=\"100%\" stop-color=\"#E8A33D\" stop-opacity=\"0.03\"/></radialGradient><radialGradient id=\"poolst\" cx=\"50%\" cy=\"50%\" r=\"50%\"><stop offset=\"0%\" stop-color=\"#E8A33D\" stop-opacity=\"0.50\"/><stop offset=\"60%\" stop-color=\"#E8A33D\" stop-opacity=\"0.22\"/><stop offset=\"100%\" stop-color=\"#E8A33D\" stop-opacity=\"0\"/></radialGradient></defs><line x1=\"20\" y1=\"92\" x2=\"360\" y2=\"92\" stroke=\"#15170F\" stroke-width=\"2\"/><line x1=\"24\" y1=\"92\" x2=\"18\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"35\" y1=\"92\" x2=\"29\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"46\" y1=\"92\" x2=\"40\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"57\" y1=\"92\" x2=\"51\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"68\" y1=\"92\" x2=\"62\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"79\" y1=\"92\" x2=\"73\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"90\" y1=\"92\" x2=\"84\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"101\" y1=\"92\" x2=\"95\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"112\" y1=\"92\" x2=\"106\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"123\" y1=\"92\" x2=\"117\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"134\" y1=\"92\" x2=\"128\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"145\" y1=\"92\" x2=\"139\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"156\" y1=\"92\" x2=\"150\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"167\" y1=\"92\" x2=\"161\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"178\" y1=\"92\" x2=\"172\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"189\" y1=\"92\" x2=\"183\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"200\" y1=\"92\" x2=\"194\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"211\" y1=\"92\" x2=\"205\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"222\" y1=\"92\" x2=\"216\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"233\" y1=\"92\" x2=\"227\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"244\" y1=\"92\" x2=\"238\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"255\" y1=\"92\" x2=\"249\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"266\" y1=\"92\" x2=\"260\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"277\" y1=\"92\" x2=\"271\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"288\" y1=\"92\" x2=\"282\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"299\" y1=\"92\" x2=\"293\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"310\" y1=\"92\" x2=\"304\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"321\" y1=\"92\" x2=\"315\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"332\" y1=\"92\" x2=\"326\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"343\" y1=\"92\" x2=\"337\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"354\" y1=\"92\" x2=\"348\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><path d=\"M190 92 L8.13 197 L371.87 197 Z\" fill=\"url(#beamst)\"/><line x1=\"190\" y1=\"92\" x2=\"8.13\" y2=\"197\" stroke=\"#E8A33D\" stroke-width=\"1\" stroke-opacity=\"0.55\"/><line x1=\"190\" y1=\"92\" x2=\"371.87\" y2=\"197\" stroke=\"#E8A33D\" stroke-width=\"1\" stroke-opacity=\"0.55\"/><line x1=\"190\" y1=\"92\" x2=\"190\" y2=\"197\" stroke=\"#8A8D7F\" stroke-width=\"0.8\" stroke-dasharray=\"2 5\"/><path d=\"M150.16 115.0 A 46 46 0 0 0 229.84 115.0\" fill=\"none\" stroke=\"#15170F\" stroke-width=\"1\"/><line x1=\"153.46\" y1=\"112.7\" x2=\"146.86\" y2=\"117.3\" stroke=\"#15170F\" stroke-width=\"1\"/><line x1=\"226.54\" y1=\"112.7\" x2=\"233.14\" y2=\"117.3\" stroke=\"#15170F\" stroke-width=\"1\"/><text x=\"190\" y=\"157\" font-size=\"15\" font-weight=\"600\" text-anchor=\"middle\" fill=\"#15170F\" font-family=\"system-ui,-apple-system,sans-serif\">120\u00b0</text><rect x=\"164\" y=\"89\" width=\"52\" height=\"3\" fill=\"#E8A33D\"/><ellipse cx=\"190\" cy=\"197\" rx=\"181.87\" ry=\"15\" fill=\"url(#poolst)\"/><line x1=\"6\" y1=\"197\" x2=\"374\" y2=\"197\" stroke=\"#15170F\" stroke-width=\"1.2\"/><path d=\"M56 164 v18\" stroke=\"#2F6B47\" stroke-width=\"3.6\" stroke-linecap=\"round\"/><path d=\"M48 197 L56 181 L64 197\" fill=\"none\" stroke=\"#2F6B47\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"56\" cy=\"143\" r=\"20\" fill=\"#2F6B47\"/><path d=\"M43.5 140 q5 4.5 10 0\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M43.0 130.5 l11 -3.4\" stroke=\"#fff\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><path d=\"M58.5 140 q5 4.5 10 0\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M58.0 130.5 l11 3.4\" stroke=\"#fff\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><path d=\"M50 154 q6 -4.5 12 0\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><line x1=\"36\" y1=\"128\" x2=\"28\" y2=\"121\" stroke=\"#C0563E\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><line x1=\"45\" y1=\"120\" x2=\"41\" y2=\"111\" stroke=\"#C0563E\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><line x1=\"56\" y1=\"118\" x2=\"56\" y2=\"108\" stroke=\"#C0563E\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><line x1=\"67\" y1=\"120\" x2=\"71\" y2=\"111\" stroke=\"#C0563E\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><line x1=\"76\" y1=\"128\" x2=\"84\" y2=\"121\" stroke=\"#C0563E\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><line x1=\"68.5\" y1=\"140\" x2=\"166\" y2=\"91\" stroke=\"#E8A33D\" stroke-width=\"3.4\" stroke-linecap=\"round\"/><circle cx=\"63.5\" cy=\"140\" r=\"8\" fill=\"#E8A33D\" fill-opacity=\"0.55\"/><line x1=\"8.13\" y1=\"231\" x2=\"371.87\" y2=\"231\" stroke=\"#8A8D7F\" stroke-width=\"0.9\"/><line x1=\"8.13\" y1=\"227\" x2=\"8.13\" y2=\"235\" stroke=\"#8A8D7F\" stroke-width=\"0.9\"/><path d=\"M15.13 228.4 L8.13 231 L15.13 233.6\" fill=\"none\" stroke=\"#8A8D7F\" stroke-width=\"0.9\" stroke-linejoin=\"round\"/><line x1=\"371.87\" y1=\"227\" x2=\"371.87\" y2=\"235\" stroke=\"#8A8D7F\" stroke-width=\"0.9\"/><path d=\"M364.87 228.4 L371.87 231 L364.87 233.6\" fill=\"none\" stroke=\"#8A8D7F\" stroke-width=\"0.9\" stroke-linejoin=\"round\"/><text x=\"20\" y=\"215\" font-size=\"11\" font-weight=\"600\" text-anchor=\"start\" fill=\"#C0563E\" font-family=\"system-ui,-apple-system,sans-serif\">Straight in your eyes</text><text x=\"190\" y=\"247\" font-size=\"9\" text-anchor=\"middle\" fill=\"#8A8D7F\" font-family=\"ui-monospace,monospace\" letter-spacing=\"0.8\">POOL 3.46\u00d7 THE DROP</text></svg>",low:"<svg viewBox=\"0 0 380 282\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"Low glare, 60 degree beam, source hidden\"><rect x=\"65.0\" y=\"12\" width=\"250\" height=\"40\" rx=\"20\" fill=\"#2F6B47\"/><path d=\"M83.0 32.0 l6 6.5 l12 -13\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><text x=\"110.0\" y=\"38.0\" font-size=\"16\" font-weight=\"700\" fill=\"#fff\" font-family=\"system-ui,-apple-system,sans-serif\">No glare</text><text x=\"190.0\" y=\"70\" font-size=\"12\" font-weight=\"600\" text-anchor=\"middle\" fill=\"#15170F\" font-family=\"system-ui,-apple-system,sans-serif\">60\u00b0 low glare \u2014 lamp set back</text><defs><radialGradient id=\"beamlg\" cx=\"50%\" cy=\"0%\" r=\"118%\"><stop offset=\"0%\" stop-color=\"#E8A33D\" stop-opacity=\"0.42\"/><stop offset=\"45%\" stop-color=\"#E8A33D\" stop-opacity=\"0.20\"/><stop offset=\"100%\" stop-color=\"#E8A33D\" stop-opacity=\"0.03\"/></radialGradient><radialGradient id=\"poollg\" cx=\"50%\" cy=\"50%\" r=\"50%\"><stop offset=\"0%\" stop-color=\"#E8A33D\" stop-opacity=\"0.50\"/><stop offset=\"60%\" stop-color=\"#E8A33D\" stop-opacity=\"0.22\"/><stop offset=\"100%\" stop-color=\"#E8A33D\" stop-opacity=\"0\"/></radialGradient></defs><line x1=\"20\" y1=\"92\" x2=\"360\" y2=\"92\" stroke=\"#15170F\" stroke-width=\"2\"/><line x1=\"24\" y1=\"92\" x2=\"18\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"35\" y1=\"92\" x2=\"29\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"46\" y1=\"92\" x2=\"40\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"57\" y1=\"92\" x2=\"51\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"68\" y1=\"92\" x2=\"62\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"79\" y1=\"92\" x2=\"73\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"90\" y1=\"92\" x2=\"84\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"101\" y1=\"92\" x2=\"95\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"112\" y1=\"92\" x2=\"106\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"123\" y1=\"92\" x2=\"117\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"134\" y1=\"92\" x2=\"128\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"145\" y1=\"92\" x2=\"139\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"156\" y1=\"92\" x2=\"150\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"167\" y1=\"92\" x2=\"161\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"178\" y1=\"92\" x2=\"172\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"189\" y1=\"92\" x2=\"183\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"200\" y1=\"92\" x2=\"194\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"211\" y1=\"92\" x2=\"205\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"222\" y1=\"92\" x2=\"216\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"233\" y1=\"92\" x2=\"227\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"244\" y1=\"92\" x2=\"238\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"255\" y1=\"92\" x2=\"249\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"266\" y1=\"92\" x2=\"260\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"277\" y1=\"92\" x2=\"271\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"288\" y1=\"92\" x2=\"282\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"299\" y1=\"92\" x2=\"293\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"310\" y1=\"92\" x2=\"304\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"321\" y1=\"92\" x2=\"315\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"332\" y1=\"92\" x2=\"326\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"343\" y1=\"92\" x2=\"337\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><line x1=\"354\" y1=\"92\" x2=\"348\" y2=\"85\" stroke=\"#C9C6BA\" stroke-width=\"1\"/><path d=\"M190 92 L129.4 197 L250.6 197 Z\" fill=\"url(#beamlg)\"/><line x1=\"190\" y1=\"92\" x2=\"129.4\" y2=\"197\" stroke=\"#E8A33D\" stroke-width=\"1\" stroke-opacity=\"0.55\"/><line x1=\"190\" y1=\"92\" x2=\"250.6\" y2=\"197\" stroke=\"#E8A33D\" stroke-width=\"1\" stroke-opacity=\"0.55\"/><line x1=\"190\" y1=\"92\" x2=\"190\" y2=\"197\" stroke=\"#8A8D7F\" stroke-width=\"0.8\" stroke-dasharray=\"2 5\"/><path d=\"M167.0 131.8 A 46 46 0 0 0 213.0 131.8\" fill=\"none\" stroke=\"#15170F\" stroke-width=\"1\"/><line x1=\"169.0\" y1=\"128.4\" x2=\"165.0\" y2=\"135.3\" stroke=\"#15170F\" stroke-width=\"1\"/><line x1=\"211.0\" y1=\"128.4\" x2=\"215.0\" y2=\"135.3\" stroke=\"#15170F\" stroke-width=\"1\"/><text x=\"190\" y=\"157\" font-size=\"15\" font-weight=\"600\" text-anchor=\"middle\" fill=\"#15170F\" font-family=\"system-ui,-apple-system,sans-serif\">60\u00b0</text><rect x=\"175\" y=\"89\" width=\"30\" height=\"3\" fill=\"#15170F\"/><rect x=\"181\" y=\"90.5\" width=\"18\" height=\"1.5\" fill=\"#E8A33D\"/><ellipse cx=\"190\" cy=\"197\" rx=\"60.6\" ry=\"10.3\" fill=\"url(#poollg)\"/><line x1=\"20\" y1=\"197\" x2=\"360\" y2=\"197\" stroke=\"#15170F\" stroke-width=\"1.2\"/><path d=\"M56 164 v18\" stroke=\"#2F6B47\" stroke-width=\"3.6\" stroke-linecap=\"round\"/><path d=\"M48 197 L56 181 L64 197\" fill=\"none\" stroke=\"#2F6B47\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"56\" cy=\"143\" r=\"20\" fill=\"#2F6B47\"/><circle cx=\"48.5\" cy=\"140\" r=\"4.6\" fill=\"#fff\"/><circle cx=\"48.5\" cy=\"140\" r=\"2.2\" fill=\"#15170F\"/><circle cx=\"63.5\" cy=\"140\" r=\"4.6\" fill=\"#fff\"/><circle cx=\"63.5\" cy=\"140\" r=\"2.2\" fill=\"#15170F\"/><path d=\"M49 152 q7 5.5 14 0\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><line x1=\"69.5\" y1=\"140\" x2=\"174\" y2=\"90\" stroke=\"#8A8D7F\" stroke-width=\"1.2\" stroke-dasharray=\"4 4\"/><circle cx=\"122\" cy=\"115\" r=\"11\" fill=\"#fff\" stroke=\"#2F6B47\" stroke-width=\"1.8\"/><path d=\"M118 111 l8.4 8.4 M126 111 l-8.4 8.4\" stroke=\"#2F6B47\" stroke-width=\"2\" stroke-linecap=\"round\"/><line x1=\"129.4\" y1=\"231\" x2=\"250.6\" y2=\"231\" stroke=\"#8A8D7F\" stroke-width=\"0.9\"/><line x1=\"129.4\" y1=\"227\" x2=\"129.4\" y2=\"235\" stroke=\"#8A8D7F\" stroke-width=\"0.9\"/><path d=\"M136.4 228.4 L129.4 231 L136.4 233.6\" fill=\"none\" stroke=\"#8A8D7F\" stroke-width=\"0.9\" stroke-linejoin=\"round\"/><line x1=\"250.6\" y1=\"227\" x2=\"250.6\" y2=\"235\" stroke=\"#8A8D7F\" stroke-width=\"0.9\"/><path d=\"M243.6 228.4 L250.6 231 L243.6 233.6\" fill=\"none\" stroke=\"#8A8D7F\" stroke-width=\"0.9\" stroke-linejoin=\"round\"/><text x=\"20\" y=\"215\" font-size=\"11\" font-weight=\"600\" text-anchor=\"start\" fill=\"#2F6B47\" font-family=\"system-ui,-apple-system,sans-serif\">Nothing in your eyes</text><text x=\"190\" y=\"247\" font-size=\"9\" text-anchor=\"middle\" fill=\"#8A8D7F\" font-family=\"ui-monospace,monospace\" letter-spacing=\"0.8\">POOL 1.15\u00d7 THE DROP</text></svg>"};
var LAY_FAN={std:"<svg viewBox=\"0 0 400 430\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"The fan blades chop the light into moving shadows\"><defs><radialGradient id=\"pst\" cx=\"50%\" cy=\"50%\" r=\"50%\"><stop offset=\"0%\" stop-color=\"#E8A33D\" stop-opacity=\"0.52\"/><stop offset=\"45%\" stop-color=\"#E8A33D\" stop-opacity=\"0.26\"/><stop offset=\"100%\" stop-color=\"#E8A33D\" stop-opacity=\"0\"/></radialGradient><clipPath id=\"rmst\"><rect x=\"50.4\" y=\"46.4\" width=\"299.2\" height=\"299.2\" rx=\"3\"/></clipPath></defs><rect x=\"50.4\" y=\"46.4\" width=\"299.2\" height=\"299.2\" rx=\"3\" fill=\"#F6F4EC\" stroke=\"#15170F\" stroke-width=\"2.5\"/><g clip-path=\"url(#rmst)\"><circle cx=\"262.2\" cy=\"258.2\" r=\"138.7\" fill=\"url(#pst)\"/><circle cx=\"137.8\" cy=\"258.2\" r=\"138.7\" fill=\"url(#pst)\"/><circle cx=\"137.8\" cy=\"133.8\" r=\"138.7\" fill=\"url(#pst)\"/><circle cx=\"262.2\" cy=\"133.8\" r=\"138.7\" fill=\"url(#pst)\"/><path d=\"M200.0 196 L422.2 227.2 A 224.4 224.4 0 0 1 386.0 321.5 Z\" fill=\"#15170F\" fill-opacity=\"0.22\"/><path d=\"M200.0 196 L284.1 404.1 A 224.4 224.4 0 0 1 184.3 419.9 Z\" fill=\"#15170F\" fill-opacity=\"0.22\"/><path d=\"M200.0 196 L61.8 372.8 A 224.4 224.4 0 0 1 -1.7 294.4 Z\" fill=\"#15170F\" fill-opacity=\"0.22\"/><path d=\"M200.0 196 L-22.2 164.8 A 224.4 224.4 0 0 1 14.0 70.5 Z\" fill=\"#15170F\" fill-opacity=\"0.22\"/><path d=\"M200.0 196 L115.9 -12.1 A 224.4 224.4 0 0 1 215.7 -27.9 Z\" fill=\"#15170F\" fill-opacity=\"0.22\"/><path d=\"M200.0 196 L338.2 19.2 A 224.4 224.4 0 0 1 401.7 97.6 Z\" fill=\"#15170F\" fill-opacity=\"0.22\"/></g><path d=\"M200.0 196 L247.0 230.1\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.18\"/><path d=\"M200.0 196 L165.9 243.0\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.18\"/><path d=\"M200.0 196 L153.0 161.9\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.18\"/><path d=\"M200.0 196 L234.1 149.0\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.18\"/><path d=\"M200.0 196 L237.3 240.5\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.1\"/><path d=\"M200.0 196 L155.5 233.3\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.1\"/><path d=\"M200.0 196 L162.7 151.5\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.1\"/><path d=\"M200.0 196 L244.5 158.7\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.1\"/><path d=\"M200.0 196 L253.9 217.8\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M200.0 196 L178.2 249.9\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M200.0 196 L146.1 174.2\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M200.0 196 L221.8 142.1\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><circle cx=\"200.0\" cy=\"196\" r=\"58.1\" fill=\"none\" stroke=\"#8A8D7F\" stroke-width=\"1.2\" stroke-dasharray=\"5 5\"/><circle cx=\"200.0\" cy=\"196\" r=\"11\" fill=\"#15170F\"/><circle cx=\"262.2\" cy=\"258.2\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"262.2\" cy=\"258.2\" r=\"3.4\" fill=\"#15170F\"/><circle cx=\"137.8\" cy=\"258.2\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"137.8\" cy=\"258.2\" r=\"3.4\" fill=\"#15170F\"/><circle cx=\"137.8\" cy=\"133.8\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"137.8\" cy=\"133.8\" r=\"3.4\" fill=\"#15170F\"/><circle cx=\"262.2\" cy=\"133.8\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"262.2\" cy=\"133.8\" r=\"3.4\" fill=\"#15170F\"/><rect x=\"84.0\" y=\"16\" width=\"232\" height=\"42\" rx=\"21\" fill=\"#C0563E\"/><path d=\"M104.0 30.0 l14 14 M118.0 30.0 l-14 14\" stroke=\"#fff\" stroke-width=\"3.4\" stroke-linecap=\"round\"/><text x=\"131.0\" y=\"43.0\" font-size=\"17\" font-weight=\"700\" fill=\"#fff\" font-family=\"system-ui,-apple-system,sans-serif\">Flicker</text><text x=\"200.0\" y=\"80\" font-size=\"12.5\" font-weight=\"600\" text-anchor=\"middle\" fill=\"#15170F\" font-family=\"system-ui,-apple-system,sans-serif\">110\u00b0 standard downlights + ceiling fan</text><text x=\"200.0\" y=\"375.6\" font-size=\"13\" text-anchor=\"middle\" fill=\"#C0563E\" font-weight=\"600\" font-family=\"system-ui,-apple-system,sans-serif\">Blades cut the light</text><text x=\"200.0\" y=\"395.6\" font-size=\"11.5\" text-anchor=\"middle\" fill=\"#8A8D7F\" font-family=\"system-ui,-apple-system,sans-serif\">Wide beam spreads under the blades</text></svg>",low:"<svg viewBox=\"0 0 400 430\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"Four clean pools of light, the fan does not cut them\"><defs><radialGradient id=\"plg\" cx=\"50%\" cy=\"50%\" r=\"50%\"><stop offset=\"0%\" stop-color=\"#E8A33D\" stop-opacity=\"0.52\"/><stop offset=\"45%\" stop-color=\"#E8A33D\" stop-opacity=\"0.26\"/><stop offset=\"100%\" stop-color=\"#E8A33D\" stop-opacity=\"0\"/></radialGradient><clipPath id=\"rmlg\"><rect x=\"50.4\" y=\"46.4\" width=\"299.2\" height=\"299.2\" rx=\"3\"/></clipPath></defs><rect x=\"50.4\" y=\"46.4\" width=\"299.2\" height=\"299.2\" rx=\"3\" fill=\"#F6F4EC\" stroke=\"#15170F\" stroke-width=\"2.5\"/><g clip-path=\"url(#rmlg)\"><circle cx=\"262.2\" cy=\"258.2\" r=\"56.1\" fill=\"url(#plg)\"/><circle cx=\"137.8\" cy=\"258.2\" r=\"56.1\" fill=\"url(#plg)\"/><circle cx=\"137.8\" cy=\"133.8\" r=\"56.1\" fill=\"url(#plg)\"/><circle cx=\"262.2\" cy=\"133.8\" r=\"56.1\" fill=\"url(#plg)\"/></g><path d=\"M200.0 196 L253.9 217.8\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M200.0 196 L178.2 249.9\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M200.0 196 L146.1 174.2\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M200.0 196 L221.8 142.1\" stroke=\"#15170F\" stroke-width=\"9\" stroke-linecap=\"round\"/><circle cx=\"200.0\" cy=\"196\" r=\"58.1\" fill=\"none\" stroke=\"#8A8D7F\" stroke-width=\"1.2\" stroke-dasharray=\"5 5\"/><circle cx=\"200.0\" cy=\"196\" r=\"11\" fill=\"#15170F\"/><circle cx=\"262.2\" cy=\"258.2\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"262.2\" cy=\"258.2\" r=\"3.4\" fill=\"#15170F\"/><circle cx=\"137.8\" cy=\"258.2\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"137.8\" cy=\"258.2\" r=\"3.4\" fill=\"#15170F\"/><circle cx=\"137.8\" cy=\"133.8\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"137.8\" cy=\"133.8\" r=\"3.4\" fill=\"#15170F\"/><circle cx=\"262.2\" cy=\"133.8\" r=\"9\" fill=\"#fff\" stroke=\"#15170F\" stroke-width=\"2\"/><circle cx=\"262.2\" cy=\"133.8\" r=\"3.4\" fill=\"#15170F\"/><rect x=\"84.0\" y=\"16\" width=\"232\" height=\"42\" rx=\"21\" fill=\"#2F6B47\"/><path d=\"M103.0 37.0 l6 6.5 l12 -13\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><text x=\"131.0\" y=\"43.0\" font-size=\"17\" font-weight=\"700\" fill=\"#fff\" font-family=\"system-ui,-apple-system,sans-serif\">No flicker</text><text x=\"200.0\" y=\"80\" font-size=\"12.5\" font-weight=\"600\" text-anchor=\"middle\" fill=\"#15170F\" font-family=\"system-ui,-apple-system,sans-serif\">60\u00b0 low glare downlights + ceiling fan</text><text x=\"200.0\" y=\"375.6\" font-size=\"13\" text-anchor=\"middle\" fill=\"#2F6B47\" font-weight=\"600\" font-family=\"system-ui,-apple-system,sans-serif\">Blades miss the light</text><text x=\"200.0\" y=\"395.6\" font-size=\"11.5\" text-anchor=\"middle\" fill=\"#8A8D7F\" font-family=\"system-ui,-apple-system,sans-serif\">Narrow beam lands outside the blades</text></svg>"};
function glareCompare(){
  return '<div class="glarefig">'
    + '<div class="glarefig-pair">'
      + '<figure>'+LAY_BEAM.std+'</figure>'
      + '<figure>'+LAY_BEAM.low+'</figure>'
    + '</div>'
    + '<table class="glarefig-tbl"><tbody>'
      + '<tr><th>Pool width</th><td>2.9\u00d7 drop</td><td class="alt">1.2\u00d7 drop</td></tr>'
      + '<tr><th>Fittings, 20\u2009m\u00b2</th><td>4\u20135</td><td class="alt">8\u201310</td></tr>'
      + '<tr><th>Source visible</th><td>Yes</td><td class="alt">No</td></tr>'
      + '<tr><th>Under a fan</th><td>Flicker risk</td><td class="alt">Steady</td></tr>'
    + '</tbody></table>'
    + '<p class="glarefig-cap"><b>Standard</b> throws a pool 2.9\u00d7 the ceiling drop from a lamp at the '
    + 'ceiling face \u2014 fewer fittings, but the source is in view. <b>Low glare</b> sets the lamp back '
    + 'behind a baffle and narrows the cone to 1.2\u00d7 the drop \u2014 calmer room, roughly twice the fittings. '
    + 'The planner accounts for this automatically when it lays out a room.</p>'
    + '<h4 class="glarefig-sub">With a ceiling fan</h4>'
    + '<div class="glarefig-pair">'
      + '<figure>'+LAY_FAN.std+'</figure>'
      + '<figure>'+LAY_FAN.low+'</figure>'
    + '</div>'
    + '<p class="glarefig-cap">A wide cone reaches sideways under the blade sweep and every blade cuts it. '
    + 'A 60\u00b0 cone lands short of the blades, so the light stays steady with the fan running.</p>'
  + '</div>';
}

function renderPlaceTeach(){
  var p=byId(S.pick.pid),t=$('#teach-place');
  if(!p){t.innerHTML='';return;}
  var beam=parseBeam(p.beam),lm=parseLumens(p.lumens);
  var sp=spacingFor(S.ceiling,beam);
  var pool=poolDiameter(S.ceiling,beam);
  var h='<h5>What happens when you click</h5>';
  h+='Drops <b>'+S.pick.qty+'</b> × '+esc(p.id)+' as a '+
     ({row:'across',col:'up and down',grid:'block',line:'line you drag',fill:'room fill'}[S.pick.arr]||'across')+
     '. These are extras \u2014 they go on the plan and on your list, and they do not '+
     'change what is lighting a room.';
  if(p.cat==='downlights'){
    h+=' That is a <b>'+(fittingClass(p)==='lg'?'low glare':'standard')+'</b> fitting'+
       (beam?' at '+beam+'°':'')+'.';
  }
  h+=' At a <b>'+S.ceiling.toFixed(2)+' m</b> ceiling'+(beam?' with a '+beam+'° beam':'')+
     ' they get spaced <b>'+sp.toFixed(2)+' m</b> apart — roughly half the ceiling height, opened up for wider beams.';
  if(pool) h+=' Each throws a pool about <b>'+pool.toFixed(1)+' m</b> across at bench height.';
  if(p.cat==='downlights'||p.cat==='star') h+=glareCompare();
  if(!lm) h+='<br><br><span style="color:var(--danger)">This product has no lumen figure in the catalogue, so it cannot be counted automatically — place it by eye.</span>';
  if(!S.rooms.length)
    h+='<br><br><b>You probably want step 03 instead.</b> Draw a box around a room there and '+
       'the app works out the number and the spacing for you. This step is only for extras.';
  t.innerHTML=h;
}

/* The "what this room gets" panel is gone - it explained a choice the app
   makes for you, above the button you actually came to press. */
function renderRoomTeach(){
  var t=document.getElementById('teach-room'); if(!t) return;
  var b=ROOMS[S.roomType]||ROOMS.other;
  t.innerHTML='<h5>'+esc(b.label)+'</h5>'+
    (b.dl?'Downlights, usually <b>'+esc(b.cct)+'</b>. ':'Usually <b>'+esc(b.cct)+'</b>. ')+esc(b.note);
}

/* Three answers, and they are not the same thing:
     a number  - a reference was chosen, we already know the real length
     null      - 'something else', so the length has to be typed in
     undefined - nothing has been chosen yet, so nothing can happen at all.
   Everything downstream reads a guessed scale as a real one, which is how a
   plan ends up costed off a door that was never measured. */
function calRefChosen(){ return !!$('#calref').value; }
/* People type 3,6 as often as 3.6 - a comma is the decimal point in half the
   world and on most phone keypads. Take either, and ignore spaces. */
function calNum(v){
  if(v==null) return NaN;
  return parseFloat(String(v).replace(/\s+/g,'').replace(',','.'));
}
/* The custom length is asked BEFORE the points go on the plan, so this says
   whether we have everything we need to arm the two red points. */
function calReady(){
  var L=calRefLength();
  if(L===undefined) return false;
  if(L!==null) return true;
  var v=calNum($('#callen').value);
  return !!(v&&v>0);
}
function calRefLength(){
  var r=$('#calref').value;
  if(!r) return undefined;
  return r==='custom' ? null : parseFloat(r);
}
/* Work out the scale from where the two points are sitting, and say so - but
   leave the points on the plan and the step open, so they can keep adjusting.
   Returns false if something needed is still missing. */
function setScaleFromCal(){
  var preset=calRefLength();
  if(preset===undefined){toast('Pick what you are measuring first');$('#calref').focus();return false;}
  var v=preset!=null?preset:calNum($('#callen').value);
  var u=preset!=null?1:parseFloat($('#calunit').value);
  if(!v||v<=0){toast('Type the real length first');$('#callen').focus();return false;}
  if(!S.cal.px){toast('Put the 2 points on the plan first');return false;}
  snapshot();
  S.mpp=(v*u)/S.cal.px;
  $('#teach-scale').innerHTML='<h5>Scale locked in</h5>Your plan reads <b>'+
    (1/S.mpp).toFixed(1)+' px per metre</b>. The sheet covers about <b>'+
    (S.plan.w*S.mpp).toFixed(1)+' × '+(S.plan.h*S.mpp).toFixed(1)+' m</b>. '+
    'If that looks wrong, drag the 2 points again — everything downstream depends on it.';
  renderAll();
  renderCalHandles();          /* renderAll clears the guide layer */
  return true;
}
/* The deliberate one: set it, put the tool away and move on to the rooms. */
function applyScale(){
  if(!setScaleFromCal()) return;
  guideClear();
  toast('Scale set — 1 m is '+(1/S.mpp).toFixed(1)+' pixels');
  setTool('select');
  renderAll();
  openStep(3);
}

function wire(){
  el={canvas:$('#canvas'),sheet:$('#sheet'),ov:$('#ov'),img:$('#planimg'),blank:$('#blank'),
      gRooms:$('#g-rooms'),gFx:$('#g-fx'),gPools:$('#g-pools'),gGuide:$('#g-guide'),gGrid:$('#g-grid'),
      toasts:$('#toasts'),zoomv:$('#zoomv'),readout:$('#readout'),blankstate:$('#blankstate')};

  $$('.step-head').forEach(function(h){
    h.onclick=function(){
      var s=h.parentNode, was=s.classList.contains('open');
      $$('.step').forEach(function(x){x.classList.remove('open');});
      if(!was) s.classList.add('open');
      /* Opening one of the working steps means the setup is behind you again,
         so 01 and 02 fold back down out of the way. */
      if(+s.dataset.step>=3 && setupShown && S.plan.loaded && S.mpp){
        setupShown=false; renderSetupBar();
      }
    };
  });

  // plan input
  var fi=$('#file');
  $('#drop').onclick=function(){fi.click();};
  $('#btn-start').onclick=function(){openStep(1);fi.click();};
  fi.onchange=function(){handleFile(fi.files[0]);fi.value='';};
  ['dragenter','dragover'].forEach(function(ev){
    $('#drop').addEventListener(ev,function(e){e.preventDefault();$('#drop').classList.add('over');});
  });
  ['dragleave','drop'].forEach(function(ev){
    $('#drop').addEventListener(ev,function(e){e.preventDefault();$('#drop').classList.remove('over');});
  });
  $('#drop').addEventListener('drop',function(e){handleFile(e.dataTransfer.files[0]);});
  el.canvas.addEventListener('dragover',function(e){e.preventDefault();});
  el.canvas.addEventListener('drop',function(e){e.preventDefault();handleFile(e.dataTransfer.files[0]);});
  $('#btn-demo').onclick=samplePlan;
  $('#btn-start-demo').onclick=samplePlan;
  $('#btn-clearplan').onclick=function(){
    S.plan={src:null,name:null,w:1600,h:1100,loaded:false};S.mpp=null;renderAll();fitView();
  };

  // scale
  $('#btn-cal').onclick=function(){
    if(!S.plan.loaded){toast('Load a plan first');return;}
    if(!calRefChosen()){toast('Pick what you are measuring first');$('#calref').focus();return;}
    if(!calReady()){toast('Type how long it really is first');$('#callen').focus();return;}
    setTool(S.tool==='scale'?'select':'scale');
  };
  $('#btn-calapply').onclick=applyScale;
  /* The length is wanted BEFORE the points go down, so the button that puts
     them there only wakes up once we know what we are measuring AND how long
     it is. Nothing is pre-chosen: the old default quietly scaled every plan
     off an 820 mm door whether or not there was one on the drawing. */
  function calSync(){
    var custom=$('#calref').value==='custom';
    $('#calcustom').style.display=custom?'':'none';
    var ok=calReady();
    $('#btn-cal').disabled=!ok;
    refreshCalApply();
    if(ok && S.cal.px) setScaleFromCal();
    else if(S.tool==='scale') setTool('scale');   // refresh the on-plan instruction
  }
  $('#calref').onchange=calSync;
  $('#callen').oninput=function(){ calSync(); };
  calSync();
  $('#callen').addEventListener('keydown',function(e){
    if(e.key!=='Enter') return;
    if(S.cal.px) applyScale(); else $('#btn-cal').click();
  });
  $('#ceil').onchange=function(){S.ceiling=parseFloat(this.value);renderAll();};

  // rooms
  renderSpecial();
  var hx=$('#howto-x');
  if(hx) hx.onclick=function(){ hideHowTo(); specPick=null; renderSpecial(); setTool('select'); };

  var nb=$('#nextup');
  if(nb) nb.onclick=function(){
    var n=+(this.dataset.step||1);
    openStep(n);
    var el=step(n); if(el&&el.scrollIntoView) el.scrollIntoView({block:'start',behavior:'smooth'});
  };
  $('#rtype').onchange=function(){
    S.roomType=this.value;
    renderRoomTeach();
    /* Whether the room is a wet one decides if the bathroom fittings show up
       in the fan list, so both the counts and the list have to follow it. */
    refreshCatCounts();
    refreshProducts();
  };
  $('#btn-room').onclick=function(){
    if(!S.plan.loaded){toast('Load a plan first');return;}
    setTool(S.tool==='room'?'select':'room');
  };

  // products
  $('#cat').onchange=function(){
    S.pick.cat=this.value;S.pick.q='';$('#prodsearch').value='';
    refreshProducts();renderPlaceTeach();
  };
  $('#prodsearch').oninput=function(){S.pick.q=this.value.trim();refreshProducts();};
  $('#arr').onchange=function(){S.pick.arr=this.value;renderPlaceTeach();};
  $('#btn-place').onclick=function(){
    if(!S.pick.pid){toast('Pick a fitting first');return;}
    setTool(S.tool==='place'?'select':'place');
    if(S.tool==='place') toast(S.pick.arr==='line'?'Drag across the plan':
      S.pick.arr==='fill'?'Click inside a room box':'Click where you want them');
  };

  // toolbar
  $('#armed-cancel').onclick=function(){setTool('select');guideClear();};
  $('#navhint-x').onclick=function(){S.hintSeen=true;$('#navhint').hidden=true;};
  $('#t-zoomin').onclick=function(){zoomStepBtn(1);};
  $('#t-zoomout').onclick=function(){zoomStepBtn(-1);};
  $('#zoomv').onclick=function(){zoomTo(1);};
  $('#t-help').onclick=showHelp;
  $('#btn-faq').onclick=showFaq;
  $('#t-fit').onclick=function(){fitView();toast('Whole plan back on screen');};
  $('#t-beams').onclick=function(){S.showPools=!S.showPools;this.classList.toggle('on',S.showPools);renderFixtures();};
  $('#t-labels').onclick=function(){S.showLabels=!S.showLabels;this.classList.toggle('on',S.showLabels);renderFixtures();};
  $('#t-grid').onclick=function(){S.showGrid=!S.showGrid;this.classList.toggle('on',S.showGrid);renderGrid();};
  $('#t-undo').onclick=undo;
  $('#t-rotl').onclick=function(){rotateSelected(-1);};
  $('#t-rotr').onclick=function(){rotateSelected(1);};
  $('#t-aimreset').onclick=function(){resetAim();};
  $('#t-group').onclick=function(){groupSelected();};
  $('#t-ungroup').onclick=function(){ungroupSelected();};
  $('#t-del').onclick=delSel;
  $('#t-clear').onclick=function(){
    if(!S.fixtures.length&&!S.rooms.length) return;
    snapshot();
    S.fixtures=[];S.sel=[];S.rooms=[];S.hiRoom=null;
    S.roomPid={};S.roomFan={};S.roomAskFan={};S.roomComfort={};S.roomOpen={};
    renderAll();
    toast('Cleared \u2014 fittings and room boxes. Undo brings them back');
  };

  // canvas pointer
  el.canvas.addEventListener('pointerdown',function(e){
    hidePlanHint();
    // Overlay cards sit inside the canvas. Capturing the pointer here would
    // send their click to the canvas instead of the button, so leave them alone.
    /* The rooms-finished panel and the legend also live inside the canvas.
       Capturing their pointerdown sent every click on the panel header - and
       on its per-room fitting dropdowns - to the canvas instead, which is why
       the panel read as a dead box. */
    if(e.target.closest&&e.target.closest('.blankcard,.navhint,.donep,.fxlegend')) return;
    el.canvas.setPointerCapture(e.pointerId);onDown(e);
  });
  el.canvas.addEventListener('pointermove',onMove);
  el.canvas.addEventListener('pointerup',onUp);
  el.canvas.addEventListener('pointerleave',function(){ if(!drag) guideClear(); });
  el.canvas.addEventListener('pointercancel',onUp);
  el.canvas.addEventListener('wheel',function(e){
    e.preventDefault();
    var unit=e.deltaMode===1?16:(e.deltaMode===2?400:1);
    if(wheelIntent(e)==='zoom'){
      // Capped per event so one notch of a mouse wheel is a gentle step,
      // while a trackpad pinch still feels continuous.
      var d=Math.max(-120,Math.min(120,e.deltaY*unit));
      zoomAt(Math.pow(0.9975,d),e.clientX,e.clientY);
    }else{
      var dx=(e.shiftKey?e.deltaY:e.deltaX)*unit, dy=(e.shiftKey?0:e.deltaY)*unit;
      S.panX-=dx; S.panY-=dy; applyView();
    }
  },{passive:false});

  // keys
  /* Collapsing it is remembered for the session - somebody working on a busy
     plan wants it out of the way, and having it spring back open on every
     re-render would be worse than not having it. */
  var dph=document.getElementById('donep-h');
  if(dph) dph.onclick=function(){ document.getElementById('donep').classList.toggle('shut'); };

  document.addEventListener('keydown',function(e){
    if(/input|textarea|select/i.test(e.target.tagName)) return;
    if(e.code==='Space'){spaceDown=true;e.preventDefault();}
    if(e.key==='Escape'){
      /* First Esc puts the armed tool down; a second one lets go of whatever
         is selected — the two things people mean by "stop". */
      if(S.tool!=='select'){setTool('select');}
      else if(S.sel.length){S.sel=[];renderAll();}
      guideClear();
    }
    if(e.key==='Delete'||e.key==='Backspace'){delSel();e.preventDefault();}
    if(/^Arrow/.test(e.key)&&S.sel.length){
      var step=S.mpp?m2px(e.shiftKey?0.1:0.01):(e.shiftKey?10:1);
      var dx=(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0);
      var dy=(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);
      snapshot();
      S.fixtures.forEach(function(f){
        if(S.sel.indexOf(f.id)>-1){f.x=Math.round(f.x+dx);f.y=Math.round(f.y+dy);}
      });
      renderAll();e.preventDefault();return;
    }
    if(e.key==='+'||e.key==='=')zoomStepBtn(1);
    if(e.key==='-'||e.key==='_')zoomStepBtn(-1);
    if(e.key==='0')fitView();
    if(e.key==='?')showHelp();
    if(e.key==='['){rotateSelected(-1);e.preventDefault();}
    if(e.key===']'){rotateSelected(1);e.preventDefault();}
    if(e.key==='v'||e.key==='V')setTool('select');
    if(e.key==='p'||e.key==='P')$('#btn-place').click();
    if(e.key==='r'||e.key==='R')$('#btn-room').click();
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){undo();e.preventDefault();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){S.sel=S.fixtures.map(function(f){return f.id;});renderFixtures();renderReadout();e.preventDefault();}
  });
  document.addEventListener('keyup',function(e){if(e.code==='Space')spaceDown=false;});

  // export
  $('#btn-png').onclick=function(){
    composeExport(function(c){
      if(!c)return toast('Export failed \u2014 try again');
      var base=(($('#projname').value||'plan').replace(/[^\w\- ]+/g,'')||'plan');
      download(base+'-plan.png',c.plan.toDataURL('image/png'));
      setTimeout(function(){
        download(base+'-lights.png',c.summary.toDataURL('image/png'));
        toast('2 PNGs downloaded \u2014 the plan, and the lights list');
      },350);
    });
  };
  $('#btn-print').onclick=doPrint;
  $('#btn-save').onclick=function(){
    toast('Building the PDF\u2026');
    composeExport(function(c){
      if(!c)return toast('Export failed \u2014 try again');
      var url=URL.createObjectURL(canvasToPdfBlob([c.plan,c.summary]));
      download((($('#projname').value||'plan').replace(/[^\w\- ]+/g,'')||'plan')+'.pdf',url);
      setTimeout(function(){URL.revokeObjectURL(url);},4000);
      toast('PDF downloaded \u2014 plan on page 1, lights on page 2');
    });
  };
  $('#btn-open').onclick=function(){$('#loadfile').click();};
  $('#loadfile').onchange=function(){
    var f=this.files[0];if(!f)return;
    var fr=new FileReader();
    fr.onload=function(){
      try{
        applyPlan(JSON.parse(fr.result));toast('Layout reopened');
      }catch(err){toast('That file would not open');}
    };
    fr.readAsText(f);this.value='';
  };
  $('#btn-copy').onclick=function(){
    var t=scheduleText();
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(function(){toast('Schedule copied');},function(){showModal('Light schedule','<pre style="white-space:pre-wrap;font-family:\'JetBrains Mono\',monospace;font-size:11.5px">'+esc(t)+'</pre>');});
    } else showModal('Light schedule','<pre style="white-space:pre-wrap;font-family:monospace;font-size:11.5px">'+esc(t)+'</pre>');
  };
  $('#btn-enq').onclick=function(){
    if(window.__TUT) window.__TUT.openSend();
  };
  $('#mclose').onclick=function(){$('#modal').classList.remove('open');};
  $('#modal').onclick=function(e){if(e.target===this)this.classList.remove('open');};

  window.addEventListener('resize',function(){if(!S.plan.loaded)fitView();});
}
function showHelp(){
  showModal('Moving around the plan',
   '<ul class="helplist">'+
   '<li><b>Move the plan</b><span>Click anywhere on it and drag. Same as sliding a piece of paper across a desk.</span></li>'+
   '<li><b>Zoom in and out</b><span>The <b>−</b> and <b>+</b> buttons above the plan. On a laptop trackpad you can also pinch; with a mouse, hold <b>Ctrl</b> and roll the wheel.</span></li>'+
   '<li><b>Scroll</b><span>Roll the wheel or swipe two fingers to slide the plan up and down. Hold <b>Shift</b> to go sideways.</span></li>'+
   '<li><b>Lost the plan?</b><span>Press <b>Fit plan</b>. It finds the drawing on the page — ignoring blank margins and the title block — and sizes it to the screen. The plan can never disappear completely.</span></li>'+
   '<li><b>Back to normal size</b><span>Click the percentage. Or press <b>0</b> to fit, <b>+</b> and <b>−</b> to zoom.</span></li>'+
   '<li><b>Move a light</b><span>Click the light itself and drag it — it snaps into line with the others, and shows you the gap in metres as you go. To pick several, hold <b>Shift</b> and drag a box around them.</span></li>'+
   '<li><b>Nudge a light</b><span>Select it and use the <b>arrow keys</b>. Each press is 10 mm on the plan; hold <b>Shift</b> for 100 mm.</span></li>'+
   '<li><b>Made a mistake?</b><span><b>Undo</b> is in the bar above the plan, or press <b>Ctrl</b> and <b>Z</b>.</span></li>'+
   '</ul>');
}
function showModal(title,html){
  $('#mtitle').textContent=title;$('#mbody').innerHTML=html;$('#modal').classList.add('open');
}

/* ---------- FAQ ----------
   Every piece of reasoning the planner acts on, in one place. The panels the
   sidebar used to carry ("why it matters", the fan pre-question) folded into
   here, so the steps stay short and the answers stay findable. */
function faqItem(q,a){
  return '<details class="moreinfo"><summary>'+q+'</summary>'+
         '<div class="moreinfo-body"><div class="teach" style="margin-top:10px">'+a+'</div></div></details>';
}
function showFaq(){
  showModal('How the planner thinks',
    '<p>Short answers to the questions the planner is quietly answering for you. '+
    'Open the one you are wondering about.</p>'+

    faqItem('How does it know how many lights a room needs?',
      'Room size and room type. Standard rules of thumb give a count for the '+
      'floor area, and the room type adjusts it — a hallway wants one fitting '+
      'every 2–2.5 m down the centre line, a small room takes one or two at '+
      'most, and a bathroom is capped at two. On bigger rooms the room card also '+
      'asks whether you want it <b>more comfortable</b> (fewer, softer) or '+
      '<b>brighter</b> (the full count) — both are correct, they are just '+
      'different houses.')+

    faqItem('What about fans?',
      'Each room that can take a ceiling fan — bedrooms and the alfresco — '+
      'asks you when you draw it. <b>A fan with a light in it does the room on its '+
      'own</b>, so no downlights go in underneath. A fan without a light gets '+
      FAN_DL_COUNT+' × 60° low glare downlights around it. Exhaust fans '+
      'belong in bathrooms and laundries, and the planner will not let either kind '+
      'be dropped anywhere else.<p style="margin-top:8px">Any room with a fan is '+
      'laid out in <b>60° low glare</b>: a wide beam crossing the blades gives '+
      'you shadow flicker, and that is the most common complaint about a new '+
      'install.</p>')+

    faqItem('Low glare or standard — which downlight where?',
      '<b>Low glare (60°)</b> fittings sit deeper in the ceiling so you do not '+
      'look into the LED. They go where people sit and look up at night: living, '+
      'dining, bedrooms, the study — and every fan room. <b>Standard (90–'+
      '100°)</b> fittings spread wider, so fewer do more — right for '+
      'kitchens, hallways and work spaces where output matters more than comfort.')+

    faqItem('What do the dashed circles around each light mean?',
      'That is the pool of useful light the fitting throws at your ceiling height '+
      '— worked out from its beam angle, not guessed. Pools should overlap a '+
      'little; gaps between pools are the dark patches you would live with. '+
      'Downlights also want to sit about <b>650–750 mm off the wall</b> — '+
      'closer scallops the wall, further leaves the edge of the room dim. The '+
      'planner colours the gap as you drag.')+

    faqItem('Why are some rooms warm white and others not?',
      'Rooms you relax in — living, dining, bedrooms, alfresco — get '+
      '<b>3000K warm white</b>. Rooms you work in — kitchen, bathroom, '+
      'laundry, study — get <b>4000K natural white</b>. The garage gets '+
      '<b>5000K bright white</b>. Mixing them mid-room is what makes a house feel '+
      'off, so the planner keeps each room to one temperature.')+

    faqItem('Why does the bathroom not just get downlights?',
      'One or two downlights at most — and the better answer is a sealed '+
      '25 W 3-CCT ceiling light: bright enough on its own, no cut-outs over '+
      'the shower, and rated for the moisture. Every bathroom and laundry also '+
      'needs an exhaust fan — take the version with the light in it and the '+
      'room is done. Wet areas (bathroom, laundry, alfresco) need fittings with '+
      'the right IP rating, which is why the planner tracks them separately.')+

    faqItem('What are star lights, and why do they move as a group?',
      'Small 3 W points of light — alfresco ceilings, feature nooks, '+
      'stair risers — set about 500 mm apart. A run of them is one feature, '+
      'not eight separate fittings, so the planner places them as a group that '+
      'moves as one, with a faint string showing the run. <b>Ungroup</b> on the '+
      'toolbar frees each dot when you are threading them between walls.')+

    faqItem('Battens — where do they fit?',
      'Battens are the garage, laundry and shed answer: a 1.2 m batten throws far '+
      'more light per dollar than downlights and needs no ceiling cut-outs. The '+
      'planner puts one in a garage for you.')+

    faqItem('What about strip lighting?',
      'Strip is not something you lay out on a floor plan. It is sold per metre, and '+
      'the run length, the channel it sits in, the driver that powers it and the '+
      'controller all depend on each other — get one wrong and the run does not '+
      'work. Plan your downlights here, then talk to us about the strip: call '+
      '(08) 9297 2969 or come into the Ellenbrook showroom and we will size '+
      'the whole run with you.')+

    faqItem('Can I trust the plan enough to build from it?',
      'It is a real plan in real metres — counts, spacings and prices your '+
      'electrician can work from. But quantities come from rules of thumb applied '+
      'to what you drew, so <b>every layout must be verified on site by your '+
      'licensed electrician</b> before ordering: measurements, joist positions, '+
      'ceiling access, IP ratings and circuit loads.'));
}
/* Turn the selected wall lights. The auto-facing gets a rectangular room
   right nearly every time, but a plan with a diagonal wall, a return, a light
   on a post or one deliberately washing along a wall needs a hand. 15 deg
   steps: 45 was too coarse to aim a light down a path, and anything finer is
   false precision on a floor plan.
   Turning marks the fitting as hand-aimed, which is what stops the next drag
   from snapping it back to facing the nearest wall. */
var ROT_STEP=15;
function rotateSelected(dir){
  var hit=0;
  S.fixtures.forEach(function(f){
    if(S.sel.indexOf(f.id)===-1) return;
    if(!isWallLight(byId(f.pid))) return;
    if(!hit) snapshot();
    f.rot=(((typeof f.rot==='number'?f.rot:0)+dir*ROT_STEP)%360+360)%360;
    f.aimed=true;
    hit++;
  });
  if(!hit){ toast('Select an outdoor wall light first, then use the turn buttons (or press [ and ])'); return; }
  renderAll();
  toast(hit>1?hit+' wall lights turned':'Wall light turned');
}
/* Put a hand-aimed light back on automatic, so it faces away from the nearest
   wall again. Without this there is no way back from a bad aim except undo. */
function resetAim(){
  var hit=0;
  S.fixtures.forEach(function(f){
    if(S.sel.indexOf(f.id)===-1) return;
    if(!isWallLight(byId(f.pid))) return;
    if(!hit) snapshot();
    delete f.aimed; f.rot=wallFacing(f.x,f.y);
    hit++;
  });
  if(!hit){ toast('Select an outdoor wall light first'); return; }
  renderAll(); toast('Facing away from the nearest wall again');
}
/* The selected wall lights, in one place - the aim handle and the toolbar
   both need to know whether there are any. */
function selectedWallLights(){
  return S.fixtures.filter(function(f){
    return S.sel.indexOf(f.id)>-1 && isWallLight(byId(f.pid));
  });
}
/* Where the aim handle sits for a given wall light: out in front of it, in the
   direction it throws. Returned in image coordinates. */
function aimHandlePt(f){
  var a=((typeof f.rot==='number'?f.rot:0)-90)*Math.PI/180;
  var d=Math.max(26, 34/S.zoom);
  return {x:f.x+Math.cos(a)*d, y:f.y+Math.sin(a)*d};
}
/* Hit test for the aim handle, so a finger or a mouse can grab it. Generous on
   purpose: this is the control people will use on a phone. */
function aimHandleAt(pt){
  var tol=Math.max(14, 18/S.zoom);
  var hit=null;
  selectedWallLights().forEach(function(f){
    var h=aimHandlePt(f);
    if(Math.hypot(pt.x-h.x, pt.y-h.y)<=tol) hit=f;
  });
  return hit;
}
/* Point the dragged light at wherever the finger is, snapped to 15 deg. */
function aimTowards(f,pt){
  var ang=Math.atan2(pt.y-f.y, pt.x-f.x)*180/Math.PI + 90;
  f.rot=((Math.round(ang/ROT_STEP)*ROT_STEP)%360+360)%360;
  f.aimed=true;
}

function delSel(){
  if(!S.sel.length){toast('Nothing selected');return;}
  snapshot();
  var n=S.sel.length;
  S.fixtures=S.fixtures.filter(function(f){return S.sel.indexOf(f.id)===-1;});
  S.sel=[];renderAll();toast(n+' removed');
}

/* ---------- grouping ----------
   A run of star lights strung between two walls is one feature, not eight
   separate fittings. Grouped fittings select and move as one - click any
   member and the whole run comes with it; shift-click still picks members
   individually. Ungroup hands each dot back. */
function groupSelected(){
  var sel=S.fixtures.filter(function(f){return S.sel.indexOf(f.id)>-1;});
  if(sel.length<2){toast('Select two or more fittings to group');return;}
  snapshot();
  var g='g'+(S.seq++);
  sel.forEach(function(f){f.grp=g;});
  renderFixtures();renderReadout();
  toast(sel.length+' fittings grouped \u2014 they move as one now');
}
function ungroupSelected(){
  var sel=S.fixtures.filter(function(f){return S.sel.indexOf(f.id)>-1&&f.grp;});
  if(!sel.length){toast('Nothing grouped is selected');return;}
  snapshot();
  sel.forEach(function(f){delete f.grp;});
  renderFixtures();renderReadout();
  toast('Ungrouped \u2014 each fitting moves on its own');
}
/* ---------- boot ---------- */
function init(){
  wire();buildSelects();setTool('select');renderAll();fitView();
  if(/[?&]qa=1/.test(location.search)&&window.__GHQA) window.__GHQA();
}

/* Load a saved plan object (the .ghlayout shape) into the planner. Used by
   the Open button and by layout-admin.html's "Open in planner" links. */
function applyPlan(d){
  S.plan=d.plan||S.plan;S.mpp=d.mpp;S.ceiling=d.ceiling||2.7;
  S.fixtures=d.fixtures||[];S.rooms=d.rooms||[];S.seq=d.seq||1;S.sel=[];
  $('#projname').value=d.name||'Untitled plan';
  $('#ceil').value=String(S.ceiling);
  renderAll();fitView();
  /* A loaded plan is a plan being REVIEWED - open the rooms step so the
     rail shows the room list (and the staff editing flow matches the
     normal one) instead of landing back on step 1. */
  try{if(S.rooms.length)openStep(3);}catch(e){}
}

window.__GH={
  applyPlan:applyPlan,
  parseLumens:parseLumens,countForRoom:countForRoom,fittingClass:fittingClass,bandFor:bandFor,bandLabel:bandLabel,DL_BANDS:DL_BANDS,ptToMm:ptToMm,paperName:paperName,mppFromPaper:mppFromPaper,snapToFittings:snapToFittings,nearestGap:nearestGap,symbolFor:symbolFor,productMatches:productMatches,visibleProducts:visibleProducts,recommendedId:recommendedId,productSpecLine:productSpecLine,parseBeam:parseBeam,parseWatts:parseWatts,parseCutout:parseCutout,
  spacingFor:spacingFor,wallOffsetFor:wallOffsetFor,
  isBathroomFitting:isBathroomFitting,exhaustMode:exhaustMode,exhaustForRoom:exhaustForRoom,SPECIAL:SPECIAL,renderSpecial:renderSpecial,applySpecial:applySpecial,setSpecial:function(k,n,a){specPick=k;if(n)S.pick.qty=n;if(a)specArr=a;renderSpecial();if(k)applySpecial();},isCeilingFanProduct:isCeilingFanProduct,isALight:isALight,
  isRoomLight:isRoomLight,fanForRoom:fanForRoom,lowGlareDownlight:lowGlareDownlight,
  FAN_DL_COUNT:FAN_DL_COUNT,fanShortName:fanShortName,
  roomFanMode:roomFanMode,fanInRoom:fanInRoom,enforceLowGlare:enforceLowGlare,
  placementBlock:placementBlock,roomFittingFor:roomFittingFor,placeAs:placeAs,
  nextAction:nextAction,extraFixtures:extraFixtures,
  setRoomLight:function(id,pid){ S.roomPid[id]=pid; },
  poolDiameter:poolDiameter,rowPoints:rowPoints,gridPoints:gridPoints,linePoints:linePoints,
  fillPoints:fillPoints,gridInRoom:gridInRoom,pointInRect:pointInRect,incGST:incGST,money:money,
  bomLines:bomLines,bomTotals:bomTotals,ROOMS:ROOMS,CATS:CATS,PRODUCTS:PRODUCTS,S:S,
  roomName:roomName,renderDoneRooms:renderDoneRooms,
  isStarLight:isStarLight,isWallLight:isWallLight,STAR_SPACING_M:STAR_SPACING_M,groupSelected:groupSelected,ungroupSelected:ungroupSelected,showFaq:showFaq,
  isBigRoom:isBigRoom,roomComfort:roomComfort,applyComfort:applyComfort,COMFORT:COMFORT,
  wallFacing:wallFacing,rotateSelected:rotateSelected,resetAim:resetAim,
  aimTowards:aimTowards,aimHandlePt:aimHandlePt,aimHandleAt:aimHandleAt,ROT_STEP:ROT_STEP,
  smartLights:smartLights,pickerGroupProducts:pickerGroupProducts,
  DATA_ONLY_CATS:DATA_ONLY_CATS,PICKER_MAIN:PICKER_MAIN,pickerLabel:pickerLabel,plainName:plainName,
  symbolSvg:symbolSvg,fxKind:fxKind,
  addFixtures:addFixtures,undo:undo,snapshot:snapshot,byId:byId,catProducts:catProducts,
  setPick:function(o){
    Object.keys(o).forEach(function(k){S.pick[k]=o[k];});
    if(document.getElementById('cat')){
      document.getElementById('cat').value=S.pick.cat;
      refreshProducts();
      document.getElementById('arr').value=S.pick.arr;
      renderPlaceTeach();
    }
  },
  doFill:doFill,garageFitting:garageFitting,roomIsDone:roomIsDone,roomIsOpen:roomIsOpen,roomFittings:roomFittings,recommendForRoom:recommendForRoom,renderAll:renderAll,roomSummary:roomSummary,doPrint:doPrint,init:init,composePNG:composePNG,composeExport:composeExport,canvasToPdfBlob:canvasToPdfBlob,scheduleText:scheduleText,
  fit:fitView,fitBox:fitBox,contentBox:contentBox,padBox:padBox,mainSpan:mainSpan,toolState:toolState,groupPointsAt:groupPointsAt,calRefLength:calRefLength,applyScale:applyScale,renderPdfPager:renderPdfPager,zoomStep:zoomStep,clampPan:clampPan,wheelIntent:wheelIntent,zoomTo:zoomTo,showHelp:showHelp,renderTools:renderTools,recommendProduct:recommendProduct,bestValue:bestValue,showModal:showModal
};

/* Handed back rather than called: the page used to run init() on
   DOMContentLoaded, after every script had loaded. The component calls it at
   that same point, once home.js has put window.__TUT in place (the QA suite,
   which init() may run, reads it). */
return init;
}
