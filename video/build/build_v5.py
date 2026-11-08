#!/usr/bin/env python3
"""Version 5 of the Airlock demo video. Same as v4, with two fixes: the iMessage bubbles sit on the correct sides (sent on the right, received on the left), and every caption and box on the explainer slides appears when its words are spoken (the times come from a word-level transcript of each narration line).
Version 4 notes, which still hold:
 - the narration lines run back to back (about 0.35s apart), and every scene is as long as the line it carries;
 - no silent, empty stretches: the title overlaps the first line, the walkthrough keeps only the moments with action;
 - the iMessage scene has a grey Airlock reply between the two blue bubbles;
 - the arrows and the boxes on the "How Airlock decides" slide are drawn so every text sits inside its box.
Run: python3 build/build_v5.py   (then: npx hyperframes check)"""
import os
import json
import subprocess

BUILD = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(BUILD)  # the project folder, where index.html goes


def t(x):
    return str(round(x, 2))


def narr_len(i):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(HERE, "assets", "narration", i + ".mp3")])
    return round(float(out.decode().strip()) - 0.03, 2)  # a hair under the file, so a slot never exceeds it



def words_of(line):
    return json.load(open(os.path.join(HERE, "assets", "narration", line + ".words.json")))


def at_word(line, key, nth=1):
    """Seconds, from the start of the narration line, at which the nth spoken word equal to key begins."""
    seen = 0
    for w in words_of(line):
        if w["text"].strip().lower().strip(".,:;!?'\"") == key.lower():
            seen += 1
            if seen == nth:
                return w["start"]
    raise KeyError(f"{key} not in {line}")


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
W2_0 = W1_1
W2_1 = W2_0 + 0.3 + DUR["d2"] + GAP
N["d2"] = W2_0 + 0.3
W3_0 = W2_1
W3_1 = W3_0 + 0.2 + DUR["d3"] + GAP
N["d3"] = W3_0 + 0.2
W4_0 = W3_1
W4_1 = W4_0 + 0.2 + DUR["d4"] + 0.2
N["d4"] = W4_0 + 0.2
RU0 = W4_1
N["d5"] = RU0 + 0.2
RU1 = RU0 + DUR["d5"] + 0.6
OUT0, OUT1 = RU1, RU1 + 3.0
END = OUT1
TITLE = 2.7
PS0, PS1 = TITLE, EX0

# footage windows inside the walkthrough recording (seconds): only the moments with action
WALK = {"W1": 49.0, "W2": 71.0, "W3": 83.7, "W4": 91.0}

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

# ---- iMessage: each bubble pops on the words that describe it (line n1) ----
n = N["n1"]
tween("#phLabel", '{ opacity: 0 }', FADE, PS0 + 0.05)
tween("#bub", '{ opacity: 0, scale: 0.3 }', POP, max(PS0 + 0.1, n + at_word("n1", "imessage") + 0.2))  # "from iMessage": the sent bubble pops (right side)
tween("#deliv", '{ opacity: 0, y: 8 }', RISE, n + at_word("n1", "message") - 0.2)
tween("#pulse", '{ opacity: 0, x: 0 }', '{ opacity: 1, x: 0, duration: 0.15 }', n + at_word("n1", "message") - 0.45)
add(f'tl.to("#pulse", {{ x: 360, duration: 0.5, ease: "power2.inOut" }}, {t(n + at_word("n1", "message") - 0.3)});')
out("#pulse", n + at_word("n1", "message") + 0.2, 0.15)
site = n + at_word("n1", "message") - 0.05  # "Your message pops up live on the website": the website appears
tween("#siteLabel", '{ opacity: 0 }', FADE, site)
tween("#zoomFrame", '{ opacity: 0 }', '{ opacity: 1, duration: 0.5, ease: "power2.out" }', site)
add(f'tl.fromTo("#siZ", {{ opacity: 0, scale: 0.97 }}, {{ opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }}, {t(site)});')
tween("#zoomNote", '{ opacity: 0, y: 10 }', RISE, n + at_word("n1", "audited"))
tween("#bubA", '{ opacity: 0, scale: 0.3 }', POP, n + at_word("n1", "answer"))  # "the answer comes back": Airlock's grey reply (left side)
tween("#bub2", '{ opacity: 0, scale: 0.3 }', POP, n + at_word("n1", "phone") - 0.3)  # "to your phone": the sent "Yes" (right side)
out("#scPS", PS1 - 0.25)
SITE_START = site

