'use client';
/* Greenhse Layout submissions — the staff review page, as a React component.
   Same shape as LayoutPlanner: the markup is JSX, the page's script is an ES
   module mounted after the shell is in the DOM, and everything it hangs on
   window/document is removed on unmount (engine/lifecycle.js). It is a
   normal scrolling page, so the container is not pinned like the planner's. */
import * as React from 'react';
import './admin.css';

export default function LayoutAdmin() {
  React.useEffect(() => {
    let alive = true, rec = null, lifecycle = null;
    (async () => {
      lifecycle = await import('../engine/lifecycle');
      if (!alive) return;
      rec = lifecycle.begin();
      const admin = await import('./admin');
      if (!alive) { lifecycle.end(rec); rec = null; return; }
      admin.mountAdmin();
      lifecycle.settle(rec);
    })();
    return () => { alive = false; if (rec && lifecycle) lifecycle.end(rec); };
  }, []);
  return (
    <div className="gh-admin">
      <header>
        <h1>Layout submissions</h1>
        <span className="sub">Customer plans sent from the layout app</span>
        {' '}
        <span className="grow" />
        {' '}
        <button className="btn" id="refresh" hidden>Refresh</button>
        {' '}
        <button className="btn" id="signout" hidden>Sign out</button>
      </header>
      <main>
        <div id="gate">
          <h2>Staff access</h2>
          <p>Enter the admin key to view submitted layouts.</p>
          <input id="key" type="password" placeholder="Admin key" autoComplete="off" />
          {' '}
          <button className="btn pri" id="enter" style={{width:'100%'}}>View submissions</button>
          <div className="err" id="gate-err" />
        </div>
        <div id="app" hidden>
          <div id="usage" hidden>
            <div className="tiles">
              <div className="tile">
                <b id="u-vis">–</b>
                <span>visitors · 7 days</span>
              </div>
              <div className="tile">
                <b id="u-sess">–</b>
                <span>sessions · 7 days</span>
              </div>
              <div className="tile">
                <b id="u-sent">–</b>
                <span>plans sent · 7 days</span>
              </div>
              <div className="tile">
                <b id="u-pdf">–</b>
                <span>PDFs saved · 7 days</span>
              </div>
            </div>
            <details>
              <summary>Daily breakdown and recent sessions</summary>
              <table id="u-days" />
              <table id="u-recent" />
            </details>
          </div>
          <div className="note">
            <b>Green outline</b>
            {' '}= completed — the customer hit Send.{' '}
            <b>Amber dashed</b>
            {' '}= in progress — a plan being worked on right now; it updates as they go, no contact details yet, and disappears when they Send (or after 14 quiet days).{' '}
            <b>Open in planner</b>
            {' '}loads any card into the layout app to check and edit.
          </div>
          <div id="loading">Loading…</div>
          <div id="empty" hidden>No submissions yet. They appear here the moment a customer hits Send in the planner.</div>
          <div id="list" />
        </div>
      </main>
      <div id="modal">
        <div className="box" id="modal-box" />
      </div>
      {/* Netlify Forms declaration. Never shown; it exists so Netlify detects the
     "plan-submission" form at deploy time. The submit-layout function posts a
     submission to it whenever a customer sends a plan, and Netlify's email
     notification (Forms -> plan-submission -> Notifications) does the rest. */}
      <form name="plan-submission" data-netlify="true" hidden>
        <input name="name" />
        <input name="email" />
        <input name="phone" />
        <input name="suburb" />
        {' '}
        <input name="project" />
        <input name="fittings" />
        <input name="total_inc_gst" />
        {' '}
        <input name="view_in_admin" />
        <input name="open_in_planner" />
      </form>
    </div>
  );
}
