#!/usr/bin/env python3
"""Generates index.html for the Airlock demo video, version 3: narrated by ElevenLabs, animated explainer,
pop-bubble scene that zooms into the website, and the walkthrough footage on the new narration.
Run: python3 build_v3.py  (then: npx hyperframes check)"""
import os

BUILD = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(BUILD)  # the project folder, where index.html goes
import subprocess


def t(x):
    return str(round(x, 2))


# ---- timeline (seconds). Narration lengths: n1 9.5, n2 17.9, n3 15.1, d1 12.3, d2 7.7, d3 3.8, d4 7.8, d5 8.8 ----
TITLE = 3.0
PS0, PS1 = 3.0, 14.0  # pop bubble, then the website zoom
EX0, EX1 = 14.0, 48.4  # animated explainer
W1_0, W1_1 = 48.4, 65.4  # walkthrough: refusal
W2_0, W2_1 = 65.4, 79.4  # walkthrough: approval
W3_0, W3_1 = 79.4, 84.9  # walkthrough: Etherscan
W4_0, W4_1 = 84.9, 95.4  # walkthrough: wallets
RU0, RU1 = 95.4, 105.2  # the rules
OUT0, OUT1 = 105.2, 108.7
END = OUT1

NARR = [("n1", 3.4), ("n2", 14.4), ("n3", 32.9), ("d1", 48.8), ("d2", 66.0), ("d3", 79.8), ("d4", 85.3), ("d5", 95.8)]
def _len(i):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(HERE, "assets", "narration", i + ".mp3")]).decode().strip())


DUR = {i: round(_len(i) - 0.03, 2) for i, _ in NARR}  # a hair under the file length, so the slot never exceeds it

# footage windows inside the recordings
SITE_B = 31.3  # website recording: the akul.demo message arrives about 1s in
WALK = {"W1": 48.0, "W2": 69.5, "W3": 84.5, "W4": 90.5}

S = []  # the script lines
add = S.append


def tween(sel, frm, to, at):
    add(f'tl.fromTo("{sel}", {frm}, {to}, {t(at)});')


RISE = '{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }'
POP = '{ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2.2)" }'
FADE = '{ opacity: 1, duration: 0.4, ease: "power2.out" }'


def out(sel, at, d=0.25):
    add(f'tl.to("{sel}", {{ opacity: 0, duration: {d}, ease: "power1.in" }}, {t(at)});')


# ---- title ----
add('tl.fromTo("#t1", { y: 26 }, { y: 0, duration: 0.5, ease: "power3.out" }, 0);')
tween("#t2", '{ opacity: 0, y: 18 }', RISE, 0.3)
out("#sc0", TITLE - 0.25)

# ---- pop bubble, then the website, zoomed ----
s = PS0
tween("#phLabel", '{ opacity: 0 }', FADE, s + 0.2)
tween("#bub", '{ opacity: 0, scale: 0.3 }', POP, s + 0.5)
tween("#bub2", '{ opacity: 0, scale: 0.3 }', POP, s + 2.2)
tween("#deliv", '{ opacity: 0, y: 8 }', RISE, s + 3.2)
tween("#pulse", '{ opacity: 0, x: 0 }', '{ opacity: 1, x: 0, duration: 0.15 }', s + 3.6)
add(f'tl.to("#pulse", {{ x: 360, duration: 0.8, ease: "power2.inOut" }}, {t(s + 3.75)});')
out("#pulse", s + 4.5, 0.15)
tween("#siteLabel", '{ opacity: 0 }', FADE, s + 4.4)
tween("#zoomFrame", '{ opacity: 0 }', '{ opacity: 1, duration: 0.5, ease: "power2.out" }', s + 4.4)
tween("#zoomNote", '{ opacity: 0, y: 10 }', RISE, s + 5.6)
# the zoom itself: starts tight on the conversation and stages, eases out as the verdict arrives
add(f'tl.fromTo("#siZ", {{ opacity: 0, scale: 0.97 }}, {{ opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }}, {t(s + 4.4)});')
out("#scPS", PS1 - 0.25)

