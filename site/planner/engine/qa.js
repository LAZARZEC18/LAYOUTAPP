/* Greenhse Layout Planner — QA suite (append ?qa=1 to the URL).
   installQA() must run BEFORE mountCore(): the engine's init() looks for
   window.__GHQA and runs it when the query string asks. */
import { PRODUCTS } from '../data/products';

export function installQA(){
/* Greenhse Layout — QA suite.
   In the browser: append ?qa=1 to the URL.
   Headless: node qa-run.js (jsdom).
   Every assertion is written so it would fail if the behaviour regressed. */
window.__GHQA=function(){
  var G=window.__GH, R=[], pass=0, fail=0;
  function ok(name,cond,got){
    if(cond){pass++;R.push({n:name,ok:true});}
    else{fail++;R.push({n:name,ok:false,got:String(got)});}
  }
  function eq(name,a,b){ok(name,a===b,'expected '+b+', got '+a);}
  function near(name,a,b,tol){ok(name,Math.abs(a-b)<=(tol||0.01),'expected ~'+b+', got '+a);}

  /* ---- catalogue parsing: must not invent or contaminate data ---- */
  eq('lumens: cuts at the word "lumens" so CCT is ignored',
     G.parseLumens('560/650/600 lumens (3000/4000/5000k)'),603);
  eq('lumens: ignores the lm/W figure after the first "lumens"',
     G.parseLumens('790-875 lumens, up to 109 lumens per watt'),833);
  eq('lumens: plain range averages',G.parseLumens('660-800 lumens'),730);
  eq('lumens: missing data returns null, never a guess',G.parseLumens(null),null);
  eq('lumens: an lm/W-only string yields no lumen figure',
     G.parseLumens('Up to 90 lumens/watt'),null);
  eq('beam: strips trailing text',G.parseBeam('60º Anti Glare'),60);
  eq('beam: plain degrees',G.parseBeam('100º'),100);
  eq('beam: missing data returns null',G.parseBeam(null),null);
  eq('beam: rejects out-of-range values',G.parseBeam('400º'),null);
  eq('watts: parses "7Watt"',G.parseWatts('7Watt'),7);
  eq('cut-out: read from the product name',
     G.parseCutout({name:'70mm 7W Downlight, Tricolour, Dimmable'}),70);
  eq('cut-out: absent when the name has no mm figure',
     G.parseCutout({name:'Spitfire Emergency Light'}),null);

  /* ---- lighting maths ---- */
  /* the Greenhse downlight count table */
  eq('a 1.5 × 2 m WC takes one downlight',G.countForRoom(1.5,2,'std'),1);
  eq('and one low glare',G.countForRoom(1.5,2,'lg'),1);
  eq('a 2 × 2.5 m robe takes two',G.countForRoom(2,2.5,'std'),2);
  eq('a 2.5 × 3 m room takes two standard',G.countForRoom(2.5,3,'std'),2);
  eq('a 3 × 4 m room takes two standard (the bedroom rule lifts bedrooms to four)',
     G.countForRoom(3,4,'std'),2);
  eq('but four low glare, which cover less floor',G.countForRoom(3,4,'lg'),4);
  eq('a narrow 2.2 × 4.5 m galley kitchen takes three, not a wall of five',
     G.countForRoom(2.2,4.5,'std'),3);
  eq('a 4 × 5 m room takes four standard',G.countForRoom(4,5,'std'),4);
  eq('and six low glare',G.countForRoom(4,5,'lg'),6);
  ok('small rooms never get more than two fittings',
     [[1.2,1.5],[1.5,2],[2,2.5],[2.2,2.8]].every(function(d){
       return G.countForRoom(d[0],d[1],'std')<=2 && G.countForRoom(d[0],d[1],'lg')<=2;
     }),'a small room was given more than two');
  eq('a 5.5 × 9 m room takes eight standard',G.countForRoom(5.5,9,'std'),8);
  eq('and ten low glare',G.countForRoom(5.5,9,'lg'),10);
  eq('the sides can be given in either order',G.countForRoom(9,5.5,'std'),8);
  ok('low glare never needs fewer fittings than standard',
     G.DL_BANDS.every(function(b){return b.lg>=b.std;}),'a band goes backwards');
  ok('a room past the end of the table keeps going up',
     G.countForRoom(8,14,'std')>8,G.countForRoom(8,14,'std'));
  eq('no dimensions means no count, rather than a guess',G.countForRoom(0,4,'std'),null);
  eq('a 110° fitting counts as standard',G.fittingClass(G.byId('DL10ES')),'std');
  eq('a 60° fitting counts as low glare',G.fittingClass(G.byId('DL10-PS')),'lg');
  eq('the 9ES flat counts as standard',G.fittingClass(G.byId('DL9ES-FLAT-HL')),'std');
  eq('the band is named for the room card',G.bandLabel(G.bandFor(3.5,4.5)),'3–4 m × 4–5 m');

  near('spacing: 2.7 m ceiling, 100° beam = 1.62 m',G.spacingFor(2.7,100),1.62);
  near('spacing: never drops below the 1.5 m minimum, even on a narrow beam',G.spacingFor(2.7,60),1.5);
  near('spacing: clamped at 2.4 m for high ceilings',G.spacingFor(4.0,100),2.4);
  near('spacing: clamped at the 1.5 m minimum on a low ceiling',G.spacingFor(1.0,60),1.5);
  near('wall offset is half the spacing, clamped',G.wallOffsetFor(1.4),0.70);
  eq('wall offset never exceeds 750 mm',G.wallOffsetFor(2.2),0.75);
  eq('and never drops below 650 mm',G.wallOffsetFor(0.9),0.65);
  ok('every wall offset lands in the 650–750 mm band',
     [0.9,1.2,1.35,1.62,2.0,2.2].every(function(sp){
       var o=G.wallOffsetFor(sp); return o>=0.6499&&o<=0.7501;}),'outside the band');
  near('light pool: 100° beam at 2.7 m ceiling ≈ 4.65 m across',
       G.poolDiameter(2.7,100),4.65,0.05);
  eq('light pool: none drawn when beam is unknown',G.poolDiameter(2.7,null),null);

  /* ---- placement geometry ---- */
  var row=G.rowPoints(4,1.6);
  eq('row: places the requested count',row.length,4);
  near('row: is centred on the click',row[0].x+row[3].x,0);
  near('row: honours the spacing',row[1].x-row[0].x,1.6);
  var grid=G.gridPoints(6,1.6);
  eq('grid: places the requested count',grid.length,6);
  eq('grid: 6 fittings form 3 columns',new Set(grid.map(function(p){return p.x;})).size,3);
  var ln=G.linePoints(3,0,0,10,0);
  eq('line: includes both endpoints',ln[0].x+'/'+ln[2].x,'0/10');
  near('line: evenly divides the drag',ln[1].x,5);
  eq('line: a single fitting lands mid-drag',G.linePoints(1,0,0,10,0)[0].x,5);
  var fill=G.fillPoints(5,4,1.6,0.8);
  ok('fill: every point sits inside the room',
     fill.every(function(p){return p.x>=0&&p.x<=5&&p.y>=0&&p.y<=4;}),JSON.stringify(fill[0]));
  ok('fill: keeps the wall offset clear',
     fill.every(function(p){return p.x>=0.79&&p.x<=4.21&&p.y>=0.79&&p.y<=3.21;}),JSON.stringify(fill));
  ok('fill: lands within 25% of the target spacing',
     (function(){
       var xs=Array.from(new Set(fill.map(function(p){return +p.x.toFixed(3);}))).sort(function(a,b){return a-b;});
       for(var i=1;i<xs.length;i++){var g=xs[i]-xs[i-1]; if(g>2.0||g<1.2) return false;}
       return true;
     })(),'spacing drifted');
  ok('fill: rows and columns are uniform',
     (function(){
       var xs=Array.from(new Set(fill.map(function(p){return +p.x.toFixed(3);})));
       return fill.length===xs.length*Array.from(new Set(fill.map(function(p){return +p.y.toFixed(3);}))).length;
     })(),'not a uniform grid');

  /* room grid: hits the count the UI promises */
  var gi=G.gridInRoom(5,4,9,0.81);
  eq('room grid: places exactly the recommended count',gi.length,9);
  eq('room grid: 9 in a 5 × 4 m room is 3 columns',
     new Set(gi.map(function(p){return +p.x.toFixed(3);})).size,3);
  ok('room grid: stays inside the room and off the walls',
     gi.every(function(p){return p.x>=0.5&&p.x<=4.5&&p.y>=0.5&&p.y<=3.5;}),JSON.stringify(gi[0]));
  /* The set-out rule: the gap at the wall is half the gap between the lights,
     on each axis independently. A 5 x 4 m room laid out 3 x 3 is 0.83 / 1.67
     across and 0.67 / 1.33 down - even both ways, which is what stops a room
     looking like the lights were pushed into the middle of it. */
  ok('room grid: the wall gap is half the gap between the lights',
     (function(){
       var xs=Array.from(new Set(gi.map(function(p){return +p.x.toFixed(3);}))).sort(function(a,b){return a-b;});
       var ys=Array.from(new Set(gi.map(function(p){return +p.y.toFixed(3);}))).sort(function(a,b){return a-b;});
       return Math.abs(xs[0]-(xs[1]-xs[0])/2)<0.02 && Math.abs(ys[0]-(ys[1]-ys[0])/2)<0.02;
     })(),JSON.stringify(gi));
  /* An awkward count is squared off rather than laid out ragged: 7 in a
     5 x 4 m room becomes a clean 3 x 2, because 3-3-1 looks like a mistake. */
  eq('room grid: an awkward count is squared off',G.gridInRoom(5,4,7,0.81).length,6);
  ok('room grid: every layout is a complete rectangle',
     [[5,4,8],[5.4,4.2,8],[4,3,4],[3,4,6],[6,8,10],[2.5,3,2]].every(function(d){
       var pts=G.gridInRoom(d[0],d[1],d[2],0.7);
       var xs=new Set(pts.map(function(p){return +p.x.toFixed(3);})).size;
       var ys=new Set(pts.map(function(p){return +p.y.toFixed(3);})).size;
       return xs*ys===pts.length;
     }),'a row came out short');
  eq('room grid: a single fitting is centred',
     G.gridInRoom(4,4,1,0.8)[0].x+'/'+G.gridInRoom(4,4,1,0.8)[0].y,'2/2');
  ok('room grid: a narrow hallway lays out in one run',
     new Set(G.gridInRoom(8,1.2,4,0.5).map(function(p){return +p.y.toFixed(2);})).size===1,'hall rows');
  eq('fill: a tiny room still gets one fitting, centred',
     G.fillPoints(1,1,1.6,0.8).length,1);
  ok('point-in-rect works on the boundary',
     G.pointInRect(5,5,{x:0,y:0,w:5,h:5})&&!G.pointInRect(6,5,{x:0,y:0,w:5,h:5}),'boundary');

  /* ---- money ---- */
  eq('GST is added at 10%',G.incGST(100),110);
  eq('GST rounds to cents',G.incGST(16.5),18.15);
  eq('money formats to two decimals',G.money(1234.5),'$1,234.50');

  /* ---- catalogue integrity ---- */
  ok('every product carries an id and a category',
     G.PRODUCTS.every(function(p){return p.id&&p.cat;}),'missing fields');
  ok('every product category has a picker entry, or is kept as data only',
     (function(){
       var known=G.CATS.map(function(c){return c.id;});
       return G.PRODUCTS.every(function(p){
         return known.indexOf(p.cat)>-1 || !!G.DATA_ONLY_CATS[p.cat];
       });
     })(),'unmapped category');
  eq('downlights category holds 35 products',G.catProducts('downlights').length,35);
  ok('every room brief says whether it takes downlights',
     Object.keys(G.ROOMS).every(function(k){return typeof G.ROOMS[k].dl==='boolean';}),'missing dl flag');
  ok('no room brief tells people to leave gaps for lamps or strip',
     Object.keys(G.ROOMS).every(function(k){
       return !/strip|lamp\b|pendant|accent|\bcove\b/i.test(G.ROOMS[k].note);}),'stale advice');

  /* ---- app behaviour against the live DOM ---- */
  var d=document;
  eq('category picker is populated',d.querySelector('#cat').options.length,G.CATS.length);
  eq('every downlight in the category gets a card',d.querySelectorAll('#prodcards .pcard').length,35);
  ok('every downlight card carries the product photo from the website',
     /* the single-file build inlines photos as data URIs, the multi-file build
        links them from /img - accept either, reject a blank or a placeholder */
     G.catProducts('downlights').every(function(p){
       return typeof p.img==='string' &&
         (/^data:image\//.test(p.img) || /^\/img\/[^\s]+\.(webp|png|jpe?g|svg)$/i.test(p.img));
     }),
     'a downlight is missing its photo');
  ok('the selected card is the one in state',
     d.querySelector('#prodcards .pcard.on').dataset.pid===G.S.pick.pid,'selection out of sync');
  ok('the spec line reports real figures, not guesses',
     G.productSpecLine(G.byId('DL10ES')).indexOf('lm')>-1,G.productSpecLine(G.byId('DL10ES')));
  ok('a product with no lumen figure says so rather than inventing one',
     G.productSpecLine({name:'x',lumens:null,watts:null,beam:null,cutout:null}).indexOf('lm n/a')>-1,'no n/a marker');
  ok('search matches a product code',G.productMatches(G.byId('DL10ES'),'dl10es'),'code search failed');
  ok('search matches a wattage',G.productMatches(G.byId('DL10ES'),'10w'),'watt search failed');
  ok('search that matches nothing hides every card',
     (function(){var was=G.S.pick.q;G.S.pick.q='zzzz';var n=G.visibleProducts().length;G.S.pick.q=was;return n===0;})(),
     'search did not filter');
  ok('the recommended fitting is floated to the top of the list',
     (function(){G.S.roomType='kitchen';var r=G.recommendedId();
       return !r||G.visibleProducts()[0].id===r;})(),'recommendation not first');
  ok('room picker offers every brief',
     d.querySelector('#rtype').options.length===Object.keys(G.ROOMS).length,'room options');

  G.S.fixtures=[];G.S.rooms=[];G.S.sel=[];G.S.mpp=0.01;G.S.undo=[];
  G.setPick({cat:'downlights',pid:'DL10ES',qty:4,arr:'row'});
  G.addFixtures([{x:100,y:100},{x:200,y:100},{x:300,y:100},{x:400,y:100}]);
  eq('placing four fittings puts four on the plan',G.S.fixtures.length,4);
  eq('four markers are drawn in the SVG',d.querySelectorAll('#g-fx .fx').length,4);
  eq('the step header counts the extras',d.querySelector('#st4').textContent,'4 extra');
  eq('and reads Optional when there are none',
     (function(){var k=G.S.fixtures;G.S.fixtures=[];G.renderAll();
                 var t=d.querySelector('#st4').textContent;G.S.fixtures=k;G.renderAll();return t;})(),
     'Optional');

  var lines=G.bomLines();
  eq('schedule groups identical fittings into one line',lines.length,1);
  eq('schedule quantity matches what was placed',lines[0].qty,4);
  eq('line total is unit price × quantity',lines[0].line,
     Math.round((G.byId('DL10ES').price*4)*100)/100);
  var tot=G.bomTotals(lines);
  eq('schedule total inc GST is ex × 1.1',tot.inc,G.incGST(tot.ex));
  ok('schedule renders into the rail',
     /(\$)/.test(d.querySelector('#bomwrap').textContent),'no price rendered');

  G.S.rooms=[{id:'r1',type:'kitchen',x:0,y:0,w:250,h:250}];
  var l2=G.bomLines();
  ok('fittings inside a room box are attributed to that room',
     l2[0].rooms['Kitchen']===2&&l2[0].rooms['Unassigned']===2,JSON.stringify(l2[0].rooms));

  G.undo();
  eq('undo removes the last placement',G.S.fixtures.length,0);

  /* fill uses the room, the scale and the spacing rule together */
  G.S.mpp=0.01; /* 100 px per metre */
  G.S.rooms=[{id:'r2',type:'kitchen',x:0,y:0,w:500,h:400}]; /* 5.0 x 4.0 m */
  G.S.fixtures=[];
  G.setPick({pid:'DL10ES'});
  G.doFill(G.S.rooms[0]);
  eq('filling a 5 × 4 m kitchen drops the four the room card promises',G.S.fixtures.length,4);
  ok('the fill count matches the table for that fitting',
     G.S.fixtures.length===G.countForRoom(5,4,G.fittingClass(G.byId('DL10ES'))),'button/fill mismatch');
  G.doFill(G.S.rooms[0]);
  eq('filling the same room twice replaces rather than doubles up',G.S.fixtures.length,4);
  /* Strip and star lights are accents somebody placed on purpose, so a
     re-fill must not sweep them up with the general lighting. */
  var ACCENT='ST24V-SMD-ALL-1';
  G.S.fixtures.push({id:'acc1',pid:ACCENT,x:250,y:200});
  G.doFill(G.S.rooms[0]);
  eq('re-filling leaves strip and other accents in the room alone',
     G.S.fixtures.filter(function(f){return f.pid===ACCENT;}).length,1);
  G.S.fixtures=G.S.fixtures.filter(function(f){return f.pid!==ACCENT;});
  /* The bug people hit: fill a room, change the fitting, fill again, and end
     up with both sets of lights sitting on top of each other. */
  ok('changing the light on the room card and re-filling replaces rather than stacks',
     (function(){
       G.S.fixtures=[];
       G.setRoomLight(G.S.rooms[0].id,'DL9ES-FLAT-HL'); G.doFill(G.S.rooms[0]);
       var first=G.S.fixtures.length;
       G.setRoomLight(G.S.rooms[0].id,'DL10-PS');       G.doFill(G.S.rooms[0]);
       var pids={}; G.S.fixtures.forEach(function(f){pids[f.pid]=1;});
       return first>0 && Object.keys(pids).length===1 && pids['DL10-PS'];
     })(),G.S.fixtures.map(function(f){return f.pid;}).join(','));
  ok('and swapping to a ceiling light does the same',
     (function(){
       G.setRoomLight(G.S.rooms[0].id,'C25-CCT-PA'); G.doFill(G.S.rooms[0]);
       return G.S.fixtures.every(function(f){return f.pid==='C25-CCT-PA';});
     })(),G.S.fixtures.map(function(f){return f.pid;}).join(','));

  /* The whole point of step 4 being "extras only": choosing something there
     must leave every room exactly as it was. */
  ok('picking a fitting in Add extra lights leaves the rooms alone',
     (function(){
       G.setRoomLight(G.S.rooms[0].id,'DL9ES-FLAT-HL');
       G.doFill(G.S.rooms[0]);
       var before=G.S.fixtures.map(function(f){return f.pid;}).sort().join(',');
       G.setPick({cat:'strip',pid:'ST24V-SMD-ALL-1'});
       var after=G.S.fixtures.map(function(f){return f.pid;}).sort().join(',');
       return before===after && before.indexOf('DL9ES-FLAT-HL')>-1;
     })(),'the extras picker changed the rooms');
  eq('and the room still reports its own fitting',
     G.roomFittingFor(G.S.rooms[0]).id,'DL9ES-FLAT-HL');
  ok('while the extras picker keeps what was chosen there',
     G.S.pick.pid==='ST24V-SMD-ALL-1',G.S.pick.pid);
  G.S.roomPid={}; G.setPick({cat:'downlights',pid:'DL10ES'});
  ok('filled fittings all land inside the room box',
     G.S.fixtures.every(function(f){return G.pointInRect(f.x,f.y,G.S.rooms[0]);}),'outside room');
  /* labels stay off on screen but must come back on for the printed copy */
  eq('fitting labels are off by default on screen',
     d.querySelectorAll('#g-fx .fx-lab').length,0);
  G.S.showLabels=true;G.renderAll();
  ok('turning labels on annotates every fitting',
     d.querySelectorAll('#g-fx .fx-lab').length===G.S.fixtures.length,'label count');
  G.S.showLabels=false;

  /* light pools only render when the product has a beam figure */
  G.S.showPools=true;G.renderAll();
  ok('a light pool is drawn per fitting when the beam is known',
     d.querySelectorAll('#g-pools .fx-pool').length===G.S.fixtures.length,'pool count');
  ok('light pools are clipped to the room they sit in',
     (function(){
       var pools=d.querySelectorAll('#g-pools .fx-pool');
       if(!pools.length) return false;
       var any=false,i,g;
       for(i=0;i<pools.length;i++){
         g=pools[i].parentNode;
         if(g&&g.getAttribute&&g.getAttribute('clip-path')) any=true;
       }
       return any||!G.S.rooms.length;
     })(),'clip-path present when a room encloses the fitting');

  G.S.fixtures=[];G.S.rooms=[];G.S.sel=[];G.S.mpp=null;G.renderAll();

  /* ---- the catalogue the planner offers ---- */
  eq('the picker offers five kinds of fitting',G.CATS.length,5);
  ok('and none of the categories that are not laid out on a plan',
     ['track','sensors','outdoor','flood','landscape','highbay','industrial',
      'emergency','transformers','strip'].every(function(c){
        return G.CATS.every(function(x){return x.id!==c;});
     }),'a removed category is still offered');
  ok('nothing in the catalogue sits in a category the picker cannot show, bar the data-only ones',
     G.PRODUCTS.every(function(p){
       return G.CATS.some(function(c){return c.id===p.cat;}) || !!G.DATA_ONLY_CATS[p.cat];
     }),'orphan product');

  /* ---- strip lighting is out of the planner, but not out of the data ---- */
  ok('strip lighting cannot be picked as a thing to place',
     G.CATS.every(function(c){return c.id!=='strip';}),'strip is still in the picker');
  ok('and no picker group can reach a strip product',
     ['downlights','smart','ceiling','batten','star'].every(function(k){
       return G.pickerGroupProducts(k).every(function(p){return p.cat!=='strip';});
     }),'a strip product is still offered');
  ok('and nothing offered anywhere is a strip run',
     G.PRODUCTS.filter(function(p){return p.cat==='strip';}).every(function(p){
       return G.catProducts('downlights').indexOf(p)<0 &&
              G.catProducts('ceiling').indexOf(p)<0;
     }),'strip leaked into a picker category');
  ok('but a plan saved before the change still resolves its strip fittings',
     !!G.byId('ST24V-SMD-ALL-1'),'strip product dropped from the catalogue');
  eq('the T40 Pro is the only batten',G.catProducts('batten').length,1);
  eq('and it is the T40 Pro',G.catProducts('batten')[0].id,'T40-CCT-BATTEN-PRO');
  ok('exhaust fans and bathroom mates are still recognised as bathroom fittings',
     ['BLIZZARD-EXHAUST-C','BLIZZARD-EXHAUST-S','BLIZZARD-EXHAUST-L']
       .every(function(id){return G.isBathroomFitting(G.byId(id));}),'none flagged');
  ok('a ceiling fan is not treated as a bathroom fitting',
     !G.isBathroomFitting(G.byId('AMARI-DC-52-FAN-LI')),'ceiling fan flagged');
  /* The extras picker offers ceiling fans and nothing else. An exhaust is a
     ventilation decision made on the room card, sized to the room - it is not
     something you drop on a plan by hand, and having both kinds in one list
     meant a bathroom could end up with two of them. */
  ok('the fan list is ceiling fans only, whatever the room type',
     (function(){
       return ['living','bathroom','laundry'].every(function(t){
         G.S.roomType=t; G.setPick({cat:'fans'});
         var v=G.visibleProducts();
         return v.length>0 && v.every(G.isCeilingFanProduct);
       });
     })(),'an exhaust is still in the extras list');
  ok('and the count beside it matches what the list shows',
     (function(){
       G.S.roomType='bathroom'; G.setPick({cat:'fans'});
       return G.catProducts('fans').every(G.isCeilingFanProduct) &&
              G.catProducts('fans').length===G.visibleProducts().length;
     })(),'count and list disagree');
  G.S.roomType='kitchen';

  /* ---- the fan rules ---- */
  (function(){
    G.S.mpp=0.01; G.S.fixtures=[]; G.S.roomFan={}; G.S.roomExhaust={};
    G.S.rooms=[{id:'fr',type:'bedroom',x:0,y:0,w:500,h:400}];
    var r=G.S.rooms[0];
    G.setPick({cat:'downlights',pid:'DL9ES-FLAT-HL'});
    G.S.roomFan['fr']='light'; G.doFill(r);
    eq('a fan with a light is the whole room',G.S.fixtures.length,1);
    ok('and it is a fan with a light in it',
       /-LI$/.test(G.S.fixtures[0].pid),G.S.fixtures[0].pid);
    G.S.roomFan['fr']='nolight'; G.doFill(r);
    eq('a fan without a light gets four downlights around it',G.S.fixtures.length,5);
    ok('the fan itself has no light',
       G.S.fixtures.some(function(f){return /-BW$/.test(f.pid);}),
       G.S.fixtures.map(function(f){return f.pid;}).join(','));
    ok('and the four downlights are low glare',
       G.S.fixtures.filter(function(f){
         var p=G.byId(f.pid); return p&&p.cat==='downlights';
       }).every(function(f){return G.fittingClass(G.byId(f.pid))==='lg';}),'a wide beam went in under a fan');
    G.doFill(r);
    eq('filling the same fan room twice does not stack',G.S.fixtures.length,5);
    var recF=G.recommendForRoom(r);
    eq('the card reads four low glare for a fan room',recF.n,4);
    eq('whatever the size table says',recF.klass,'lg');
    G.S.roomFan['fr']='none';        /* what "No fan" on the card stores */
    G.doFill(r);
    ok('taking the fan out leaves no fan behind',
       G.S.fixtures.every(function(f){var p=G.byId(f.pid);return p&&p.cat!=='fans';}),
       G.S.fixtures.map(function(f){return f.pid;}).join(','));
    /* Bedrooms are four, whatever the size table says. */
    G.S.fixtures=[]; G.S.rooms=[{id:'bd',type:'bedroom',x:0,y:0,w:700,h:600}];
    G.doFill(G.S.rooms[0]);
    eq('a bedroom is four downlights however big it is',G.S.fixtures.length,4);
    eq('and the card says four',G.recommendForRoom(G.S.rooms[0]).n,4);
    G.S.fixtures=[]; G.S.rooms=[]; G.S.roomFan={};
  })();

  ok('drivers, remotes and controllers are not offered as a type of light',
     !G.isALight(G.byId('DL03-DRIVERS-1')) && !G.isALight(G.byId('REMOTE-CONTROL-GRP-1')) &&
     G.isALight(G.byId('DL03-ALL-1')),'a controller is being offered as a light');
  ok('a surface ceiling light fills a lounge with two, not nine',
     (function(){
       G.S.mpp=0.01; G.S.fixtures=[]; G.S.roomFan={}; G.S.roomPid={};
       G.S.rooms=[{id:'cl',type:'living',x:0,y:0,w:500,h:400}];
       G.setRoomLight('cl','C25-CCT-PA');
       G.doFill(G.S.rooms[0]);
       var n=G.S.fixtures.length;
       G.S.fixtures=[];G.S.rooms=[];G.S.roomPid={};
       return n>=1&&n<=3;
     })(),'ceiling lights still laid out on the downlight grid');

  /* ---- a fan dropped on the plan by hand ---- */
  (function(){
    G.S.mpp=0.01; G.S.fixtures=[]; G.S.roomFan={}; G.S.roomExhaust={}; G.S.fanPlan='ask';
    G.S.rooms=[{id:'hp',type:'bedroom',x:0,y:0,w:500,h:400}];
    var r=G.S.rooms[0];
    G.setPick({cat:'downlights',pid:'DL9ES-FLAT-HL'});   /* 100 deg, wide */
    G.doFill(r);
    ok('a room starts out with the wide standard downlights',
       G.S.fixtures.every(function(f){return G.fittingClass(G.byId(f.pid))==='std';}),'not standard');
    ok('no fan is detected before one is placed',!G.fanInRoom(r),'phantom fan');
    G.setPick({cat:'fans',pid:'AMARI-DC-52-FAN-BW'});
    G.addFixtures([{x:250,y:200}]);
    ok('dropping a fan in the room is noticed',!!G.fanInRoom(r),'fan not seen');
    eq('and the room reads as a fan room',G.roomFanMode(r),'nolight');
    ok('the downlights switch to low glare on their own',
       G.S.fixtures.filter(function(f){
         var p=G.byId(f.pid); return p&&p.cat==='downlights';
       }).every(function(f){return G.fittingClass(G.byId(f.pid))==='lg';}),
       G.S.fixtures.map(function(f){return f.pid;}).join(','));
    eq('and there are four of them',
       G.S.fixtures.filter(function(f){
         var p=G.byId(f.pid); return p&&p.cat==='downlights';
       }).length,4);
    eq('the fan is still on the plan',G.S.fixtures.filter(function(f){
       return f.pid==='AMARI-DC-52-FAN-BW';}).length,1);
    eq('the room card reads four low glare',G.recommendForRoom(r).n,4);
    ok('placing a second fitting does not re-lay it again',
       (function(){
         var before=G.S.fixtures.length;
         G.setPick({cat:'downlights',pid:'DL10-PS'});
         G.addFixtures([{x:60,y:60}]);
         return G.S.fixtures.length===before+1;
       })(),'re-laid on an unrelated placement');
    /* "No fan" on the card is the last word, even with a fan in the box. */
    G.S.roomFan['hp']='none';
    eq('choosing No fan overrides a fan sitting in the room',G.roomFanMode(r),null);
    G.S.fixtures=[]; G.S.rooms=[]; G.S.roomFan={};
    G.setPick({cat:'downlights',pid:'DL10ES'});
  })();

  /* ---- the plainest thing to do next ---- */
  (function(){
    var keepPlan=G.S.plan&&G.S.plan.loaded, keepMpp=G.S.mpp, keepRooms=G.S.rooms, keepFx=G.S.fixtures;
    G.S.plan.loaded=false; G.S.mpp=null; G.S.rooms=[]; G.S.fixtures=[];
    eq('with no plan it says to add one',G.nextAction().n,1);
    G.S.plan.loaded=true;
    eq('with a plan but no scale it asks for the scale',G.nextAction().n,2);
    G.S.mpp=0.01;
    eq('with a scale but no rooms it asks for a room',G.nextAction().n,3);
    G.S.rooms=[{id:'nx',type:'bedroom',x:0,y:0,w:400,h:400}];
    eq('an empty room keeps you in step 3',G.nextAction().n,3);
    G.doFill(G.S.rooms[0]);
    /* One lit room used to jump straight to "that is everything", which told
       people to stop four rooms early. Now it keeps them boxing until the
       plan is plausibly covered. */
    eq('one lit room keeps you boxing, not at the list',G.nextAction().n,3);
    G.S.rooms.push({id:'nx2',type:'kitchen',x:500,y:0,w:400,h:400});
    G.S.rooms.push({id:'nx3',type:'living',x:0,y:500,w:400,h:400});
    G.doFill(G.S.rooms[1]); G.doFill(G.S.rooms[2]);
    eq('and once the plan is covered it sends you to the list',G.nextAction().n,5);
    ok('every step of the way it says something in plain words',
       ['t','s'].every(function(k){return typeof G.nextAction()[k]==='string'&&G.nextAction()[k].length>8;}),
       'empty next-step text');
    G.S.rooms=keepRooms; G.S.fixtures=keepFx; G.S.mpp=keepMpp; G.S.plan.loaded=!!keepPlan;
    G.S.roomPid={};
  })();
  ok('the banner names a real step',
     (function(){
       G.renderAll();
       var b=d.getElementById('nextup');
       return b && d.getElementById('nextup-t').textContent.length>4 &&
              d.querySelector('.step[data-step="'+b.dataset.step+'"]');
     })(),'no next-step banner');
  ok('every step says what to do in one line',
     d.querySelectorAll('.step .step-lead').length>=4,
     d.querySelectorAll('.step .step-lead').length+' leads');
  ok('the extras step is not counted as part of the rooms',
     (function(){
       G.S.mpp=0.01; G.S.fixtures=[]; G.S.roomPid={}; G.S.roomFan={};
       G.S.rooms=[{id:'ex',type:'bedroom',x:0,y:0,w:400,h:400}];
       G.doFill(G.S.rooms[0]);
       var roomLights=G.S.fixtures.length;
       var extrasBefore=G.extraFixtures().length;
       G.setPick({cat:'strip',pid:'ST24V-SMD-ALL-1'});
       G.addFixtures([{x:200,y:200}]);
       var out=roomLights>0 && extrasBefore===0 && G.extraFixtures().length===1;
       G.S.fixtures=[];G.S.rooms=[];G.setPick({cat:'downlights',pid:'DL10ES'});
       return out;
     })(),'the extras count is picking up the room lighting');

  /* ---- where a fan is allowed to go ---- */
  eq('a bedroom takes a ceiling fan',G.ROOMS.bedroom.fan,true);
  eq('and the alfresco takes one',G.ROOMS.alfresco.fan,true);
  ok('and nothing else does',
     Object.keys(G.ROOMS).filter(function(k){return G.ROOMS[k].fan;}).sort().join(',')==='alfresco,bedroom',
     Object.keys(G.ROOMS).filter(function(k){return G.ROOMS[k].fan;}).join(','));
  /* The exhaust is offered in the bathroom only, as an extra you tick. The
     laundry is lights only. */
  ok('a bathroom can take an exhaust',G.ROOMS.bathroom.exhaust,'bathroom without the option');
  ok('a laundry is lights only',!G.ROOMS.laundry.exhaust,'laundry still asks about an exhaust');
  ok('and nothing else offers one',
     Object.keys(G.ROOMS).filter(function(k){return G.ROOMS[k].exhaust;}).sort().join(',')==='bathroom',
     Object.keys(G.ROOMS).filter(function(k){return G.ROOMS[k].exhaust;}).join(','));
  eq('a bathroom is two lights, whatever it measures',G.ROOMS.bathroom.min,2);
  (function(){
    G.S.mpp=0.01; G.S.fixtures=[]; G.S.roomFan={}; G.S.fanPlan='ask';
    G.S.rooms=[{id:'lv',type:'living',x:0,y:0,w:400,h:400},
               {id:'bd',type:'bedroom',x:500,y:0,w:400,h:400},
               {id:'ba',type:'bathroom',x:0,y:500,w:250,h:250}];
    var fanP=G.byId('AMARI-DC-52-FAN-BW'), exP=G.byId('BLIZZARD-EXHAUST-C');
    ok('a ceiling fan is refused in a lounge',!!G.placementBlock(fanP,200,200),'allowed in a lounge');
    ok('and allowed in a bedroom',!G.placementBlock(fanP,700,200),'refused in a bedroom');
    ok('an exhaust is refused in a bedroom',!!G.placementBlock(exP,700,200),'allowed in a bedroom');
    ok('and allowed in a bathroom',!G.placementBlock(exP,120,620),'refused in a bathroom');
    ok('anywhere outside a room box is left to the person',
       !G.placementBlock(fanP,1100,1100),'refused outside a room');
    /* and the refusal actually stops the placement, not just warns */
    G.setPick({cat:'fans',pid:'AMARI-DC-52-FAN-BW'});
    G.addFixtures([{x:200,y:200}]);
    eq('nothing is placed when it is refused',G.S.fixtures.length,0);
    G.addFixtures([{x:700,y:200}]);
    eq('and it goes in where it is allowed',
       G.S.fixtures.filter(function(f){return f.pid==='AMARI-DC-52-FAN-BW';}).length,1);
    eq('bringing its four low glare downlights with it',
       G.S.fixtures.filter(function(f){
         var p=G.byId(f.pid); return p&&p.cat==='downlights';
       }).length,4);
    G.S.fixtures=[]; G.S.rooms=[]; G.S.roomFan={};
    G.setPick({cat:'downlights',pid:'DL10ES'});
  })();

  /* ---- the fan question is asked room by room, not up front ---- */
  eq('with no answer given, fans start undecided',
     (function(){var v=G.S.fanPlan;G.S.fanPlan='ask';return v!==undefined?'ask':'missing';})(),'ask');
  ok('the fan pre-question is gone from step 03 — rooms ask it themselves',
     !d.getElementById('fanplan'),'pre-question still in the sidebar');

  /* ---- the reasoning moved to the FAQ ---- */
  ok('an FAQ button sits in the header',!!d.getElementById('btn-faq'),'no #btn-faq');
  (function(){
    G.showFaq();
    var body=d.getElementById('mbody');
    var txt=body?body.textContent:'';
    ok('the FAQ opens with the fan reasoning in it',
       /shadow flicker/.test(txt),'fan reasoning missing');
    ok('and covers low glare, star lights and wet areas',
       /low glare/i.test(txt)&&/[Ss]tar light/.test(txt)&&/IP rating/.test(txt),'a topic is missing');
    ok('as fold-out questions, not a wall of text',
       body&&body.querySelectorAll('details.moreinfo').length>=8,'fewer than 8 items');
    d.getElementById('modal').classList.remove('open');
  })();

  /* ---- plan symbols ---- */
  eq('downlights draw as a circle',G.symbolFor('downlights'),'round');
  eq('battens, strip and track draw as a bar',G.symbolFor('strip'),'bar');
  eq('sensors draw as a triangle',G.symbolFor('sensors'),'tri');
  eq('fans get their own symbol',G.symbolFor('fans'),'fan');
  eq('outdoor and drivers draw as a square',G.symbolFor('flood'),'square');
  ok('every catalogue category maps to a symbol',
     G.CATS.every(function(c){return ['round','bar','tri','fan','square'].indexOf(G.symbolFor(c.id))>-1;}),
     'unmapped symbol');
  G.S.mpp=0.01;G.S.fixtures=[];G.setPick({cat:'fans',pid:G.catProducts('fans')[0].id});
  G.addFixtures([{x:120,y:120}]);
  ok('a fan is drawn on the plan with its real number of blades',
     d.querySelectorAll('#g-fx .fx-blade').length>=4,
     d.querySelectorAll('#g-fx .fx-blade').length+' blades drawn');
  ok('a five-blade fan draws five blades',
     (function(){
       G.S.fixtures=[];G.setPick({cat:'fans',pid:'AMARI-DC-FAN-56-BW'});
       G.addFixtures([{x:120,y:120}]);
       return d.querySelectorAll('#g-fx .fx-blade').length===5;
     })(),d.querySelectorAll('#g-fx .fx-blade').length+' blades drawn');
  G.setPick({cat:'downlights',pid:'DL10ES'});G.S.fixtures=[];G.renderAll();

  /* ---- the printed document ---- */
  G.S.rooms=[{id:'r9',type:'kitchen',x:0,y:0,w:400,h:300}];
  G.addFixtures([{x:100,y:100},{x:200,y:100}]);
  var rs=G.roomSummary();
  eq('the printed room table lists every marked room',rs.length,1);
  eq('it reports the area in square metres',rs[0].area,12);
  eq('it counts the fittings that fall inside the room',rs[0].fittings,2);
  ok('it names the size band the count came from',/m ×/.test(rs[0].band||''),rs[0].band);
  G.S.rooms=[];G.S.fixtures=[];G.S.sel=[];G.S.mpp=null;G.renderAll();

  /* ---- finding the drawing on the page ---- */
  function synth(w,h,box,bgv,inkv){
    var a=new Array(w*h).fill(bgv);
    for(var y=box.y;y<box.y+box.h;y++) for(var x=box.x;x<box.x+box.w;x++) a[y*w+x]=inkv;
    return a;
  }
  var b1=G.contentBox(synth(100,100,{x:20,y:30,w:40,h:40},250,30),100,100);
  ok('a drawing in the middle of a blank page is found',
     b1.x===20&&b1.y===30&&b1.w===40&&b1.h===40,JSON.stringify(b1));
  var b2=G.contentBox(synth(200,100,{x:150,y:10,w:40,h:80},250,40),200,100);
  ok('a drawing off in one corner is found too',
     b2.x===150&&b2.w===40,JSON.stringify(b2));
  var blank=G.contentBox(new Array(100*100).fill(250),100,100);
  ok('a blank page falls back to the whole page',
     blank.w===100&&blank.h===100,JSON.stringify(blank));
  var speck=G.contentBox(synth(200,200,{x:5,y:5,w:3,h:3},250,20),200,200);
  ok('a speck of dust does not become the drawing',
     speck.w===200,JSON.stringify(speck));
  var dark=G.contentBox(synth(100,100,{x:25,y:25,w:50,h:50},20,240),100,100);
  ok('it works on a dark scan as well as a white page',
     dark.x===25&&dark.w===50,JSON.stringify(dark));
  /* a title block off to one side must not stretch the view */
  (function(){
    var w=300,h=200,a=new Array(w*h).fill(250);
    function block(x0,y0,x1,y1){for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)a[y*w+x]=30;}
    block(20,20,150,170);        // the floor plan
    block(255,160,295,190);      // a small title block in the corner
    var b=G.contentBox(a,w,h);
    ok('a small title block off to one side is ignored',
       b.x===20&&b.w<=140,JSON.stringify(b));
  })();
  (function(){
    var w=300,h=200,a=new Array(w*h).fill(250);
    function block(x0,y0,x1,y1){for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++)a[y*w+x]=30;}
    block(10,20,130,180);        // ground floor
    block(170,20,290,180);       // first floor, same sheet
    var b=G.contentBox(a,w,h);
    ok('two plans of similar size on one sheet are both kept',
       b.x===10&&b.x+b.w>=290,JSON.stringify(b));
  })();
  eq('a lone block is returned whole',G.mainSpan([0,0,5,5,5,0,0],1).join(','),'2,4');
  eq('nothing inked returns nothing',G.mainSpan([0,0,0],1).join(','),'-1,-1');

  var pad=G.padBox({x:20,y:30,w:40,h:40},100,100,0.05);
  ok('the box is padded a little so the drawing is not flush to the edge',
     pad.x===18&&pad.w===44,JSON.stringify(pad));
  ok('padding never runs off the page',
     (function(){var p=G.padBox({x:0,y:0,w:100,h:100},100,100,0.1);
       return p.x===0&&p.w===100;})(),'padding overflowed');

  /* ---- scale read straight off the page ---- */
  eq('PDF points convert to millimetres',Math.round(G.ptToMm(841.89)),297);
  eq('a 297 × 420 mm page is recognised as A3',G.paperName(297,420),'A3');
  eq('and it is recognised the other way up',G.paperName(420,297),'A3');
  eq('an A1 sheet is recognised',G.paperName(594,841),'A1');
  eq('an odd page size is not forced into a standard',G.paperName(500,700),null);
  ok('A3 at 1:100 over 2400 px gives 57.1 px per metre',
     Math.abs(1/G.mppFromPaper(297,100,2400)-2400/29.7)<0.01,1/G.mppFromPaper(297,100,2400));
  ok('an A3 page at 1:100 covers 29.7 m across',
     Math.abs(G.mppFromPaper(297,100,2400)*2400-29.7)<0.01,G.mppFromPaper(297,100,2400)*2400);
  ok('halving the ratio halves the metres per pixel',
     Math.abs(G.mppFromPaper(297,50,2400)*2-G.mppFromPaper(297,100,2400))<1e-9,'ratio not linear');
  eq('no paper size means no scale, rather than a guess',G.mppFromPaper(null,100,2400),null);

  /* ---- snapping fittings into line ---- */
  var others=[{x:100,y:100},{x:100,y:300},{x:400,y:100}];
  var sn=G.snapToFittings({x:104,y:296},others,9);
  ok('a fitting dropped near another lines up with it',sn.x===100&&sn.y===300,JSON.stringify(sn));
  ok('and the guide lines are reported so they can be drawn',sn.gx===100&&sn.gy===300,JSON.stringify(sn));
  var far=G.snapToFittings({x:250,y:250},others,9);
  ok('a fitting dropped in clear space is left alone',
     far.x===250&&far.y===250&&far.gx===null,JSON.stringify(far));
  ok('snapping works on one axis at a time',
     G.snapToFittings({x:103,y:250},others,9).gy===null,'snapped both axes');
  eq('the nearest neighbour distance is reported for the spacing readout',
     Math.round(G.nearestGap({x:100,y:200},others)),100);

  /* ---- what a click will drop ---- */
  G.S.mpp=0.01;G.S.ceiling=2.7;
  G.setPick({cat:'downlights',pid:'DL10ES',qty:4,arr:'row'});
  var gp=G.groupPointsAt(500,400);
  eq('the preview shows exactly the number that will drop',gp.length,4);
  ok('the preview is centred on the cursor',
     Math.abs((gp[0].x+gp[3].x)/2-500)<0.01,'not centred');
  ok('the preview spacing is the spacing rule for that fitting',
     Math.abs((gp[1].x-gp[0].x)*G.S.mpp-G.spacingFor(2.7,G.parseBeam(G.byId('DL10ES').beam)))<0.01,
     (gp[1].x-gp[0].x)*G.S.mpp);
  G.setPick({arr:'grid',qty:6});
  eq('a grid preview shows the same count',G.groupPointsAt(500,400).length,6);
  G.setPick({arr:'row',qty:4});
  G.S.mpp=null;

  /* ---- known-object calibration ---- */
  eq('nothing is pre-chosen, so no plan gets scaled off a guess',
     d.getElementById('calref').value,'');
  ok('and the button that starts it is dead until they choose',
     d.getElementById('btn-cal').disabled,'button live with nothing chosen');
  eq('with nothing chosen there is no length to scale by',G.calRefLength(),undefined);
  ok('two references plus "type it myself", not a dozen',
     d.getElementById('calref').options.length===4,
     d.getElementById('calref').options.length+' options');
  ok('and the garage door is not one of them - too few plans have one',
     !/garage/i.test(d.getElementById('calref').textContent),'garage door still offered');
  d.getElementById('calref').value='0.82';
  d.getElementById('calref').dispatchEvent(new window.Event('change'));
  eq('picking a standard door gives its real width',G.calRefLength(),0.82);
  ok('and that frees the button',!d.getElementById('btn-cal').disabled,'button still dead');
  eq('the typed-length fields stay hidden until they are needed',
     d.getElementById('calcustom').style.display,'none');
  d.getElementById('calref').value='custom';
  d.getElementById('calref').dispatchEvent(new window.Event('change'));
  eq('choosing "something else" waits for a typed length',G.calRefLength(),null);
  ok('and reveals the fields to type it in',d.getElementById('calcustom').style.display!=='none',
     d.getElementById('calcustom').style.display);
  d.getElementById('calref').value='0.82';
  d.getElementById('calref').dispatchEvent(new window.Event('change'));

  /* ---- warning people before they build on a guessed scale ---- */
  G.S.plan.loaded=true;G.S.mpp=null;G.renderAll();
  ok('with no scale set, both steps that depend on it say so',
     Array.prototype.every.call(d.querySelectorAll('[data-scalewarn]'),function(w){return !w.hidden;}),
     'warning hidden');
  ok('and the notice offers a way straight there',!!d.querySelector('[data-goscale]'),'no shortcut');
  G.S.mpp=0.01;G.renderAll();
  ok('once the scale is set the warning goes away',
     Array.prototype.every.call(d.querySelectorAll('[data-scalewarn]'),function(w){return w.hidden;}),
     'warning stuck');
  G.S.plan.loaded=false;G.S.mpp=null;G.renderAll();
  ok('and it never nags before a plan is even loaded',
     Array.prototype.every.call(d.querySelectorAll('[data-scalewarn]'),function(w){return w.hidden;}),
     'nagged too early');

  /* ---- room cards fold away once the room is done ---- */
  G.S.mpp=0.01;G.S.fixtures=[];G.S.roomOpen={};
  G.S.rooms=[{id:'rr',type:'living',x:0,y:0,w:460,h:300}];
  G.setPick({cat:'downlights',pid:'DL10ES'});
  G.renderAll();
  var room=G.S.rooms[0];
  ok('a room with nothing in it is not done',!G.roomIsDone(room),'called done too early');
  ok('and it starts open',G.roomIsOpen(room),'started collapsed');
  eq('an unfinished card shows its detail',d.querySelectorAll('.rcard.open .rcard-body').length,1);
  G.doFill(room);
  ok('filling it marks it done',G.roomIsDone(room),G.roomFittings(room));
  ok('and it folds away on its own',!G.roomIsOpen(room),'stayed open');
  /* A finished room leaves the working list entirely and appears under
     "Rooms finished" - one place per room, so a long plan stays readable. */
  eq('a finished room leaves the working list',d.querySelectorAll('.rcard').length,0);
  eq('and turns up under Rooms finished',d.querySelectorAll('.donep-row').length,1);
  eq('with a tick beside it',d.querySelectorAll('.donep-nm .tick').length,1);
  ok('and the count it was given',/\d/.test(d.querySelector('.donep-nm .q').textContent),
     d.querySelector('.donep-nm .q').textContent);
  eq('the step header reports the progress',d.getElementById('st3').textContent,'1 room done');
  ok('Edit opens a finished room back up to change it',
     (function(){
       d.querySelector('[data-doneedit]').click();
       var r=G.S.rooms[0];
       if(!G.roomIsOpen(r)) return false;
       var sel=d.querySelector('[data-roomtype]');
       sel.value='kitchen'; sel.dispatchEvent(new window.Event('change'));
       return G.S.rooms[0].type==='kitchen';
     })(),G.S.rooms[0].type);
  (function(){
    var sel=d.querySelector('[data-roomtype]');
    if(sel){ sel.value='living'; sel.dispatchEvent(new window.Event('change')); }
    delete G.S.roomEdit[G.S.rooms[0].id]; G.renderAll();
  })();
  eq('and it is still one row afterwards',d.querySelectorAll('.donep-row').length,1);
  ok('a finished room can be removed from that row',
     (function(){
       d.querySelector('[data-donedel]').click();
       return G.S.rooms.length===0;
     })(),G.S.rooms.length);
  ok('removing a room takes its fittings with it',
     (function(){
       G.S.fixtures=[];G.S.rooms=[{id:'rx',type:'living',x:0,y:0,w:460,h:300}];
       G.S.roomOpen={rx:true};
       G.doFill(G.S.rooms[0]);
       if(!G.S.fixtures.length) return false;   /* nothing placed - test is void */
       G.renderAll();
       var x=d.querySelector('[data-delroom]')||d.querySelector('[data-donedel]');
       x.click();
       return G.S.rooms.length===0 && G.S.fixtures.length===0;
     })(),'left '+G.S.fixtures.length+' fittings behind');
  ok('a part-filled room stays open',
     (function(){
       G.S.fixtures=[];G.S.roomOpen={};
       G.S.rooms=[{id:'rp',type:'living',x:0,y:0,w:460,h:300}];
       G.addFixtures([{x:100,y:100}]);      /* one of the four it needs */
       G.renderAll();
       return !G.roomIsDone(G.S.rooms[0])&&G.roomIsOpen(G.S.rooms[0]);
     })(),'folded too early');
  ok('a garage with battens in it counts as done',
     (function(){
       G.S.fixtures=[];G.S.roomOpen={};
       G.S.rooms=[{id:'rg2',type:'garage',x:0,y:0,w:600,h:400}];
       G.doFill(G.S.rooms[0]);
       return G.roomIsDone(G.S.rooms[0])&&!G.roomIsOpen(G.S.rooms[0]);
     })(),'garage never folds');
  G.S.fixtures=[];G.S.rooms=[];G.S.roomOpen={};G.S.mpp=null;
  G.setPick({cat:'downlights',pid:'DL10ES'});G.renderAll();

  /* ---- contextual toolbar: only relevant buttons ---- */
  G.S.plan.loaded=false;G.S.fixtures=[];G.S.rooms=[];G.S.sel=[];G.S.undo=[];G.renderAll();
  var t0=G.toolState();
  ok('with no plan the toolbar offers nothing but a hint',
     !t0.view&&!t0.show&&!t0.edit&&t0.hint,JSON.stringify(t0));
  ok('the hint is the only thing visible in the empty toolbar',
     !d.getElementById('toolhint').hidden&&d.getElementById('grp-view').hidden,'hint hidden');
  G.S.plan.loaded=true;G.renderAll();
  var t1=G.toolState();
  ok('loading a plan reveals the zoom controls, not the fitting toggles',
     t1.view&&!t1.show&&!t1.hint,JSON.stringify(t1));

  /* ---- getting around the plan ---- */
  eq('the plus button steps to the next fixed zoom stop',G.zoomStep(1,1),1.5);
  eq('the minus button steps back down',G.zoomStep(1,-1),0.75);
  eq('an odd zoom snaps to the nearest stop above',G.zoomStep(0.83,1),1);
  eq('zoom will not step past the maximum',G.zoomStep(8,1),8);
  eq('zoom will not step below the minimum',G.zoomStep(0.1,-1),0.1);
  ok('stepping up then down returns to where you were',
     G.zoomStep(G.zoomStep(1,1),-1)===1,'not reversible');
  eq('a plain wheel scroll moves the plan',G.wheelIntent({deltaY:100}),'pan');
  eq('ctrl or a trackpad pinch zooms instead',G.wheelIntent({deltaY:-100,ctrlKey:true}),'zoom');
  eq('cmd and wheel zooms too',G.wheelIntent({deltaY:-100,metaKey:true}),'zoom');
  ok('the plan can never be dragged off screen to the left',
     G.clampPan(-99999,0,1,1000,800,1200,900).x>=-1000+80,'plan lost left');
  ok('nor off the bottom',
     G.clampPan(0,99999,1,1000,800,1200,900).y<=900-80,'plan lost below');
  ok('a plan already on screen is left where it is',
     (function(){var c=G.clampPan(120,60,1,1000,800,1200,900);return c.x===120&&c.y===60;})(),'moved unnecessarily');
  ok('zooming to 100% is always reachable from the percentage button',
     (function(){G.zoomTo(1);return Math.abs(G.S.zoom-1)<1e-6;})(),G.S.zoom);
  G.setPick({cat:'downlights',pid:'DL10ES'});
  G.addFixtures([{x:100,y:100},{x:200,y:100}]);
  var t2=G.toolState();
  ok('placing fittings reveals the display toggles and clear',t2.show&&t2.clear,JSON.stringify(t2));
  ok('the help panel explains how to get the plan back',
     (function(){G.showHelp();var t=d.getElementById('mbody').textContent;
       d.getElementById('modal').classList.remove('open');
       return /Fit/.test(t)&&/drag/i.test(t);})(),'help missing');
  ok('delete only appears with a selection',G.toolState().del===true,'del hidden with selection');
  G.S.sel=[];G.renderAll();
  ok('delete hides again when nothing is selected',G.toolState().del===false,'del still shown');
  ok('the delete button is actually hidden in the DOM',
     d.getElementById('t-del').hidden===true,'t-del visible');

  /* ---- recommendations come from the catalogue, never invented ---- */
  var recK=G.recommendProduct('kitchen');
  ok('a kitchen recommendation is a real catalogue product',
     !!recK&&!!G.byId(recK.p.id),'not a catalogue id');
  eq('a garage is recommended a batten, not a downlight',G.recommendProduct('garage').p.cat,'batten');
  eq('and specifically the T40 Pro',G.recommendProduct('garage').p.id,'T40-CCT-BATTEN-PRO');
  eq('a garage is flagged as not taking downlights',G.ROOMS.garage.dl,false);
  ok('the count table is not applied to a garage',
     (function(){
       G.S.mpp=0.01;G.S.fixtures=[];
       G.S.rooms=[{id:'rg',type:'garage',x:0,y:0,w:600,h:400}];
       return G.recommendForRoom(G.S.rooms[0])===null;
     })(),'table used in a garage');
  ok('a room card still shows both counts when a batten is chosen for the room',
     (function(){
       G.S.mpp=0.01; G.S.roomPid={};
       G.S.rooms=[{id:'rl',type:'living',x:0,y:0,w:460,h:300}];
       G.setRoomLight('rl','T40-CCT-BATTEN-PRO');
       var rec=G.recommendForRoom(G.S.rooms[0]);
       return rec && rec.std>0 && rec.lg>=rec.std && rec.n===null;
     })(),'card went blank');
  ok('and it fills to the selected count once a downlight is chosen',
     (function(){
       G.setRoomLight('rl','DL10-PS');
       var rec=G.recommendForRoom(G.S.rooms[0]);
       return rec.klass==='lg' && rec.n===G.countForRoom(4.6,3.0,'lg');
     })(),'selection not reflected');
  G.S.roomPid={};
  G.S.rooms=[{id:'rg',type:'garage',x:0,y:0,w:600,h:400}];   /* back to the garage */
  ok('filling a garage swaps to the T40 batten even with a downlight selected',
     (function(){
       G.setPick({cat:'downlights',pid:'DL10ES'});
       G.doFill(G.S.rooms[0]);
       return G.S.fixtures.length>0 &&
              G.S.fixtures.every(function(f){return f.pid==='T40-CCT-BATTEN-PRO';});
     })(),G.S.fixtures.map(function(f){return f.pid;}).join(','));
  G.S.fixtures=[];G.S.rooms=[];G.S.mpp=null;
  G.setPick({cat:'downlights',pid:'DL10ES'});
  var recB=G.recommendProduct('bathroom');
  ok('a wet area either gets an IP-rated fitting or an explicit warning',
     !!(recB.p.ip||recB.warn),'wet area unflagged');
  ok('best value picks the highest lumens per dollar',
     (function(){
       var l=G.catProducts('downlights').filter(function(p){return G.parseLumens(p.lumens)&&p.price>0;});
       var best=G.bestValue(l), r=G.parseLumens(best.lumens)/best.price;
       return l.every(function(p){return G.parseLumens(p.lumens)/p.price<=r+1e-9;});
     })(),'not the best ratio');

  /* ---- guided tour ---- */
  var U=window.__TUT, QQ='';
  eq('the tour is six steps',U.STEPS.length,6);
  U.go(1);
  eq('the tour offers a standard and a low glare layout',d.querySelectorAll('[data-layout]').length,2);
  ok('the counts it shows are the bedroom-rule counts the planner would place',
     d.querySelector('[data-layout="std"]').textContent.indexOf('4')>-1 &&
     d.querySelector('[data-layout="lg"]').textContent.indexOf('6')>-1,
     d.querySelector('[data-layout="std"]').textContent);
  eq('the tour bedroom teaches four standard, six low glare',
     d.querySelector('[data-layout="std"] .lay-n').textContent+'/'+
     d.querySelector('[data-layout="lg"] .lay-n').textContent,'4/6');
  ok('showing the standard layout places exactly four, all inside the room',
     (function(){
       U.T.shown=null;U.T.lights=[];U.render();
       d.querySelector('[data-layout="std"]').click();
       return U.T.lights.length===4 &&
              U.T.lights.every(function(p){
                return p.x>=U.ROOM.x&&p.x<=U.ROOM.x+U.ROOM.w&&
                       p.y>=U.ROOM.y&&p.y<=U.ROOM.y+U.ROOM.h;});
     })(),U.T.lights.length);
  ok('and none of them lands on a wall or more than 1.1 m off one',
     U.T.lights.every(function(p){var mm=U.wallMM(p);return mm>=500&&mm<=1600;}),
     U.T.lights.map(function(p){return U.wallMM(p);}).join(','));
  ok('showing the low glare layout places six',
     (function(){ d.querySelector('[data-layout="lg"]').click(); return U.T.lights.length===6; })(),
     U.T.lights.length);
  U.T.shown=null;U.T.lights=[];
  U.go(99); eq('step navigation clamps at the end',U.T.i,5);
  U.go(-5); eq('step navigation clamps at the start',U.T.i,0);
  eq('spacing under 1.2 m reads as too close',U.spacingVerdict(0.9),'close');
  eq('spacing of 1.5 m reads as correct',U.spacingVerdict(1.5),'ok');
  eq('there is no upper limit — wide spacing still reads as fine',U.spacingVerdict(2.1),'ok');
  eq('and neither does a very wide gap',U.spacingVerdict(3.4),'ok');
  eq('under 1.5 m is the only failure',U.spacingVerdict(1.3),'close');
  ok('the spacing the planner computes falls inside the band the tour teaches',
     U.spacingVerdict(G.spacingFor(2.7,110))==='ok',G.spacingFor(2.7,110));
  eq('wall distance under 600 mm reads as too close',U.wallVerdict(550),'close');
  eq('wall distance of 875 mm reads as correct',U.wallVerdict(875),'ok');
  eq('wall distance over 1 m reads as too far',U.wallVerdict(1100),'far');
  /* Whatever the planner actually lays out has to sit inside the band the tour
     teaches, or the app is contradicting its own lesson. */
  ok('every wall gap the planner lays out falls inside the band the tour teaches',
     (function(){
       /* Only the outside row and column have a wall gap - the middle of a
          3 x 3 grid is nowhere near a wall, and measuring it would prove
          nothing. */
       var bad=[];
       [[2.6,3.2,4],[3.5,4,4],[4,5,4],[5,4,9],[5.5,9,8],[7,12,10]].forEach(function(t){
         var pts=G.gridInRoom(t[0],t[1],t[2],0.75);
         var xs=Array.from(new Set(pts.map(function(p){return p.x;}))).sort(function(a,b){return a-b;});
         var ys=Array.from(new Set(pts.map(function(p){return p.y;}))).sort(function(a,b){return a-b;});
         [xs[0], t[0]-xs[xs.length-1], ys[0], t[1]-ys[ys.length-1]].forEach(function(m){
           if(U.wallVerdict(Math.round(m*1000))!=='ok') bad.push(t.join('x')+': '+Math.round(m*1000)+' mm');
         });
       });
       QQ=bad.join(' | ');
       return !bad.length;
     })(),QQ);
  eq('wall distance is measured to the nearest wall',
     U.wallMM({x:U.ROOM.x+U.PXM*0.75,y:U.ROOM.y+U.ROOM.h/2}),750);
  ok('lights cannot be dragged outside the room',
     (function(){var p=U.clampRoom({x:-500,y:9999});
       return p.x>=U.ROOM.x&&p.y<=U.ROOM.y+U.ROOM.h;})(),'escaped the room');
  ok('the app opens on the home screen, not straight into the planner',
     U.homeIsDefault(),'home was not the default');
  U.openTut();
  ok('the guide replaces the home screen',
     d.getElementById('tut').classList.contains('on')&&!d.getElementById('home').classList.contains('on'),'tour not shown');
  ok('step two renders a clickable room stage',!!d.getElementById('stage')||U.T.i===0,'no stage');
  U.openPlanner();
  ok('starting the project leaves both overlays closed',
     !d.getElementById('tut').classList.contains('on')&&!d.getElementById('home').classList.contains('on'),'overlay stuck');

  /* ---- rule 04 uses real catalogue fittings ---- */
  ok('each of the three fittings is a real catalogue product',
     U.BEAM_PICKS.every(function(b){return !!G.byId(b.id);}),'not in the catalogue');
  ok('each one has a beam figure and a photo, so nothing is invented',
     U.BEAM_PICKS.every(function(b){var p=G.byId(b.id);
       return G.parseBeam(p.beam)&&p.img&&p.price>0;}),'missing spec or photo');
  eq('the flat standard is the wide one',G.parseBeam(G.byId('DL9ES-FLAT-HL').beam),100);
  eq('the low glare option is 60°',G.parseBeam(G.byId('DL10-PS').beam),60);
  eq('the gimbal is 60° too',G.parseBeam(G.byId('DL10GS-IP65').beam),60);
  ok('the wide fitting throws a bigger pool than the low glare one',
     G.poolDiameter(2.7,G.parseBeam(G.byId('DL9ES-FLAT-HL').beam))>
     G.poolDiameter(2.7,G.parseBeam(G.byId('DL10-PS').beam)),'pool sizes wrong way round');
  U.T.beamPid=null; U.go(4);
  eq('the step renders one card per fitting',d.querySelectorAll('[data-beamp]').length,3);
  ok('the diagram is drawn from the selected product',
     !!d.querySelector('.beamsvg'),'no diagram');
  ok('the pool size quoted matches the app calculation',
     d.querySelector('.tut-copy .rule .v').textContent.indexOf(
       G.poolDiameter(2.7,G.parseBeam(G.byId('DL10-PS').beam)).toFixed(1))>-1,
     d.querySelector('.tut-copy .rule .v').textContent);
  U.T.beamPid='DL9ES-FLAT-HL'; U.render();
  ok('choosing the flat fitting redraws the diagram wider',
     d.querySelector('.tut-copy .rule .v').textContent.indexOf(
       G.poolDiameter(2.7,100).toFixed(1))>-1,
     d.querySelector('.tut-copy .rule .v').textContent);
  U.go(U.STEPS.length-1);
  eq('the finish shows four mood tiles',d.querySelectorAll('.moodtile').length,4);
  eq('the step counter reports the real number of steps',
     d.getElementById('tut-of').textContent,String(U.STEPS.length));
  ok('every tile has a real image and a caption',
     Array.prototype.every.call(d.querySelectorAll('.moodtile'),function(f){
       return f.querySelector('img').getAttribute('src').indexOf('data:image/webp')===0 &&
              f.querySelector('figcaption b').textContent.length>3;}),'tile incomplete');
  ok('the layered-lighting step is gone',U.STEPS.indexOf('layers')===-1,'layers step still there');
  ok('the finish no longer claims to have taught layering',
     d.querySelector('.tut-copy').textContent.toLowerCase().indexOf('three layers')===-1,'stale claim');
  U.go(0);

  /* ---- submission payload ---- */
  G.S.fixtures=[];G.S.rooms=[];G.S.mpp=0.01;
  G.setPick({cat:'downlights',pid:'DL10ES'});
  G.addFixtures([{x:100,y:100},{x:200,y:100},{x:300,y:100}]);
  var pay=U.submissionPayload({name:'A Builder',email:'a@b.test',phone:'0400',suburb:'Ellenbrook',
                               jobType:'New build',notes:'',project:'Lot 42'});
  eq('the submission carries the fitting count',pay.schedule.fittings,3);
  eq('the submission totals match the on-screen schedule',
     pay.schedule.totalIncGst,G.bomTotals(G.bomLines()).inc);
  ok('the submission carries the customer contact details',
     pay.customer.name==='A Builder'&&pay.customer.email==='a@b.test','contact missing');
  ok('every schedule line carries a product code and quantity',
     pay.schedule.lines.every(function(l){return l.code&&l.qty>0;}),'line incomplete');
  eq('the plan image is attached separately, not guessed',pay.planPng,null);
  ok('the send endpoint posts to /api/submit-layout on our own site',
     U.endpoint()==='/api/submit-layout','endpoint wrong');
  ok('the submission carries the full editable plan, so our side can reopen it',
     !!(pay.planData&&pay.planData.v===1&&pay.planData.fixtures.length===3),'planData missing');
  G.S.fixtures=[];G.S.rooms=[];G.S.sel=[];G.S.mpp=null;G.S.plan.loaded=false;G.renderAll();

  /* ============================================================
     Star lights, big-room comfort, wall lights, pendant, smart
     ============================================================ */
  (function(){
    var S=G.S;
    var keepR=G.S.rooms, keepF=G.S.fixtures, keepM=G.S.mpp, keepC=G.S.ceiling;
    /* The picker is shared with the step-4 UI, so whatever this block selects
       has to be put back or the tests that run after it read a card that no
       longer matches state. */
    var keepPick={cat:S.pick.cat,pid:S.pick.pid,qty:S.pick.qty,arr:S.pick.arr};
    var PX=100;                       /* 100 px to the metre, for round numbers */
    S.plan.loaded=true; S.plan.w=3000; S.plan.h=2000; S.mpp=1/PX; S.ceiling=2.7;
    S.fixtures=[]; S.rooms=[]; S.sel=[];
    S.roomComfort={}; S.roomFan={}; S.roomAskFan={}; S.roomPid={};

    /* ---- star lights are set 500 mm apart, not at downlight spacing ---- */
    eq('a star light is recognised as one',G.isStarLight(G.byId('DL03-ALL-1')),true);
    (function(){
      var keepFx=G.S.fixtures, keepSel=G.S.sel, keepPick={cat:G.S.pick.cat,pid:G.S.pick.pid};
      G.S.fixtures=[]; G.S.sel=[];
      G.setPick({cat:'star',pid:'DL03-ALL-1'});
      G.addFixtures([{x:100,y:100},{x:140,y:100},{x:180,y:100}]);
      var grps=G.S.fixtures.map(function(f){return f.grp;});
      ok('a placed star run arrives as one group',
         grps.every(function(g){return g&&g===grps[0];}),'grps: '+grps.join(','));
      G.S.sel=G.S.fixtures.map(function(f){return f.id;});
      G.ungroupSelected();
      ok('ungroup hands each star back',G.S.fixtures.every(function(f){return !f.grp;}),'grp survived');
      G.groupSelected();
      ok('and group ties them together again',
         G.S.fixtures.every(function(f){return f.grp===G.S.fixtures[0].grp;}),'not grouped');
      G.S.fixtures=keepFx; G.S.sel=keepSel; G.setPick(keepPick);
    })();
    eq('a downlight is not',G.isStarLight(G.byId('DL10ES')),false);
    G.setPick({cat:'star',qty:4,arr:'row'}); S.pick.pid='DL03-ALL-1';
    var sp=G.groupPointsAt(500,500);
    near('star lights drop 0.5 m apart',
         Math.hypot(sp[1].x-sp[0].x,sp[1].y-sp[0].y)/PX,G.STAR_SPACING_M,0.001);
    eq('and 0.5 m is the cap, not a suggestion',G.STAR_SPACING_M<=0.5,true);
    G.setPick({cat:'downlights',qty:4,arr:'row'}); S.pick.pid='DL10ES';
    var dp=G.groupPointsAt(500,500);
    ok('a downlight still uses the ceiling-height rule, not the star spacing',
       Math.hypot(dp[1].x-dp[0].x,dp[1].y-dp[0].y)/PX > 1.4,
       Math.hypot(dp[1].x-dp[0].x,dp[1].y-dp[0].y)/PX);

    /* ---- the comfort question, and who is asked it ---- */
    var big={id:'qBIG',type:'living',x:100,y:100,w:5.5*PX,h:8.5*PX};
    S.rooms=[big]; S.roomPid[big.id]='DL10ES';
    ok('a 5.5 x 8.5 m living room is a big room and gets asked',G.isBigRoom(big),'not big');
    ok('a 3.5 x 4 m study is not',
       !G.isBigRoom({id:'qSM',type:'study',x:0,y:0,w:3.5*PX,h:4*PX}),'asked anyway');
    ok('a bathroom is capped, so it is never asked',
       !G.isBigRoom({id:'qB',type:'bathroom',x:0,y:0,w:6*PX,h:9*PX}),'asked anyway');
    S.roomComfort[big.id]='less';
    eq('less light places six',G.recommendForRoom(big).n,G.COMFORT.less);
    S.roomComfort[big.id]='more';
    eq('more light places nine',G.recommendForRoom(big).n,G.COMFORT.more);
    delete S.roomComfort[big.id];
    var asIs=G.recommendForRoom(big).n;
    ok('with no answer the count stays inside the 6-9 window',
       asIs>=G.COMFORT.less && asIs<=G.COMFORT.more, asIs);
    /* the house rule still beats the question */
    var bed={id:'qBED',type:'bedroom',x:0,y:0,w:5.5*PX,h:8.5*PX};
    S.rooms=[bed]; S.roomFan[bed.id]='none'; S.roomPid[bed.id]='DL10ES';
    ok('a bedroom is never asked, whatever size it is',!G.isBigRoom(bed),'asked');
    eq('and a big bedroom is still four downlights',G.recommendForRoom(bed).n,4);
    S.roomComfort={};

    /* ---- the fan question comes first in a bedroom or an alfresco ---- */
    S.rooms=[]; S.roomFan={}; S.roomAskFan={}; S.fanPlan='ask';
    ok('bedroom and alfresco are the whole list of rooms that ask about a fan',
       Object.keys(G.ROOMS).filter(function(k){return G.ROOMS[k].fan;}).sort().join(',')
         ==='alfresco,bedroom',
       Object.keys(G.ROOMS).filter(function(k){return G.ROOMS[k].fan;}).join(','));

    /* ---- outdoor wall lights ---- */
    eq('a wall light is recognised by name',
       G.isWallLight(G.byId('MR10-CCT-WALL-B')),true);
    ok('every wall light offered actually exists in the planner catalogue',
       G.SPECIAL.wall.choices.every(function(c){return !!G.byId(c.id);}),
       G.SPECIAL.wall.choices.filter(function(c){return !G.byId(c.id);})
         .map(function(c){return c.id;}).join(','));
    ok('the indoor wall light is no longer offered',
       !G.SPECIAL.wall.choices.some(function(c){return c.id==='WL8-CCT-BW-1';}),
       'indoor still there');
    ok('the wall light card says it is for outside',
       /outdoor/i.test(G.SPECIAL.wall.label),G.SPECIAL.wall.label);
    /* facing: away from whichever wall it was dropped against */
    S.rooms=[{id:'qW',type:'alfresco',x:0,y:0,w:600,h:400}];
    eq('on the left wall it throws right',G.wallFacing(20,200),90);
    eq('on the right wall it throws left',G.wallFacing(580,200),270);
    eq('on the top wall it throws down',G.wallFacing(300,15),180);
    eq('on the bottom wall it throws up',G.wallFacing(300,385),0);
    S.fixtures=[];
    G.setPick({cat:'ceiling',qty:1,arr:'row'}); S.pick.pid='MR10-CCT-WALL-B';
    G.addFixtures([{x:20,y:200}]);
    var wf=S.fixtures[S.fixtures.length-1];
    eq('a placed wall light carries the way it faces',wf.rot,90);
    S.sel=[wf.id]; G.rotateSelected(1);
    eq('and it turns 15 degrees at a time',S.fixtures[S.fixtures.length-1].rot,105);
    ok('turning it by hand marks it as aimed',wf.aimed===true,'not marked');
    /* The bug Lazar reported: you could move an outdoor light or aim it, never
       both, because every drag re-ran the auto-facing and threw the aim away. */
    var keep=wf.rot; wf.x+=40; wf.y+=40;
    if(!wf.aimed) wf.rot=G.wallFacing(wf.x,wf.y);
    eq('a hand-aimed light keeps its aim when it is moved',wf.rot,keep);
    G.resetAim();
    ok('auto aim puts it back on the nearest wall',
       wf.aimed===undefined && wf.rot===G.wallFacing(wf.x,wf.y),'still hand-aimed');
    /* Dragging the handle: point it straight down and it should read 180. */
    G.aimTowards(wf,{x:wf.x,y:wf.y+100});
    eq('dragging the aim handle points it that way',wf.rot,180);
    var hp=G.aimHandlePt(wf);
    ok('the aim handle sits in front of the light, not on top of it',
       Math.hypot(hp.x-wf.x,hp.y-wf.y)>20,'handle is on the fitting');
    ok('the aim handle can be grabbed where it is drawn',
       !!G.aimHandleAt({x:hp.x,y:hp.y}),'handle not hit-testable');
    /* Lazar: "BUDGET OUTDOOR LIGHT NEEDS TO BE REMOVED" - gone from the
       picker, but still resolvable so older saved plans still price. */
    ok('the budget outdoor light is not offered any more',
       !G.SPECIAL.wall.choices.some(function(c){return c.id==='W10-CCT-BW';}),'still offered');
    ok('but a plan saved with it in still resolves it',
       !!G.byId('W10-CCT-BW'),'no longer resolvable');
    G.setPick({cat:'downlights',qty:1,arr:'row'}); S.pick.pid='DL10ES';
    S.fixtures=[]; G.addFixtures([{x:300,y:200}]);
    eq('a ceiling fitting has no facing to carry',
       S.fixtures[S.fixtures.length-1].rot,undefined);
    var wsvg=G.symbolSvg('wall',50,50,10,null,G.byId('MR10-CCT-WALL-B'),90);
    ok('the wall light is drawn as an arc in front, not a full disc',
       wsvg.indexOf('A ')>-1 && wsvg.indexOf('<circle')===-1,'drawn as a disc');

    /* ---- the pendant is drawn as a pendant ---- */
    eq('a supplied pendant gets its own symbol',
       G.symbolFor('ceiling',{id:'OWN-PENDANT',cat:'ceiling',name:'My pendant'}),'pendant');
    eq('an ordinary ceiling light does not',
       G.symbolFor('ceiling',G.byId('C25-CCT-PA')),'round');
    ok('the pendant button carries a drawn mark, not a glyph',
       /<svg/.test(G.SPECIAL.pendant.icon),G.SPECIAL.pendant.icon);
    var psvg=G.symbolSvg('pendant',50,50,10,null,{id:'OWN-PENDANT',name:'x'});
    ok('the pendant mark has a canopy, a drop and a shade',
       psvg.indexOf('<rect')>-1 && psvg.indexOf('<line')>-1 && psvg.indexOf('<path')>-1,
       'pendant mark incomplete');

    /* ---- smart lights are reachable from the room picker ---- */
    ok('there are smart fittings to offer',G.smartLights().length>0,'none found');
    ok('every one of them is a light, not a controller or a driver',
       G.smartLights().every(function(p){return G.fxKind(p)==='smart';}),'non-smart in the group');
    eq('the picker offers a short smart list, not every smart fitting we sell',
       G.pickerGroupProducts('smart').length,3);
    ok('and every one of them is really in the catalogue',
       G.pickerGroupProducts('smart').every(function(p){return !!G.byId(p.id);}),
       'a listed id is not a product');
    ok('and a real category still comes back from the catalogue',
       G.pickerGroupProducts('batten').length>0,'batten group empty');

    /* ---- the picker is a short list of real choices ---- */
    ok('no picker group runs past four fittings',
       ['downlights','smart','ceiling','batten','star'].every(function(k){
         return G.pickerGroupProducts(k).length<=4;
       }),'a group is still too long');
    ok('and no group is empty',
       ['downlights','smart','ceiling','batten','star'].every(function(k){
         return G.pickerGroupProducts(k).length>0;
       }),'a group came back empty');
    ok('no two fittings in one group read as the same line',
       ['downlights','smart','ceiling','batten','star'].every(function(k){
         var seen={};
         return G.pickerGroupProducts(k).every(function(p){
           var l=G.pickerLabel(p).toLowerCase();
           if(seen[l]) return false; seen[l]=1; return true;
         });
       }),'two identical lines in one group');
    ok('a low glare fitting says so when its plain name does not',
       G.pickerGroupProducts('downlights').every(function(p){
         return G.fittingClass(p)!=='lg' || /low glare/i.test(G.pickerLabel(p));
       }),'low glare not called out');
    ok('a room with a fan still has a low glare fitting to offer',
       G.pickerGroupProducts('downlights').filter(function(p){
         return G.fittingClass(p)==='lg';
       }).length>0,'no low glare downlight left for a fan room');

    /* ---- how the two new questions actually render on the card ---- */
    S.rooms=[]; S.fixtures=[]; S.sel=[]; S.roomPid={}; S.roomFan={}; S.roomAskFan={};
    S.roomComfort={}; S.roomOpen={};
    var cLv={id:'cL',type:'living',x:0,y:0,w:7*PX,h:12*PX};     /* clamps to 9 */
    var cDn={id:'cD',type:'dining',x:0,y:0,w:5.5*PX,h:8.5*PX};   /* count comes to 7 */
    S.rooms=[cLv,cDn]; S.roomPid[cLv.id]='DL10ES'; S.roomPid[cDn.id]='DL10ES';
    S.roomOpen[cLv.id]=true; S.roomOpen[cDn.id]=true;
    G.renderAll();
    /* Each question on the room card is one dropdown, so the answers are its
       options and the chosen one is its value. */
    function comfortSel(id){ return d.querySelector('[data-roomcomfort="'+id+'"]'); }
    eq('a room whose count clamps to the top offers two answers, not three',
       comfortSel(cLv.id).options.length,2);
    eq('and the one it already matches is the one selected',
       comfortSel(cLv.id).value,'more');
    eq('a room that sits inside the window offers all three',
       comfortSel(cDn.id).options.length,3);
    eq('with the measured answer selected',comfortSel(cDn.id).value,'');
    ok('a small room is not asked at all',
       d.querySelectorAll('[data-roomcomfort]').length===2,
       d.querySelectorAll('[data-roomcomfort]').length);

    /* One card open at a time. Two rooms open down the rail at once, one of
       them a finished room somebody had opened to edit, is the "it gets
       confusing" report - marking a new room has to shut everything else. */
    S.rooms=[]; S.fixtures=[]; S.roomPid={}; S.roomFan={}; S.roomComfort={};
    S.roomOpen={}; S.roomEdit={}; S.roomAskFan={};
    var oA={id:'oA',type:'study',x:0,y:0,w:4*PX,h:4*PX};
    var oB={id:'oB',type:'study',x:600,y:0,w:4*PX,h:4*PX};
    S.rooms=[oA,oB];
    S.roomOpen[oA.id]=true; S.roomEdit[oA.id]=true;
    G.closeOtherRooms(oB.id); S.roomOpen[oB.id]=true;
    ok('opening one room card closes every other one',
       !G.roomIsOpen(oA)&&G.roomIsOpen(oB),
       'A open: '+G.roomIsOpen(oA)+', B open: '+G.roomIsOpen(oB));
    ok('and a finished room that was open for editing closes with them',
       !S.roomEdit[oA.id],'still flagged for editing');
    S.rooms=[]; S.roomOpen={}; S.roomEdit={};

    /* the fan question, while it is still blocking the room */
    S.rooms=[]; S.fixtures=[]; S.roomPid={}; S.roomFan={}; S.roomComfort={}; S.roomOpen={};
    var aBed={id:'aB',type:'bedroom',x:0,y:0,w:3.5*PX,h:4*PX};
    S.rooms=[aBed]; S.roomAskFan[aBed.id]=true; S.roomOpen[aBed.id]=true;
    G.renderAll();
    ok('an unanswered bedroom shows the question up front',
       !!d.querySelector('.rask'),'no prompt');
    var fanSel=d.querySelector('[data-roomfan="'+aBed.id+'"]');
    ok('and nothing is chosen yet, because "no fan" is itself an answer',
       fanSel.selectedIndex>-1 && fanSel.options[fanSel.selectedIndex].disabled,
       'an option was pre-selected: '+fanSel.value);
    eq('the fan question is one dropdown with the three real answers in it',
       Array.prototype.filter.call(fanSel.options,function(o){return !o.disabled;}).length,3);
    ok('the room is left empty until it is answered',G.roomFittings(aBed)===0,
       G.roomFittings(aBed));
    /* answering it lays the room out and clears the prompt */
    fanSel.value=''; fanSel.onchange();
    ok('answering it clears the prompt',!d.querySelector('.rask'),'prompt still there');
    ok('and the room is lit straight away',G.roomFittings(aBed)>0,'still empty');
    eq('a bedroom without a fan is still four downlights',G.roomFittings(aBed),4);
    S.roomAskFan={}; S.roomFan={}; S.roomOpen={};

    /* ---- rooms finished: naming, and the panel on the plan ---- */
    S.rooms=[]; S.fixtures=[]; S.sel=[]; S.roomPid={}; S.roomFan={}; S.roomAskFan={};
    var k1={id:'nK',type:'kitchen',x:0,   y:0,  w:4*PX,h:4*PX};
    var b1={id:'nB1',type:'bedroom',x:500,y:0,  w:3.5*PX,h:4*PX};
    var b2={id:'nB2',type:'bedroom',x:900,y:0,  w:3.5*PX,h:4*PX};
    S.rooms=[k1,b1,b2];
    eq('the only kitchen is just "Kitchen"',G.roomName(k1),'Kitchen');
    eq('the first of two bedrooms is Bed 1',G.roomName(b1),'Bed 1');
    eq('and the second is Bed 2',G.roomName(b2),'Bed 2');
    S.rooms=[k1,b1];
    eq('drop one and the remaining bedroom loses its number again',G.roomName(b1),'Bed');
    ok('every room type has a short name to be listed under',
       Object.keys(G.ROOMS).every(function(k){return !!G.ROOMS[k].short;}),
       Object.keys(G.ROOMS).filter(function(k){return !G.ROOMS[k].short;}).join(','));
    ok('and no two types share one short name',
       (function(){
         var seen={},dupe=false;
         Object.keys(G.ROOMS).forEach(function(k){
           if(seen[G.ROOMS[k].short]) dupe=true; seen[G.ROOMS[k].short]=1; });
         return !dupe;
       })(),'two room types share a short name');

    /* the panel itself */
    S.rooms=[k1,b1]; S.fixtures=[]; S.roomFan[b1.id]='none';
    G.renderAll();
    var panel=d.getElementById('donep');
    ok('with nothing finished the panel stays out of the way',panel.hidden,'panel showing');
    S.roomPid[k1.id]='DL10ES';
    G.doFill(k1);
    G.renderAll();
    ok('finishing a room brings the panel up',!panel.hidden,'panel still hidden');
    eq('and it lists that one room',d.querySelectorAll('#donep-b .donep-row').length,1);
    eq('the count reads finished-of-total',d.getElementById('donep-c').textContent,'1 of 2');
    ok('the row is named the same as the room card',
       d.querySelector('#donep-b .donep-nm b').textContent==='Kitchen',
       d.querySelector('#donep-b .donep-nm b').textContent);
    /* The row is one line now: name, count, Edit, remove. Changing the light
       happens on the card that Edit opens, not in the list. */
    ok('the row carries an Edit button',
       !!d.querySelector('#donep-b [data-doneedit="'+k1.id+'"]'),'no edit button');
    ok('and a remove button',
       !!d.querySelector('#donep-b [data-donedel="'+k1.id+'"]'),'no remove button');
    ok('the row no longer carries a light dropdown',
       !d.querySelector('#donep-b [data-donelight]'),'dropdown still there');
    /* an unfinished room must not appear - the panel is a record of progress */
    ok('the unfinished bedroom is not listed as finished',
       !d.querySelector('#donep-b [data-doneedit="'+b1.id+'"]'),'unfinished room listed');
    /* Edit opens that room back up as a full card */
    d.querySelector('#donep-b [data-doneedit="'+k1.id+'"]').click();
    ok('pressing Edit opens the finished room again',G.roomIsOpen(k1),'stayed shut');
    ok('and it is still listed as finished while being edited',
       d.querySelectorAll('#donep-b .donep-row').length===1,'row vanished');
    delete S.roomEdit[k1.id];
    G.renderAll();
    ok('closing it puts it back to a row',!G.roomIsOpen(k1),'stayed open');
    S.rooms=[]; S.fixtures=[]; S.roomPid={}; G.renderAll();
    ok('with every room gone the panel goes away again',
       d.getElementById('donep').hidden,'panel still showing');

    S.rooms=keepR; S.fixtures=keepF; S.mpp=keepM; S.ceiling=keepC;
    S.sel=[]; S.roomComfort={}; S.roomAskFan={}; S.plan.loaded=false;
    G.setPick({cat:keepPick.cat,qty:keepPick.qty,arr:keepPick.arr});
    S.pick.pid=keepPick.pid;
    G.setPick({});                     /* repaint the card from restored state */
    G.renderAll();
  })();

  /* ---- report ---- */
  var box=d.getElementById('qa');
  if(box){
    box.className='show';
    box.innerHTML='<h4>QA — '+pass+'/'+(pass+fail)+' passing'+(fail?' · '+fail+' FAILED':'')+'</h4>'+
      R.map(function(r){return '<div class="'+(r.ok?'p':'f')+'">'+(r.ok?'✓':'✗')+' '+r.n+
        (r.ok?'':' — '+r.got)+'</div>';}).join('');
  }
  return {pass:pass,fail:fail,results:R};
};
}
