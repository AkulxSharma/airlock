#!/usr/bin/env python3
"""Version 4 of the Airlock demo video. Same story as v3, tighter:
 - the narration lines run back to back (about 0.35s apart), and every scene is as long as the line it carries;
 - no silent, empty stretches: the title overlaps the first line, the walkthrough keeps only the moments with action;
 - the iMessage scene has a grey Airlock reply between the two blue bubbles;
 - the arrows and the boxes on the "How Airlock decides" slide are drawn so every text sits inside its box.
Run: python3 build/build_v4.py   (then: npx hyperframes check)"""
import os
import subprocess

BUILD = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(BUILD)  # the project folder, where index.html goes


def t(x):
    return str(round(x, 2))


def narr_len(i):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(HERE, "assets", "narration", i + ".mp3")])
    return round(float(out.decode().strip()) - 0.03, 2)  # a hair under the file, so a slot never exceeds it


DUR = {i: narr_len(i) for i in ["n1", "n2", "n3", "d1", "d2", "d3", "d4", "d5"]}
GAP = 0.35

# ---- the narration chain, then the scenes that carry each line ----
N = {}
N["n1"] = 0.7
N["n2"] = N["n1"] + DUR["n1"] + GAP
N["n3"] = N["n2"] + DUR["n2"] + GAP
EX0 = N["n2"]
W1_0 = N["n3"] + DUR["n3"] + GAP  # the explainer ends, the walkthrough starts
EXD = W1_0 - EX0
N["d1"] = W1_0
W1_1 = W1_0 + DUR["d1"] + GAP
W2_0, W2_1 = W1_1, W1_1 + 10.0
N["d2"] = W2_0 + 0.3
W3_0, W3_1 = W2_1, W2_1 + 4.1
N["d3"] = W3_0 + 0.2
W4_0, W4_1 = W3_1, W3_1 + 8.2
N["d4"] = W4_0 + 0.2
RU0 = W4_1
N["d5"] = RU0 + 0.2
RU1 = RU0 + DUR["d5"] + 0.6
OUT0, OUT1 = RU1, RU1 + 3.0
END = OUT1
TITLE = 2.7
PS0, PS1 = TITLE, EX0

# footage windows inside the walkthrough recording (seconds): only the moments with action
WALK = {"W1": 49.0, "W2": 71.0, "W3": 84.8, "W4": 91.0}

S = []
add = S.append
RISE = '{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }'
POP = '{ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2.2)" }'
FADE = '{ opacity: 1, duration: 0.4, ease: "power2.out" }'
GROW = '{ scaleX: 1, duration: 0.55, ease: "power2.out", transformOrigin: "0 50%" }'


def tween(sel, frm, to, at):
    add(f'tl.fromTo("{sel}", {frm}, {to}, {t(at)});')


def out(sel, at, d=0.25):
    add(f'tl.to("{sel}", {{ opacity: 0, duration: {d}, ease: "power1.in" }}, {t(at)});')


# ---- title (overlaps the first narration line) ----
add('tl.fromTo("#t1", { y: 26 }, { y: 0, duration: 0.5, ease: "power3.out" }, 0);')
tween("#t2", '{ opacity: 0, y: 18 }', RISE, 0.3)
out("#sc0", TITLE - 0.25)

# ---- iMessage: blue bubble, grey Airlock reply, blue bubble, then the website zoomed ----
s = PS0
tween("#phLabel", '{ opacity: 0 }', FADE, s + 0.05)
tween("#bub", '{ opacity: 0, scale: 0.3 }', POP, s + 0.1)
tween("#bubA", '{ opacity: 0, scale: 0.3 }', POP, s + 1.0)
tween("#bub2", '{ opacity: 0, scale: 0.3 }', POP, s + 2.1)
tween("#deliv", '{ opacity: 0, y: 8 }', RISE, s + 2.8)
tween("#pulse", '{ opacity: 0, x: 0 }', '{ opacity: 1, x: 0, duration: 0.15 }', s + 3.0)
add(f'tl.to("#pulse", {{ x: 360, duration: 0.7, ease: "power2.inOut" }}, {t(s + 3.15)});')
out("#pulse", s + 3.8, 0.15)
tween("#siteLabel", '{ opacity: 0 }', FADE, s + 3.6)
tween("#zoomFrame", '{ opacity: 0 }', '{ opacity: 1, duration: 0.5, ease: "power2.out" }', s + 3.6)
add(f'tl.fromTo("#siZ", {{ opacity: 0, scale: 0.97 }}, {{ opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }}, {t(s + 3.6)});')
tween("#zoomNote", '{ opacity: 0, y: 10 }', RISE, s + 4.6)
out("#scPS", PS1 - 0.25)