# ---- animated explainer ----
e = EX0
# part 1: agent -> contract -> wallet, the contract may be vulnerable, Airlock checks first
tween("#ex1", '{ opacity: 0, y: 24 }', RISE, e + 0.5)
tween("#exA1", '{ opacity: 0 }', '{ opacity: 1, duration: 0.3 }', e + 1.2)
add(f'tl.fromTo("#exL1", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.6, ease: "power2.out", transformOrigin: "0 50%" }}, {t(e + 1.4)});')
tween("#ex2", '{ opacity: 0, y: 24 }', RISE, e + 2.0)
tween("#exA2", '{ opacity: 0 }', '{ opacity: 1, duration: 0.3 }', e + 3.0)
add(f'tl.fromTo("#exL2", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.6, ease: "power2.out", transformOrigin: "0 50%" }}, {t(e + 3.2)});')
tween("#ex3", '{ opacity: 0, y: 24 }', RISE, e + 3.8)
tween("#exCap1", '{ opacity: 0, y: 14 }', RISE, e + 0.9)
out("#exCap1", e + 6.6)
tween("#exCap2", '{ opacity: 0, y: 14 }', RISE, e + 7.0)
tween("#exQ", '{ opacity: 0, scale: 0.2 }', POP, e + 7.4)
add(f'tl.to("#exQ", {{ scale: 1.18, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut" }}, {t(e + 8.2)});')
out("#exCap2", e + 11.6)
tween("#exCap3", '{ opacity: 0, y: 14 }', RISE, e + 12.0)
tween("#exShield", '{ opacity: 0, y: -50 }', '{ opacity: 1, y: 0, duration: 0.7, ease: "bounce.out" }', e + 12.1)
tween("#exShieldLine", '{ opacity: 0 }', FADE, e + 13.0)
add(f'tl.set("#exQ", {{ opacity: 0 }}, {t(e + 14.3)});')
tween("#exOk", '{ opacity: 0, scale: 0.3 }', POP, e + 14.3)
out("#exPart1", e + 18.0)