# ---- explainer, part 1 (the line n2): each picture appears with its words ----
m = N["n2"]
w2 = lambda k, i=1: m + at_word("n2", k, i)
tween("#exIntroA", '{ opacity: 0, y: 24 }', RISE, m + 0.1)  # "This is Airlock, a firewall..."
tween("#exIntroB", '{ opacity: 0, y: 18 }', RISE, w2("firewall") - 0.1)
out("#exIntroA", w2("when") - 0.2)
out("#exIntroB", w2("when") - 0.2)
tween("#exCap1", '{ opacity: 0, y: 14 }', RISE, w2("when"))  # "When an AI agent sends money..."
out("#exCap1", w2("sometimes") - 0.2)
tween("#ex1", '{ opacity: 0, y: 24 }', RISE, w2("agent", 2) - 0.2)
tween("#ex3", '{ opacity: 0, y: 24 }', RISE, w2("wallet"))
tween("#ex2", '{ opacity: 0, y: 24 }', RISE, w2("smart"))  # "...a smart contract"
add(f'tl.fromTo("#exL1", {{ scaleX: 0 }}, {GROW}, {t(w2("smart") + 0.15)});')
add(f'tl.fromTo("#exL2", {{ scaleX: 0 }}, {GROW}, {t(w2("smart") + 0.45)});')
tween("#exCap2", '{ opacity: 0, y: 14 }', RISE, w2("sometimes"))  # "Sometimes that smart contract is vulnerable"
tween("#exQ", '{ opacity: 0, scale: 0.2 }', POP, w2("vulnerable") - 0.1)
add(f'tl.to("#exQ", {{ scale: 1.18, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut" }}, {t(w2("vulnerable") + 0.5)});')
out("#exCap2", w2("those") - 0.2)
tween("#exCap3", '{ opacity: 0, y: 14 }', RISE, w2("those"))  # "...those vulnerabilities are what we check for"
tween("#exShield", '{ opacity: 0, y: -50 }', '{ opacity: 1, y: 0, duration: 0.7, ease: "bounce.out" }', w2("we"))
tween("#exShieldLine", '{ opacity: 0 }', FADE, w2("we") + 0.6)
add(f'tl.set("#exQ", {{ opacity: 0 }}, {t(w2("check"))});')
tween("#exOk", '{ opacity: 0, scale: 0.3 }', POP, w2("check"))
add(f'tl.to("#exOk", {{ scale: 1.12, duration: 0.6, yoyo: true, repeat: 3, ease: "sine.inOut" }}, {t(w2("check") + 0.7)});')
add(f'tl.to("#exShield", {{ y: -8, duration: 0.9, yoyo: true, repeat: 2, ease: "sine.inOut" }}, {t(w2("check") + 0.7)});')
out("#exPart1", N["n3"] - 0.3)

