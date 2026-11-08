#!/usr/bin/env python3
"""Generates index.html for the Airlock demo reel. Cut points snap to the music's beat grid.
Run: python3 build.py   (then: npx hyperframes check)"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
BEATS = json.load(open(os.path.join(HERE, "beats12.json")))  # beat times (s) of the bundled track


def snap(t):
    return min(BEATS, key=lambda b: abs(b - t))


def r(x):
    return round(x, 2)


# ---- cut points (all snapped to beats): title, side by side, the narrated walkthrough, outro ----
WALK_START = 9.6  # the narration starts at 11.0s in the recording; the first seconds are an idle home page
WALK_LEN = 102.2 - WALK_START
t_title = snap(3.0)
a0 = t_title
a1 = snap(a0 + 5.2)
b1 = snap(a1 + 7.0)
c1 = snap(b1 + 6.0)  # end of the iMessage / website scene
w1 = c1 + WALK_LEN  # the walkthrough keeps its own length, it carries the narration
end = w1 + 3.0  # the beat list ends before this point, so no snapping
u1 = w1

# media offsets inside the recordings (seconds), set from watching the footage
PHONE = {"A": 14.4, "B": 28.4, "C": 36.0}
SITE = {"A": 16.6, "B": 30.6, "C": 38.2}


def vid(id, start, dur, ms, src, audio=False, track=1):
    a = ' data-has-audio="true"' if audio else ""
    m = "" if audio else " muted"
    return f'<video id="{id}" class="clip vid" data-start="{r(start)}" data-duration="{r(dur)}" data-media-start="{ms}"{a} data-track-index="{track}" src="assets/media/{src}"{m} playsinline></video>'


videos = [
    vid("phA", a0, a1 - a0, PHONE["A"], "phone.mp4", True),
    vid("siA", a0, a1 - a0, SITE["A"], "site.mp4", False, 2),
    vid("phB", a1, b1 - a1, PHONE["B"], "phone.mp4", True),
    vid("siB", a1, b1 - a1, SITE["B"], "site.mp4", False, 2),
    vid("phC", b1, c1 - b1, PHONE["C"], "phone.mp4", True),
    vid("siC", b1, c1 - b1, SITE["C"], "site.mp4", False, 2),
    vid("wk", c1, WALK_LEN, WALK_START, "walk.mp4", True, 3),
]

html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,500;1,500&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root {{ --ink: #1a1a1a; --paper: #f5f3ef; --muted: #b9b5ae; --line: #3a3a3a; --low: #4ade80; --medium: #fbbf24; --high: #f87171;
        --font-display: "Playfair Display", Georgia, serif; --font-body: "Geist", system-ui, sans-serif; --font-mono: "Geist Mono", ui-monospace, monospace; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: var(--ink); }}
      #root {{ position: relative; width: 1920px; height: 1080px; background: var(--ink); color: var(--paper); font-family: var(--font-body); }}
      .scene {{ position: absolute; inset: 0; width: 1920px; height: 1080px; }}
      .abs {{ position: absolute; }}
      .center {{ position: absolute; left: 0; right: 0; text-align: center; }}
      .vid {{ position: absolute; object-fit: cover; }}
      .frame {{ position: absolute; overflow: hidden; border: 3px solid var(--line); background: #000; }}
      .label {{ font-family: var(--font-mono); font-size: 30px; letter-spacing: 0.14em; color: var(--paper); }}
      .desc {{ font-size: 30px; color: var(--muted); line-height: 1.25; }}
      .cap {{ font-family: var(--font-display); font-size: 46px; line-height: 1.15; opacity: 0; }}
      .cap b {{ font-family: var(--font-mono); font-weight: 500; font-size: 40px; color: var(--paper); }}
      .tag {{ font-family: var(--font-mono); font-size: 40px; letter-spacing: 0.12em; }}

      #t0 {{ top: 250px; font-family: var(--font-mono); font-size: 30px; letter-spacing: 0.3em; color: var(--muted); }}
      #t1 {{ top: 360px; font-family: var(--font-display); font-style: italic; font-size: 150px; line-height: 1.05; }}
      #t2 {{ top: 560px; font-size: 48px; color: var(--muted); opacity: 0; }}

      #lblPhone {{ left: 90px; top: 62px; }} #dscPhone {{ left: 90px; top: 108px; width: 420px; }}
      #lblSite {{ left: 600px; top: 62px; }} #dscSite {{ left: 600px; top: 108px; width: 1200px; }}
      #phoneFrame {{ left: 90px; top: 170px; width: 396px; height: 860px; border-radius: 44px; }}
      #siteFrame {{ left: 560px; top: 250px; width: 1286px; height: 700px; border-radius: 22px; }}
      .capS {{ left: 560px; width: 1286px; top: 972px; }}

      #walkFrame {{ left: 160px; top: 38px; width: 1600px; height: 1004px; border-radius: 22px; }}
      .capW {{ left: 210px; width: 1500px; top: 985px; }}
      .tagL {{ left: 210px; top: 62px; }} .tagR {{ left: 210px; width: 1500px; top: 70px; text-align: right; font-family: var(--font-mono); font-size: 34px; color: var(--muted); }}

      .hTitle {{ left: 160px; top: 110px; font-family: var(--font-display); font-style: italic; font-size: 96px; }}
      .node {{ position: absolute; top: 330px; width: 300px; height: 300px; border: 3px solid var(--line); border-radius: 28px; padding: 30px 26px; opacity: 0; background: #202020; }}
      .node .n {{ font-family: var(--font-mono); font-size: 30px; color: var(--muted); }}
      .node .h {{ font-family: var(--font-display); font-size: 60px; margin-top: 14px; line-height: 1.05; }}
      .node .s {{ font-size: 32px; color: var(--muted); margin-top: 14px; line-height: 1.2; }}
      .arrow {{ position: absolute; top: 450px; font-size: 56px; color: var(--muted); opacity: 0; }}
      #hLine {{ top: 760px; font-family: var(--font-display); font-size: 62px; line-height: 1.15; opacity: 0; padding: 0 140px; }}

      .rule {{ position: absolute; left: 160px; width: 1600px; font-family: var(--font-display); font-size: 70px; line-height: 1.12; opacity: 0; }}
      .rule i {{ font-family: var(--font-mono); font-style: normal; font-size: 44px; letter-spacing: 0.1em; margin-right: 26px; }}

      #o1 {{ top: 330px; font-family: var(--font-display); font-style: italic; font-size: 120px; opacity: 0; }}
      #o2 {{ top: 500px; font-family: var(--font-display); font-size: 100px; line-height: 1.12; opacity: 0; }}
      #o3 {{ top: 800px; font-family: var(--font-mono); font-size: 52px; opacity: 0; }}
      #o4 {{ top: 890px; font-size: 34px; color: var(--muted); opacity: 0; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{r(end)}" data-width="1920" data-height="1080">

      <section id="sc0" class="scene clip" data-start="0" data-duration="{r(t_title)}" data-track-index="0">
        <div id="t0" class="center">AIRLOCK</div>
        <div id="t1" class="center">Text it. Watch it land.</div>
        <div id="t2" class="center">iMessage left. Website right. Live.</div>
      </section>

      <section id="scMain" class="scene clip" data-start="{r(a0)}" data-duration="{r(c1 - a0)}" data-track-index="0">
        <div id="lblPhone" class="abs label">IMESSAGE</div>
        <div id="dscPhone" class="abs desc">Your text and Airlock's reply.</div>
        <div id="lblSite" class="abs label">AIRLOCK.INK</div>
        <div id="dscSite" class="abs desc">The same messages, the audit stages and the verdict, as they happen.</div>
        <div id="phoneFrame" class="frame"></div>
        <div id="siteFrame" class="frame"></div>
        <div id="capA" class="abs cap capS">1 &nbsp;Text <b>“Hey Airlock”</b>. It lands on the website.</div>
        <div id="capB" class="abs cap capS">2 &nbsp;<b>“Send 0.00001 to akul.demo”</b>: audited, rated LOW.</div>
        <div id="capC" class="abs cap capS">3 &nbsp;Reply <b>YES</b>: sent, and the site shows it.</div>
      </section>

      <section id="scWalk" class="scene clip" data-start="{r(c1)}" data-duration="{r(w1 - c1)}" data-track-index="0">
        <div id="walkFrame" class="frame"></div>
      </section>

      <section id="sc5" class="scene clip" data-start="{r(u1)}" data-duration="{r(end - u1)}" data-track-index="0">
        <div id="o1" class="center">Airlock</div>
        <div id="o2" class="center">Say it. Airlock checks it.<br />Then it moves.</div>
        <div id="o3" class="center">airlock.ink</div>
        <div id="o4" class="center">Sepolia testnet only. A risk signal, not a guarantee.</div>
      </section>

      {chr(10).join("      " + v for v in videos)}

<audio id="music1" data-start="0" data-duration="{r(c1)}" data-track-index="5" data-volume="0.3" data-fade-in="0.3" data-fade-out="0.6" src="assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3"></audio>
      <audio id="music2" data-start="{r(c1)}" data-duration="{r(end - c1)}" data-media-start="{r(c1)}" data-track-index="5" data-volume="0.09" data-fade-in="0.6" data-fade-out="1.2" src="assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3"></audio>
    </div>

    <script>
      // Place each recording inside its frame (fixed numbers, so it does not depend on layout timing).
      const put = (ids, x, y, w, h, rad) => ids.forEach((id) => {{ const v = document.getElementById(id); v.style.left = (x + 3) + "px"; v.style.top = (y + 3) + "px"; v.style.width = (w - 6) + "px"; v.style.height = (h - 6) + "px"; v.style.borderRadius = (rad - 3) + "px"; }});
      put(["phA", "phB", "phC"], 90, 170, 396, 860, 44);
      put(["siA", "siB", "siC"], 560, 250, 1286, 700, 22);
      put(["wk"], 160, 38, 1600, 1004, 22);

      const tl = gsap.timeline({{ paused: true }});
      const rise = {{ opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }};
      const cap = (id, at, off) => tl.fromTo(id, {{ opacity: 0, y: 14 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }}, at).to(id, {{ opacity: 0, duration: 0.2 }}, off);
      const fadeOut = (id, at) => tl.to(id, {{ opacity: 0, duration: 0.2, ease: "power1.in" }}, at);

      // Title
      tl.fromTo("#t1", {{ y: 26 }}, {{ y: 0, duration: 0.5, ease: "power3.out" }}, 0);
      tl.fromTo("#t2", {{ opacity: 0, y: 18 }}, rise, {r(snap(0.8))});
      fadeOut("#sc0", {r(t_title - 0.2)});

      // iMessage + website, side by side
      tl.fromTo("#phoneFrame, #siteFrame", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }}, {r(a0)});
      tl.fromTo("#lblPhone, #dscPhone, #lblSite, #dscSite", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, {r(a0 + 0.1)});
      cap("#capA", {r(a0 + 0.1)}, {r(a1 - 0.2)});
      cap("#capB", {r(a1 + 0.1)}, {r(b1 - 0.2)});
      cap("#capC", {r(b1 + 0.1)}, {r(c1 - 0.2)});
      fadeOut("#scMain", {r(c1 - 0.2)});

      // Narrated walkthrough
      tl.fromTo("#walkFrame", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }}, {r(c1)});
      fadeOut("#scWalk", {r(w1 - 0.2)});

      // Outro
      tl.fromTo("#o1", {{ opacity: 0, y: 16 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }}, {r(u1)});
      tl.fromTo("#o2", {{ opacity: 0, y: 22 }}, rise, {r(u1 + 0.12)});
      tl.to("#o3", {{ opacity: 1, duration: 0.35 }}, {r(u1 + 0.3)});
      tl.to("#o4", {{ opacity: 1, duration: 0.35 }}, {r(u1 + 0.4)});

      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""
open(os.path.join(HERE, "index.html"), "w").write(html)
print("scenes:", dict(title=t_title, A=(a0, a1), B=(a1, b1), C=(b1, c1), walk=(c1, w1), end=end, total_seconds=r(end)))