# part 2: how Airlock decides
p = 32.9  # n3 starts here
tween("#hd", '{ opacity: 0, y: 20 }', RISE, p - 0.3)
tween("#chipB", '{ opacity: 0, x: -50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 0.6)
tween("#chipS", '{ opacity: 0, x: -50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 1.8)
add(f'tl.fromTo("#arr1", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.5, ease: "power2.out", transformOrigin: "0 50%" }}, {t(p + 2.8)});')
tween("#score", '{ opacity: 0, scale: 0.85 }', '{ opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }', p + 3.2)
add(f'tl.to("#track", {{ opacity: 1, duration: 0.4 }}, {t(p + 3.5)});')
add(f'tl.fromTo("#bar", {{ width: 0 }}, {{ width: 216, duration: 1.8, ease: "power2.out" }}, {t(p + 4.0)});')
tween("#sc60", '{ opacity: 0 }', FADE, p + 4.2)
tween("#scHigh", '{ opacity: 0, scale: 0.4 }', POP, p + 6.0)
add(f'tl.fromTo("#arr2", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.5, ease: "power2.out", transformOrigin: "0 50%" }}, {t(p + 6.9)});')
tween("#gateRef", '{ opacity: 0, x: 50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 7.6)
tween("#gateYes", '{ opacity: 0, x: 50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', p + 9.2)
tween("#gateNote", '{ opacity: 0, y: 14 }', RISE, p + 11.0)
out("#scEX", EX1 - 0.25)

# ---- walkthrough windows: small chapter tags over the footage ----
for sel, start, end in (("#tagW1", W1_0 + 4.0, W1_1 - 0.3), ("#tagW2", W2_0 + 0.4, W2_1 - 0.3), ("#tagW3", W3_0 + 0.2, W3_1 - 0.3), ("#tagW4", W4_0 + 0.2, W4_1 - 0.3)):
    tween(sel, '{ opacity: 0, y: -12 }', RISE, start)
    out(sel, end, 0.2)
tween("#walkFrame", '{ opacity: 0, y: 24 }', '{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }', W1_0)
out("#scWalk", W4_1 - 0.25)

# ---- the rules ----
r = RU0
tween("#ruTitle", '{ opacity: 0, y: 20 }', RISE, r + 0.3)
tween("#rc1", '{ opacity: 0, scale: 0.6, y: 40 }', '{ opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.8)" }', r + 1.0)
tween("#rc2", '{ opacity: 0, scale: 0.6, y: 40 }', '{ opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.8)" }', r + 2.6)
tween("#rc3", '{ opacity: 0, scale: 0.6, y: 40 }', '{ opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.8)" }', r + 4.2)
tween("#ruNote", '{ opacity: 0, y: 14 }', RISE, r + 6.0)
out("#scRU", RU1 - 0.25)

# ---- outro ----
o = OUT0
tween("#o1", '{ opacity: 0, y: 16 }', '{ opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }', o)
tween("#o2", '{ opacity: 0, y: 22 }', RISE, o + 0.12)
add(f'tl.to("#o3", {{ opacity: 1, duration: 0.35 }}, {t(o + 0.4)});')
add(f'tl.to("#o4", {{ opacity: 1, duration: 0.35 }}, {t(o + 0.5)});')

TIMELINE = "\n      ".join(S)

AUDIO = "\n      ".join(
    f'<audio id="nar_{i}" data-start="{t(at)}" data-duration="{t(DUR[i])}" data-track-index="7" data-volume="1" src="assets/narration/{i}.mp3"></audio>'
    for i, at in NARR
)
SFX = "\n      ".join(
    f'<audio id="sfx_{k}" data-start="{t(at)}" data-duration="{d}" data-track-index="6" data-volume="{v}" src="assets/sfx/{f}"></audio>'
    for k, (at, d, v, f) in enumerate(
        [
            (PS0 + 0.5, 0.18, 0.7, "impactSoft_medium_001.ogg"),
            (PS0 + 2.2, 0.18, 0.6, "impactSoft_medium_001.ogg"),
            (PS0 + 4.4, 0.18, 0.4, "impactSoft_medium_001.ogg"),
            (EX0 + 12.1, 0.18, 0.5, "impactSoft_medium_001.ogg"),
            (EX0 + 14.3, 1.5, 0.35, "impactBell_heavy_000.ogg"),
            (32.9 + 6.0, 0.18, 0.5, "impactSoft_medium_001.ogg"),
            (RU0 + 1.0, 0.18, 0.4, "impactSoft_medium_001.ogg"),
            (RU0 + 2.6, 0.18, 0.4, "impactSoft_medium_001.ogg"),
            (RU0 + 4.2, 0.18, 0.4, "impactSoft_medium_001.ogg"),
            (OUT0, 1.5, 0.35, "impactBell_heavy_000.ogg"),
        ]
    )
)

HTML = open(os.path.join(BUILD, "v3_template.html")).read()
for key, val in {
    "@@TIMELINE@@": TIMELINE,
    "@@AUDIO@@": AUDIO,
    "@@SFX@@": SFX,
    "@@END@@": t(END),
    "@@TITLE@@": t(TITLE),
    "@@PS0@@": t(PS0), "@@PSD@@": t(PS1 - PS0),
    "@@EX0@@": t(EX0), "@@EXD@@": t(EX1 - EX0),
    "@@W0@@": t(W1_0), "@@WD@@": t(W4_1 - W1_0),
    "@@RU0@@": t(RU0), "@@RUD@@": t(RU1 - RU0),
    "@@OUT0@@": t(OUT0), "@@OUTD@@": t(OUT1 - OUT0),
    "@@SITEB_START@@": t(PS0 + 4.4), "@@SITEB_DUR@@": t(PS1 - (PS0 + 4.4)),
    "@@W1S@@": t(W1_0), "@@W1D@@": t(W1_1 - W1_0), "@@W1M@@": t(WALK["W1"]),
    "@@W2S@@": t(W2_0), "@@W2D@@": t(W2_1 - W2_0), "@@W2M@@": t(WALK["W2"]),
    "@@W3S@@": t(W3_0), "@@W3D@@": t(W3_1 - W3_0), "@@W3M@@": t(WALK["W3"]),
    "@@W4S@@": t(W4_0), "@@W4D@@": t(W4_1 - W4_0), "@@W4M@@": t(WALK["W4"]),
    "@@MUSICD@@": t(END),
}.items():
    HTML = HTML.replace(key, val)
open(os.path.join(HERE, "index.html"), "w").write(HTML)
print("total seconds:", t(END))
