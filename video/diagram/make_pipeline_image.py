from PIL import Image, ImageDraw, ImageFont
import sys

COLS, ROWS = 100, 74
N, E, S, W = 1, 2, 4, 8
CH = {N|S:"│", E|W:"─", S|E:"┌", S|W:"┐", N|E:"└", N|W:"┘", N|S|E:"├", N|S|W:"┤", S|E|W:"┬", N|E|W:"┴", N|S|E|W:"┼", N:"│", S:"│", E:"─", W:"─"}
lines = {}   # (x,y) -> direction bits
text = {}    # (x,y) -> char (wins over lines)


def put(x, y, d):
    lines[(x, y)] = lines.get((x, y), 0) | d


def hline(y, x1, x2):
    for x in range(min(x1, x2), max(x1, x2) + 1):
        d = (E if x < max(x1, x2) else 0) | (W if x > min(x1, x2) else 0)
        put(x, y, d)


def vline(x, y1, y2):
    for y in range(min(y1, y2), max(y1, y2) + 1):
        d = (S if y < max(y1, y2) else 0) | (N if y > min(y1, y2) else 0)
        put(x, y, d)


def label(x, y, s, center=False):
    if center:
        x = x - len(s) // 2
    for i, c in enumerate(s):
        text[(x + i, y)] = c


def box(x, y, w, h, rows):
    hline(y, x, x + w - 1); hline(y + h - 1, x, x + w - 1)
    vline(x, y, y + h - 1); vline(x + w - 1, y, y + h - 1)
    top = y + 1 + (h - 2 - len(rows)) // 2
    for i, r in enumerate(rows):
        label(x + w // 2, top + i, r, center=True)


def arrow_down(x, y):
    text[(x, y)] = "▼"


def arrow_right(x, y):
    text[(x, y)] = "▶"


# ---- title ----
box(2, 0, 96, 3, ["AIRLOCK PIPELINE"])

# ---- input ----
label(4, 5, "User voice input")
vline(8, 6, 7); arrow_down(8, 8)

label(48, 5, "typed text or iMessage text", center=True)
vline(48, 6, 7); arrow_down(48, 8)
# ---- row A: scribe, router, gemini ----
box(4, 9, 24, 5, ["ElevenLabs", "Scribe", "(voice to text)"])
box(36, 9, 24, 5, ["Input Router", "(one session", "per sender)"])
box(66, 9, 28, 5, ["Gemini", "intent + function", "tools"])
hline(11, 28, 35); arrow_right(35, 11)
hline(11, 60, 65); arrow_right(65, 11)
# voice goes through Scribe first; typed and iMessage text join at the router
vline(8, 13, 13)

# ---- split into intent / tools ----
vline(80, 14, 17)
hline(17, 62, 88)
vline(62, 17, 18); vline(88, 17, 18)
arrow_down(62, 19); arrow_down(88, 19)
label(62, 20, "Intent Recognition", center=True)
label(88, 20, "Function Tools", center=True)
vline(62, 21, 24); vline(88, 21, 24)
hline(24, 12, 88)
for cx in (12, 36, 60, 84):
    vline(cx, 24, 25); arrow_down(cx, 26)

# ---- tools ----
TOOLS = [(2, ["Resolve", "ENS name", "or address"]), (26, ["Contract", "Auditor", "bytecode+source"]), (50, ["Send", "Sepolia", "test ETH"]), (74, ["Explain", "the findings", "in plain words"])]
for x, rows in TOOLS:
    box(x, 27, 20, 6, rows)
for x, _ in TOOLS:
    vline(x + 10, 33, 36)
hline(36, 12, 84)
vline(48, 36, 38); arrow_down(48, 39)

# ---- risk gate, context, response ----
box(12, 40, 72, 6, ["RISK GATE  (plain code, never the AI)", "HIGH, an error or a timeout: refuse", "LOW or MEDIUM: ask for YES, which expires"])
vline(48, 46, 47); arrow_down(48, 48)
box(30, 49, 36, 4, ["Context Builder", "(findings as JSON only)"])
vline(48, 53, 54); arrow_down(48, 55)
box(30, 56, 36, 4, ["Gemini Response", "(may cite only real findings)"])
vline(48, 60, 61); arrow_down(48, 62)
box(36, 63, 24, 3, ["Output Router"])

# ---- outputs ----
vline(48, 65, 67)
hline(67, 24, 72)
vline(24, 67, 68); vline(72, 67, 68)
arrow_down(24, 69); arrow_down(72, 69)
label(24, 70, "GUI: text + ElevenLabs voice", center=True)
label(72, 70, "iMessage: text reply", center=True)
label(48, 72, "Live event log: audit stages stream to the dashboard", center=True)

# ---- render ----
SCALE = 2 if len(sys.argv) > 2 and sys.argv[2] == "transparent" else 1
CW, CHT = 11 * SCALE, 23 * SCALE
PAD = 28 * SCALE
BG = (0, 0, 0, 0) if SCALE == 2 else "#f3f2f0"
img = Image.new("RGBA" if SCALE == 2 else "RGB", (COLS * CW + PAD * 2, ROWS * CHT + PAD * 2), BG)
d = ImageDraw.Draw(img)
font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 18 * SCALE)
ink = "#1f2d36"
for y in range(ROWS):
    for x in range(COLS):
        c = text.get((x, y)) or (CH.get(lines.get((x, y), 0)) if (x, y) in lines else None)
        if c:
            d.text((PAD + x * CW, PAD + y * CHT), c, font=font, fill=ink)
out = sys.argv[1]
img.save(out)
print(out, img.size)