# ---- explainer, part 2 (the line n3): each box appears on the word that names it ----
p = N["n3"]
w3 = lambda k, i=1: p + at_word("n3", k, i)
tween("#hd", '{ opacity: 0, y: 20 }', RISE, p - 0.1)
tween("#chipB", '{ opacity: 0, x: -50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', w3("bytecode") - 0.3)  # "...the contract's bytecode"
tween("#chipS", '{ opacity: 0, x: -50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', w3("source") - 0.3)  # "...when the source is verified"
add(f'tl.fromTo("#arr1", {{ scaleX: 0 }}, {GROW}, {t(w3("findings"))});')  # "The findings become..."
tween("#score", '{ opacity: 0, scale: 0.9 }', '{ opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }', w3("risk") - 0.2)  # "...a risk score"
add(f'tl.fromTo("#bar", {{ width: "0%" }}, {{ width: "60%", duration: 1.6, ease: "power2.out" }}, {t(w3("score") + 0.1)});')
tween("#sc60", '{ opacity: 0 }', FADE, w3("score") + 0.2)
tween("#scHigh", '{ opacity: 0, scale: 0.4 }', POP, w3("score") + 1.8)
tween("#gateNote", '{ opacity: 0, y: 14 }', RISE, w3("plain"))  # "...and plain code, not the AI, decides"
add(f'tl.fromTo("#arr2", {{ scaleX: 0 }}, {GROW}, {t(w3("decides") - 0.1)});')
tween("#gateRef", '{ opacity: 0, x: 50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', w3("refuse") - 0.1)  # "refuse"
tween("#gateYes", '{ opacity: 0, x: 50 }', '{ opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }', w3("ask") - 0.1)  # "or ask for a yes"
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
    (n + at_word("n1", "imessage") + 0.2, 0.18, 0.6, "impactSoft_medium_001.ogg"),
    (SITE_START, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (n + at_word("n1", "answer"), 0.18, 0.5, "impactSoft_medium_001.ogg"),
    (n + at_word("n1", "phone") - 0.3, 0.18, 0.6, "impactSoft_medium_001.ogg"),
    (m + at_word("n2", "we"), 0.18, 0.5, "impactSoft_medium_001.ogg"),
    (m + at_word("n2", "check"), 1.5, 0.35, "impactBell_heavy_000.ogg"),
    (p + at_word("n3", "score") + 1.8, 0.18, 0.5, "impactSoft_medium_001.ogg"),
    (RU0 + 0.8, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (RU0 + 2.4, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (RU0 + 4.0, 0.18, 0.4, "impactSoft_medium_001.ogg"),
    (OUT0, 1.5, 0.35, "impactBell_heavy_000.ogg"),
]
SFX = "\n      ".join(f'<audio id="sfx_{k}" data-start="{t(at)}" data-duration="{d}" data-track-index="6" data-volume="{v}" src="assets/sfx/{f}"></audio>' for k, (at, d, v, f) in enumerate(SFX_ITEMS))

# ---- captions: the script text, chunked, timed to the spoken words ----
import re
SCRIPT = json.load(open(os.path.join(BUILD, "narration.json")))
CAPS = []
for line in ["n1", "n2", "n3", "d1", "d2", "d3", "d4", "d5"]:
    sw = SCRIPT[line].split()
    chunks, cur = [], []
    for w in sw:
        cur.append(w)
        if (re.search(r"[,.:;!?]$", w) and len(cur) >= 5) or len(" ".join(cur)) >= 50:
            chunks.append(cur)
            cur = []
    if cur:
        if chunks and len(cur) < 4 and len(" ".join(chunks[-1] + cur)) <= 62:
            chunks[-1] += cur
        else:
            chunks.append(cur)
    ww = words_of(line)
    idx = 0
    starts = []
    for c in chunks:
        k = round(idx * (len(ww) - 1) / max(1, len(sw) - 1))
        starts.append(ww[min(k, len(ww) - 1)]["start"])
        idx += len(c)
    starts[0] = 0.0
    ends = starts[1:] + [ww[-1]["end"] + 0.25]
    for c, a, b in zip(chunks, starts, ends):
        CAPS.append((N[line] + a, N[line] + b, " ".join(c)))
assert all(len(x[2]) <= 66 for x in CAPS), [x[2] for x in CAPS if len(x[2]) > 66]  # a caption must fit on one line
CAPHTML = "\n      ".join(f'<div id="cap{k}" class="clip cap" data-start="{t(a)}" data-duration="{t(b - a)}" data-track-index="9"><span>{txt}</span></div>' for k, (a, b, txt) in enumerate(CAPS))

HTML = open(os.path.join(BUILD, "v5_template.html")).read()
for key, val in {
    "@@TIMELINE@@": TIMELINE, "@@AUDIO@@": AUDIO, "@@CAPS@@": CAPHTML, "@@SFX@@": SFX, "@@END@@": t(END), "@@TITLE@@": t(TITLE),
    "@@PS0@@": t(PS0), "@@PSD@@": t(PS1 - PS0),
    "@@EX0@@": t(EX0), "@@EXD@@": t(EXD),
    "@@W0@@": t(W1_0), "@@WD@@": t(W4_1 - W1_0),
    "@@RU0@@": t(RU0), "@@RUD@@": t(RU1 - RU0),
    "@@OUT0@@": t(OUT0), "@@OUTD@@": t(OUT1 - OUT0),
    "@@SITEB_START@@": t(SITE_START), "@@SITEB_DUR@@": t(PS1 - SITE_START),
    "@@W1S@@": t(W1_0), "@@W1D@@": t(W1_1 - W1_0), "@@W1M@@": t(WALK["W1"]),
    "@@W2S@@": t(W2_0), "@@W2D@@": t(W2_1 - W2_0), "@@W2M@@": t(WALK["W2"]),
    "@@W3S@@": t(W3_0), "@@W3D@@": t(W3_1 - W3_0), "@@W3M@@": t(WALK["W3"]),
    "@@W4S@@": t(W4_0), "@@W4D@@": t(W4_1 - W4_0), "@@W4M@@": t(WALK["W4"]),
    "@@MUSICD@@": t(END),
}.items():
    HTML = HTML.replace(key, val)
open(os.path.join(HERE, "index.html"), "w").write(HTML)
print("total seconds:", t(END), "| narration starts:", {k: t(v) for k, v in N.items()})