# ---- explainer, part 1 (the line n2) ----
e = EX0
tween("#ex1", '{ opacity: 0, y: 24 }', RISE, e + 0.4)
add(f'tl.fromTo("#exL1", {{ scaleX: 0 }}, {GROW}, {t(e + 1.2)});')
tween("#ex2", '{ opacity: 0, y: 24 }', RISE, e + 1.8)
add(f'tl.fromTo("#exL2", {{ scaleX: 0 }}, {GROW}, {t(e + 2.9)});')
tween("#ex3", '{ opacity: 0, y: 24 }', RISE, e + 3.5)
tween("#exCap1", '{ opacity: 0, y: 14 }', RISE, e + 0.8)
out("#exCap1", e + 6.4)
tween("#exCap2", '{ opacity: 0, y: 14 }', RISE, e + 6.8)
tween("#exQ", '{ opacity: 0, scale: 0.2 }', POP, e + 7.2)
add(f'tl.to("#exQ", {{ scale: 1.18, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut" }}, {t(e + 8.0)});')
out("#exCap2", e + 11.4)
tween("#exCap3", '{ opacity: 0, y: 14 }', RISE, e + 11.8)
tween("#exShield", '{ opacity: 0, y: -50 }', '{ opacity: 1, y: 0, duration: 0.7, ease: "bounce.out" }', e + 11.9)
tween("#exShieldLine", '{ opacity: 0 }', FADE, e + 12.8)
add(f'tl.set("#exQ", {{ opacity: 0 }}, {t(e + 14.0)});')
tween("#exOk", '{ opacity: 0, scale: 0.3 }', POP, e + 14.0)
add(f'tl.to("#exOk", {{ scale: 1.12, duration: 0.6, yoyo: true, repeat: 4, ease: "sine.inOut" }}, {t(e + 14.8)});')
add(f'tl.to("#exShield", {{ y: -8, duration: 0.9, yoyo: true, repeat: 3, ease: "sine.inOut" }}, {t(e + 14.8)});')
out("#exPart1", e + DUR["n2"] + GAP - 0.4)

