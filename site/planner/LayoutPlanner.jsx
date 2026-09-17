'use client';
/* Greenhse Layout Planner — the React component.

   The planner is a canvas editor: a floor plan image, an SVG of fittings and
   rooms over it, drag/aim/snap interaction, a PDF pipeline and a 400-assertion
   QA suite, all written against the DOM. Rewriting that as React state would
   be a rewrite of the tool, not a port of it, and would not "work smoothly
   just like it was before". So the split is the one every React app makes
   for an editor, a map or a chart:

     - the SHELL — every element the user sees — is JSX below, rendered by
       React, with the same ids and class names the engine looks up;
     - the ENGINE (engine/core.js, home.js, qa.js, track.js) is imported on
       the client after the shell is in the DOM and told to mount into it;
     - on unmount, everything the engine hung on window/document is removed
       (engine/lifecycle.js), so client-side navigation away and back is
       clean.

   The engine is loaded with dynamic import() inside useEffect so nothing that
   touches window runs during server rendering. The component holds no React
   state on purpose: it never re-renders, so React never fights the engine for
   the DOM it draws into. */
import * as React from 'react';
import './planner.css';

export default function LayoutPlanner() {
  React.useEffect(() => {
    let alive = true;
    let rec = null;
    let lifecycle = null;
    (async () => {
      lifecycle = await import('./engine/lifecycle');
      if (!alive) return;
      rec = lifecycle.begin();
      const [qa, core, home, track] = await Promise.all([
        import('./engine/qa'),
        import('./engine/core'),
        import('./engine/home'),
        import('./engine/track'),
      ]);
      if (!alive) { lifecycle.end(rec); rec = null; return; }
      /* The page loaded four scripts in a row and then ran init() and boot()
         on DOMContentLoaded. Same sequence here: define everything, then
         start the engine, then the home screen. */
      qa.installQA();
      const init = core.mountCore();
      const boot = home.mountHome();
      track.mountTrack();
      init();
      boot();
      lifecycle.settle(rec);
    })();
    return () => {
      alive = false;
      if (rec && lifecycle) lifecycle.end(rec);
    };
  }, []);

  return (
    <div className="gh-planner">
      <header className="hdr">
        <a className="brand" href="/" title="Back to greenhse home">
          <b>GREENHSE</b>
          <span>Layout</span>
        </a>
        {' '}
        <input className="proj" id="projname" defaultValue="Untitled plan" aria-label="Project name" maxLength="60" />
        {' '}
        <span className="spacer" />
        {' '}
        <button type="button" className="hbtn" id="btn-save" title="Download the plan and light summary as a PDF">
          <svg viewBox="0 0 24 24">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          <span className="lbl">Save</span>
        </button>
        {' '}
        <button type="button" className="hbtn" id="btn-open" title="Reopen a saved layout">Open</button>
        {' '}
        <button type="button" className="hbtn" id="btn-faq" title="Why the planner does what it does — fans, low glare, beam angles, which fitting goes where">FAQ</button>
        {' '}
        <button type="button" className="hbtn" id="btn-png" title="Download the marked-up plan as a PNG">Export PNG</button>
        {' '}
        <button type="button" className="hbtn pri" id="btn-print" title="Print or save a PDF of the plan plus the light schedule">
          <svg viewBox="0 0 24 24">
            <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <path d="M6 14h12v8H6z" />
          </svg>
          <span className="lbl">Plan + schedule</span>
        </button>
      </header>
      <div className="shell">
        {/* ================= LEFT RAIL ================= */}
        <aside className="rail" id="rail">
          {/* WHAT TO DO NEXT */}
          <button type="button" className="nextup" id="nextup">
            <span className="nextup-k">Do this next</span>
            {' '}
            <span className="nextup-t" id="nextup-t" />
            {' '}
            <span className="nextup-s" id="nextup-s" />
          </button>
          {/* Once the plan is in and the scale is set, steps 01 and 02 fold
              away into this one line — with a way back if anything changes. */}
          <div className="setupbar" id="setupbar" hidden />
          {/* STEP 1 */}
          <section className="step open" data-step="1">
            <button type="button" className="step-head">
              <span className="step-n">01</span>
              <span className="step-t">Add your floor plan</span>
              <span className="step-state" id="st1">No plan yet</span>
              <i className="chev" />
            </button>
            <div className="step-body">
              <p className="step-lead">Drop in a photo or a PDF of your plan. A phone photo is fine.</p>
              <div className="drop" id="drop">
                <svg viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5-5 5 5M12 5v13" />
                </svg>
                {' '}
                <b>Drop a floor plan here</b>
                {' '}
                <small>PNG · JPG · PDF · or click to browse</small>
              </div>
              <input type="file" id="file" accept="image/*,.pdf,application/pdf" hidden />
              <div className="row2" style={{marginTop:'10px'}}>
                <button type="button" className="act ghost sm" id="btn-demo">Use sample plan</button>
                {' '}
                <button type="button" className="act ghost sm" id="btn-clearplan">Remove plan</button>
              </div>
              <details className="whyd">
                <summary>Why a plan first?</summary>
                <div className="teach">A plan lets us work in real metres instead of guessing. A phone photo of a printed plan is fine — as long as the whole plan is in frame and roughly square-on.</div>
              </details>
              <div id="pdfnote" />
            </div>
          </section>
          {/* STEP 2 */}
          <section className="step" data-step="2">
            <button type="button" className="step-head">
              <span className="step-n">02</span>
              <span className="step-t">Tell it how big</span>
              <span className="step-state" id="st2">Not set</span>
              <i className="chev" />
            </button>
            <div className="step-body">
              <p className="step-lead">Tell it what you are going to measure, then put 2 points across that thing on the plan. That is the scale set — everything else sizes itself from there.</p>
              <div id="paperbox" />
              <div className="q">
                <label className="qlabel" htmlFor="calref">What are you measuring?</label>
                <div className="selwrap">
                  <select className="sel" id="calref" defaultValue=''>
                    <option value="" disabled>Choose one…</option>
                    <option value="0.82">A standard internal door — 820 mm</option>
                    <option value="0.9">A kitchen bench, front to back — 900 mm</option>
                    <option value="custom">Something else — I'll type the length</option>
                  </select>
                </div>
                <div id="calcustom" style={{display:'none'}}>
                  <label className="qlabel" htmlFor="callen" style={{marginTop:'10px'}}>How long is it really?</label>
                  <div className="row2">
                    <input className="txt" id="callen" type="text" inputMode="decimal" placeholder="e.g. 3.6 or 3,6" />
                    <div className="selwrap">
                      <select className="sel" id="calunit">
                        <option value="1">metres</option>
                        <option value="0.001">millimetres</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="hint" style={{margin:'9px 0 0'}}>The longer the thing you measure, the more accurate the whole plan.</div>
                <button type="button" className="act pri" id="btn-cal" style={{marginTop:'9px'}} disabled>
                  <svg viewBox="0 0 24 24">
                    <path d="M3 12h18M6 9v6M18 9v6" />
                  </svg>
                  Put 2 points on the plan
                </button>
                <button type="button" className="act go sm" id="btn-calapply" style={{marginTop:'8px',display:'none'}} disabled>Apply scale</button>
              </div>
              <div className="q" id="scalebox" />
              <div className="q">
                <label className="qlabel" htmlFor="ceil">Ceiling height</label>
                <div className="selwrap">
                  <select className="sel" id="ceil" defaultValue='2.7'>
                    <option value="2.4">2.40 m — standard older build</option>
                    <option value="2.55">2.55 m</option>
                    <option value="2.7">2.70 m — most new WA homes</option>
                    <option value="3">3.00 m</option>
                    <option value="3.3">3.30 m</option>
                    <option value="4">4.00 m — raked / void</option>
                  </select>
                </div>
              </div>
              <details className="whyd">
                <summary>Why set a scale?</summary>
                <div className="teach" id="teach-scale">Once the app knows metres per pixel it can size fittings to their real cut-out, space them by the rules below, and count what a room actually needs.</div>
              </details>
            </div>
          </section>
          {/* STEP 3 */}
          <section className="step" data-step="3">
            <button type="button" className="step-head">
              <span className="step-n">03</span>
              <span className="step-t">Draw your rooms</span>
              <span className="step-state" id="st3">0 rooms</span>
              <i className="chev" />
            </button>
            <div className="step-body">
              <p className="step-lead">Pick what the room is, then drag a box around it.</p>
              <div className="scalewarn" data-scalewarn="" hidden />
              <div className="q">
                <label className="qlabel" htmlFor="rtype">What is this room?</label>
                <div className="selwrap">
                  <select className="sel" id="rtype" />
                </div>
              </div>
              <button type="button" className="act pri" id="btn-room">
                <svg viewBox="0 0 24 24">
                  <path d="M3 3h18v18H3z" />
                </svg>
                Drag a box around the room
              </button>
              <div id="roomlist" style={{marginTop:'14px'}} />
              <aside className="donep" id="donep" hidden aria-label="Rooms finished">
                <button type="button" className="donep-h" id="donep-h">
                  <b>Rooms finished</b>
                  <span className="cnt" id="donep-c" />
                  <i className="cv" />
                </button>
                <div className="donep-b" id="donep-b" />
              </aside>
            </div>
          </section>
          {/* STEP 4 */}
          <section className="step" data-step="4">
            <button type="button" className="step-head">
              <span className="step-n">04</span>
              <span className="step-t">Add extra lights</span>
              <span className="step-state" id="st4">Optional</span>
              <i className="chev" />
            </button>
            <div className="step-body">
              <p className="step-lead">Optional. Your rooms are already lit — this is for extras on top.</p>
              <div className="scalewarn" data-scalewarn="" hidden />
              <div className="q">
                <div className="specrow" id="specrow" />
                <div id="specpanel" />
                <div className="rsub">Or anything from the catalogue</div>
                <label className="qlabel" htmlFor="cat">1 · What kind of light?</label>
                <div className="selwrap">
                  <select className="sel" id="cat" />
                </div>
              </div>
              <div className="q">
                <div className="qhead">
                  <label className="qlabel" htmlFor="prodsearch">2 · Which one?</label>
                  <span className="qcount" id="prodcount" />
                </div>
                <input className="txt" id="prodsearch" placeholder="Search name, code or wattage" autoComplete="off" />
                <div className="cards" id="prodcards" />
              </div>
              <div className="q">
                <label className="qlabel">3 · How many?</label>
                <div className="chips" id="qtychips" />
              </div>
              <div className="q" id="arrq">
                <label className="qlabel" htmlFor="arr">4 · Which way do they run?</label>
                <div className="selwrap">
                  <select className="sel" id="arr">
                    <option value="row">Across →</option>
                    <option value="col">Up and down ↓</option>
                    <option value="line">Along a line I drag</option>
                  </select>
                </div>
              </div>
              <button type="button" className="act go" id="btn-place">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
                </svg>
                <span id="placelabel">Put them on the plan</span>
              </button>
              <p className="step-lead" style={{marginTop:'8px'}}>Press the green button, then click the plan.</p>
              <details className="moreinfo" id="place-more">
                <summary>More information</summary>
                <div className="moreinfo-body">
                  <div className="hint" id="cathint" />
                  <details className="whyd">
                    <summary>Why this spacing</summary>
                    <div className="teach" id="teach-place" style={{marginTop:'6px'}} />
                  </details>
                </div>
              </details>
            </div>
          </section>
          {/* STEP 5 */}
          <section className="step" data-step="5">
            <button type="button" className="step-head">
              <span className="step-n">05</span>
              <span className="step-t">Get your list</span>
              <span className="step-state" id="st5">$0</span>
              <i className="chev" />
            </button>
            <div className="step-body">
              <p className="step-lead">Everything on the plan, with prices. Print it, or send it to Greenhse.</p>
              <div id="bomwrap" />
              <div className="row2" style={{marginTop:'16px'}}>
                <button type="button" className="act ghost sm" id="btn-copy">Copy list</button>
                {' '}
                <button type="button" className="act pri sm" id="btn-enq">Send to Greenhse</button>
              </div>
            </div>
          </section>
          <details className="disc discd">
            <summary>
              <b>Indicative only.</b>
              {' '}Your electrician verifies everything on site.
            </summary>
            <p>Quantities and spacings come from standard rules of thumb applied to the dimensions you entered, and prices are the catalogue price excluding GST. Every layout must be verified on site by your licensed electrician before ordering or installation, including measurements, ceiling access, joist and truss positions, IP ratings for wet areas and circuit loads.</p>
          </details>
        </aside>
        {/* ================= STAGE ================= */}
        <main className="stage">
          <div className="tools">
            <span className="tgrp" id="grp-view">
              <button type="button" className="tool big" id="t-zoomout" title="Zoom out (−)">−</button>
              {' '}
              <button type="button" className="zoomv" id="zoomv" title="Back to 100%">100%</button>
              {' '}
              <button type="button" className="tool big" id="t-zoomin" title="Zoom in (+)">+</button>
              {' '}
              <button type="button" className="tool" id="t-fit" title="Fit the whole plan on screen (0)">
                <svg viewBox="0 0 24 24">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
                Fit plan
              </button>
              {' '}
              <button type="button" className="tool" id="t-grid" title="Overlay a layout grid — half-metre lines, heavier on the metre">Grid</button>
            </span>
            {' '}
            <span className="tgrp" id="grp-show">
              <span className="tsep" />
              {' '}
              <button type="button" className="tool on" id="t-beams" title="Show the light pool each fitting throws">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Light pools
              </button>
              {' '}
              <button type="button" className="tool" id="t-labels" title="Show fitting labels">Labels</button>
            </span>
            {' '}
            <span className="tgrp" id="grp-edit">
              <span className="tsep" />
              {' '}
              <button type="button" className="tool" id="t-undo" title="Undo (Ctrl+Z)">
                <svg viewBox="0 0 24 24">
                  <path d="M3 10h11a5 5 0 0 1 0 10H8" />
                  <path d="M3 10l5-5M3 10l5 5" />
                </svg>
                Undo
              </button>
              {' '}
              <button type="button" className="tool" id="t-del" title="Delete selected (Del)">
                <svg viewBox="0 0 24 24">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
                Delete
              </button>
              {' '}
              <button type="button" className="tool" id="t-rotl" title="Turn the selected outdoor wall light anticlockwise 15° ( [ )">
                <svg viewBox="0 0 24 24">
                  <path d="M4 12a8 8 0 1 1 2.3 5.7" />
                  <path d="M4 7v5h5" />
                </svg>
                Turn left
              </button>
              {' '}
              <button type="button" className="tool" id="t-rotr" title="Turn the selected outdoor wall light clockwise 15° ( ] )">
                <svg viewBox="0 0 24 24">
                  <path d="M20 12a8 8 0 1 0-2.3 5.7" />
                  <path d="M20 7v5h-5" />
                </svg>
                Turn right
              </button>
              {' '}
              <button type="button" className="tool" id="t-aimreset" title="Point it away from the nearest wall again">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3v18M3 12h18" />
                </svg>
                Auto aim
              </button>
              {' '}
              <button type="button" className="tool" id="t-group" title="Group the selected fittings so they move as one — made for star-light runs between walls">
                <svg viewBox="0 0 24 24">
                  <circle cx="6" cy="12" r="2.4" />
                  <circle cx="12" cy="12" r="2.4" />
                  <circle cx="18" cy="12" r="2.4" />
                  <path d="M6 12h12" strokeDasharray="2 2" />
                </svg>
                Group
              </button>
              {' '}
              <button type="button" className="tool" id="t-ungroup" title="Ungroup — each fitting moves on its own again">
                <svg viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2.4" />
                  <circle cx="12" cy="7" r="2.4" />
                  <circle cx="19" cy="14" r="2.4" />
                </svg>
                Ungroup
              </button>
              {' '}
              <button type="button" className="tool" id="t-clear" title="Remove every fitting">Clear all</button>
            </span>
            {' '}
            <span className="tool" id="toolhint" style={{cursor:'default',color:'#8e9184'}}>Load a floor plan in step 01 to start marking up</span>
            {' '}
            <span className="readout" id="readout" />
            {' '}
            <button type="button" className="tool help" id="t-help" title="How to move around the plan (?)">? Help</button>
          </div>
          <div className="armed" id="armed" hidden>
            <span className="dotpulse" />
            {' '}
            <span id="armedmsg" />
            {' '}
            <button type="button" className="armed-x" id="armed-cancel">Cancel (Esc)</button>
          </div>
          <div className="canvas" id="canvas">
            <aside className="howto" id="howto" hidden>
              <button type="button" className="hx" id="howto-x" aria-label="Close">×</button>
              <h5 id="howto-t" />
              <p id="howto-b" />
              <ol id="howto-l" />
              <button type="button" className="act go sm howto-done" id="howto-done">Done</button>
            </aside>
            <div className="planhint" id="planhint" hidden>
              <div className="planhint-card">
                <svg viewBox="0 0 64 24" aria-hidden="true">
                  <path d="M4 12h56M4 12l7-6M4 12l7 6M60 12l-7-6M60 12l-7 6" />
                </svg>
                {' '}
                <b id="planhint-t">Drag across it on the plan</b>
                {' '}
                <span id="planhint-s">Click and hold, drag, then let go</span>
              </div>
            </div>
            <div className="sheet" id="sheet">
              <div className="blank" id="blank" />
              <img id="planimg" alt="Floor plan" hidden />
              {' '}
              <svg id="ov" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <g id="g-grid" />
                <g id="g-rooms" />
                <g id="g-pools" />
                <g id="g-fx" />
                <g id="g-guide" />
              </svg>
            </div>
            <div className="fxlegend" id="fxlegend" hidden />
            <div className="navhint" id="navhint" hidden>
              <span>
                <b>Drag the plan to move it.</b>
                {' '}Use the − and + buttons above to zoom in and out, and{' '}
                <b>Fit plan</b>
                {' '}whenever you want to see the whole thing again.
              </span>
              {' '}
              <button type="button" id="navhint-x" aria-label="Hide this tip">×</button>
            </div>
            <div className="blankstate" id="blankstate">
              <div className="blankcard">
                <div className="kicker">Greenhse layout planner</div>
                <h2>Plan the lighting for your build in about five minutes.</h2>
                <p>Load your floor plan, tell us what each room is, and drop fittings straight onto it. You get a marked-up plan and a costed light schedule you can hand to your electrician.</p>
                <ol>
                  <li>
                    <b>Load the plan</b>
                    {' '}— PNG, JPG or PDF.
                  </li>
                  <li>
                    <b>Set the scale</b>
                    {' '}by tracing one known length.
                  </li>
                  <li>
                    <b>Box in a room</b>
                    {' '}and pick what it is.
                  </li>
                  <li>
                    <b>Drop lights</b>
                    , or let the app fill the room for you.
                  </li>
                </ol>
                <button type="button" className="act pri" id="btn-start">Load a floor plan</button>
                <div className="hint" style={{textAlign:'center',marginTop:'12px'}}>
                  You can also drag a file straight onto this page, or{' '}
                  <button type="button" id="btn-start-demo" style={{color:'var(--eco-bright)',fontWeight:'600',textDecoration:'underline'}}>try the sample plan</button>
                  .
                </div>
              </div>
            </div>
          </div>
          <div id="printout" />
        </main>
      </div>
      <div className="toastwrap" id="toasts" />
      <input type="file" id="loadfile" accept=".ghlayout,application/json" hidden />
      <div className="modal" id="modal">
        <div className="box">
          <h3 id="mtitle" />
          <div id="mbody" />
          <div className="foot">
            <button type="button" className="act pri" id="mclose">Close</button>
          </div>
        </div>
      </div>
      <div id="qa" />
      {/* ================= HOME ================= */}
      <div className="screen on" id="home">
        <div className="home-nav">
          <span className="brand">
            <b>GREENHSE</b>
            <span>Layout planner</span>
          </span>
          {' '}
          <span className="sp" />
          {' '}
          <button type="button" className="linkbtn" id="home-skip">Skip to the planner →</button>
        </div>
        <div className="home-wrap">
          <div className="home-hero">
            <div>
              <div className="kicker">Perth · LED lighting & smart home</div>
              <h1>
                Plan your lighting{' '}
                <em>before</em>
                {' '}anyone drills a hole.
              </h1>
              <p className="lead">Load your floor plan, learn the four rules a good sparky already knows, and drop real Greenhse fittings room by room. You walk away with a marked-up plan and a costed light schedule.</p>
              <div className="home-cta">
                <button type="button" className="act go" id="home-guide">Take the 60-second guide</button>
                {' '}
                <button type="button" className="act ghost" id="home-plan">Go straight to the planner</button>
              </div>
              <div className="home-points">
                <div>
                  <b>01</b>
                  <p>
                    <i>Place lights like a pro.</i>
                    {' '}Spacing, wall distance and beam angle, explained in plain English.
                  </p>
                </div>
                <div>
                  <b>02</b>
                  <p>
                    <i>Work in real metres.</i>
                    {' '}Trace one known length and every fitting sizes and spaces itself properly.
                  </p>
                </div>
                <div>
                  <b>03</b>
                  <p>
                    <i>Get a costed schedule.</i>
                    {' '}Live pricing, ex and inc GST, ready for your electrician.
                  </p>
                </div>
              </div>
            </div>
            <figure className="home-fig">
              <img id="img-hero" alt="Open dining and family room lit by six downlights on an even grid" />
              <figcaption>Six downlights on an even grid — what the planner lays out for you.</figcaption>
            </figure>
          </div>
          <div className="home-how">
            <h2>How the planner works</h2>
            <div className="how-grid">
              <div>
                <b>Step 01</b>
                <h3>Load the plan</h3>
                <p>PNG, JPG or PDF. A photo of a printed plan is fine.</p>
              </div>
              <div>
                <b>Step 02</b>
                <h3>Set the scale</h3>
                <p>Trace one length you know. Everything after that is real metres.</p>
              </div>
              <div>
                <b>Step 03</b>
                <h3>Mark up rooms</h3>
                <p>Box each room and say what it is. We work out what it needs.</p>
              </div>
              <div>
                <b>Step 04</b>
                <h3>Drop the lights</h3>
                <p>Pick a fitting, choose how many, click. Schedule builds itself.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="home-foot">
          <b>Indicative only.</b>
          {' '}The planner applies standard lighting rules of thumb to the dimensions you enter and prices at catalogue rates excluding GST. Every layout must be verified on site by your licensed electrician before ordering or installation. Questions:{' '}
          <b>(08) 9297 2969</b>
          .
        </div>
      </div>
      {/* ================= GUIDED TOUR ================= */}
      <div className="screen" id="tut">
        <div className="tut-head">
          <span className="brand">
            <b>GREENHSE</b>
            <span>Lighting guide</span>
          </span>
          {' '}
          <span className="ticks" id="ticks" />
          {' '}
          <span className="tut-step">
            Step{' '}
            <b id="tut-n">1</b>
            {' '}of{' '}
            <b id="tut-of">6</b>
          </span>
          {' '}
          <button type="button" className="hbtn" id="tut-skip" style={{borderColor:'var(--line-soft)',color:'var(--ink)'}}>Skip</button>
        </div>
        <div className="tut-body">
          <div className="tut-grid" id="tut-grid" />
        </div>
        <div className="tut-foot">
          <button type="button" className="act ghost" id="tut-back">← Back</button>
          {' '}
          <span className="count" id="tut-count" />
          {' '}
          <button type="button" className="act go" id="tut-next">Next →</button>
        </div>
      </div>
      {/* ================= SEND TO GREENHSE ================= */}
      <div className="modal" id="sendmodal">
        <div className="box">
          <h3>Send this layout to Greenhse</h3>
          <p>We'll get back to you with a quote. Your plan image and light schedule go with it.</p>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="s-name">Name</label>
              <input id="s-name" autoComplete="name" />
            </div>
            <div className="form-row">
              <label htmlFor="s-phone">Phone</label>
              <input id="s-phone" autoComplete="tel" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="s-email">Email</label>
              <input id="s-email" type="email" autoComplete="email" />
            </div>
            <div className="form-row">
              <label htmlFor="s-suburb">Suburb</label>
              <input id="s-suburb" />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="s-type">Job type</label>
            <div className="selwrap">
              <select className="sel" id="s-type">
                <option>New build</option>
                <option>Renovation</option>
                <option>Extension</option>
                <option>Commercial</option>
                <option>Not sure yet</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="s-notes">Anything we should know</label>
            <textarea id="s-notes" rows="3" />
          </div>
          <div id="s-status" />
          <div className="foot">
            <button type="button" className="act pri" id="s-send">Send layout</button>
            {' '}
            <button type="button" className="act ghost" id="s-cancel">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