# ---- explainer, part 2 (the line n3) ----
p = N["n3"]
tween("#hd", '{ opacity: 0, y: 20 }', RISE, p - 0.1)
tween("#chipB", '{ opacity: 0, x: -50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 0.5)
tween("#chipS", '{ opacity: 0, x: -50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 1.6)
add(f'tl.fromTo("#arr1", {{ scaleX: 0 }}, {GROW}, {t(p + 2.6)});')
tween("#score", '{ opacity: 0, scale: 0.9 }', '{ opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }', p + 3.1)
add(f'tl.fromTo("#bar", {{ width: "0%" }}, {{ width: "60%", duration: 1.8, ease: "power2.out" }}, {t(p + 3.9)});')
tween("#sc60", '{ opacity: 0 }', FADE, p + 4.1)
tween("#scHigh", '{ opacity: 0, scale: 0.4 }', POP, p + 5.8)
add(f'tl.fromTo("#arr2", {{ scaleX: 0 }}, {GROW}, {t(p + 6.7)});')
tween("#gateRef", '{ opacity: 0, x: 50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 7.4)
tween("#gateYes", '{ opacity: 0, x: 50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 9.0)
tween("#gateNote", '{ opacity: 0, y: 14 }', RISE, p + 10.8)
out("#scEX", W1_0 - 0.25)

# ---- walkthrough windows: chapter tags over the footage ----
for sel, start, end in (("#tagW1", W1_0 + 4.0, W1_1 - 0.3), ("#tagW2", W2_0 + 0.4, W2_1 - 0.3), ("#tagW3", W3_0 + 0.2, W3_1 - 0.3), ("#tagW4", W4_0 + 0.2, W4_1 - 0.3)):
    tween(sel, '{ opacity: 0, y: -12 }', RISE, start)
    out(sel, end, 0.2)
tween("#walkFrame", '{ opacity: 0, y: 24 }', '{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }', W1_0)
out("#scWalk", W4_1 - 0.25)

# ---- the rules ----
r = RU0
tween("#ruTitle", '{ opacity: 0, y: 20 }', RISE, r + 0.2)
for i, d in ((1, 0.8), (2, 2.4), (3, 4.0)):
    tween(f"#rc{i}", '{ opacity: 0, scale: 0.6, y: 40 }', '{ opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.8)" }', r + d)
tween("#ruNote", '{ opacity: 0, y: 14 }', RISE, r + 5.8)
out("#scRU", RU1 - 0.25)

# ---- outro ----
o = OUT0
tween("#o1", '{ opacity: 0, y: 16 }', '{ opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }', o)
tween("#o2", '{ opacity: 0, y: 22 }', RISE, o + 0.12)
add(f'tl.to("#o3", {{ opacity: 1, duration: 0.35 }}, {t(o + 0.3)});')
add(f'tl.to("#o4", {{ opacity: 1, duration: 0.35 }}, {t(o + 0.4)});')

TIMELINE = "\n      ".join(S)
AUDIO = "\n      ".join(f'<audio id="nar_{i}" data-start="{t(N[i])}" data-duration="{t(DUR[i])}" data-track-index="7" data-volume="1" src="assets/narration/{i}.mp3"></audio>' for i in N)
SFX_ITEMS = [
    (PS0 + 0.1, 0.18, 0.6, "impactSoft_medium_001.ogg"),
    (PS0 + 1.0, 0.18, 0.5, "impactSoft_medium_001.ogg"),
    (PS0 + 2.1, 0.18, 0.6, "impactSoft_medium_001.ogg"),
    (PS0 + 3.6, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (EX0 + 11.9, 0.18, 0.5, "impactSoft_medium_001.ogg"),
    (EX0 + 14.0, 1.5, 0.35, "impactBell_heavy_000.ogg"),
    (p + 5.8, 0.18, 0.5, "impactSoft_medium_001.ogg"),
    (RU0 + 0.8, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (RU0 + 2.4, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (RU0 + 4.0, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (OUT0, 1.5, 0.35, "impactBell_heavy_000.ogg"),
]
SFX = "\n      ".join(f'<audio id="sfx_{k}" data-start="{t(at)}" data-duration="{d}" data-track-index="6" data-volume="{v}" src="assets/sfx/{f}"></audio>' for k, (at, d, v, f) in enumerate(SFX_ITEMS))

HTML = open(os.path.join(BUILD, "v4_template.html")).read()
for key, val in {
    "@@TIMELINE@@": TIMELINE, "@@AUDIO@@": AUDIO, "@@SFX@@": SFX, "@@END@@": t(END), "@@TITLE@@": t(TITLE),
    "@@PS0@@": t(PS0), "@@PSD@@": t(PS1 - PS0),
    "@@EX0@@": t(EX0), "@@EXD@@": t(EXD),
    "@@W0@@": t(W1_0), "@@WD@@": t(W4_1 - W1_0),
    "@@RU0@@": t(RU0), "@@RUD@@": t(RU1 - RU0),
    "@@OUT0@@": t(OUT0), "@@OUTD@@": t(OUT1 - OUT0),
    "@@SITEB_START@@": t(PS0 + 3.6), "@@SITEB_DUR@@": t(PS1 - (PS0 + 3.6)),
    "@@W1S@@": t(W1_0), "@@W1D@@": t(W1_1 - W1_0), "@@W1M@@": t(WALK["W1"]),
    "@@W2S@@": t(W2_0), "@@W2D@@": t(W2_1 - W2_0), "@@W2M@@": t(WALK["W2"]),
    "@@W3S@@": t(W3_0), "@@W3D@@": t(W3_1 - W3_0), "@@W3M@@": t(WALK["W3"]),
    "@@W4S@@": t(W4_0), "@@W4D@@": t(W4_1 - W4_0), "@@W4M@@": t(WALK["W4"]),
    "@@MUSICD@@": t(END),
}.items():
    HTML = HTML.replace(key, val)
open(os.path.join(HERE, "index.html"), "w").write(HTML)
print("total seconds:", t(END), "| narration starts:", {k: t(v) for k, v in N.items()})
