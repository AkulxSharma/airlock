// Voice activity detector: decides when someone is talking so we only send real speech for
// transcription. Pure code (no browser APIs), so it is tested with synthetic audio.
//
// Feed it fixed-size frames of audio samples. It returns the finished utterance (as one
// Float32Array) when speech has ended, otherwise null. It keeps a short pre-roll so the first
// syllable ("Hey") is not clipped, and adapts to the room's background noise.
export interface VadOptions {
  frameMs: number; // length of each frame fed in
  preRollMs?: number; // audio kept from before speech began
  hangoverMs?: number; // silence that ends an utterance
  minSpeechMs?: number; // shorter bursts are ignored (coughs, clicks)
  maxSpeechMs?: number; // an utterance is cut after this long
  minThreshold?: number; // loudness floor (RMS, 0..1)
  ratio?: number; // speech must be this many times louder than the background
  startFrames?: number; // loud frames in a row before speech counts as started
  endRatio?: number; // once talking, only a level below this many times the background counts as quiet (gentler than the start ratio)
  warmupMs?: number; // at the start, only listen to learn how noisy the room is
}

const rms = (f: Float32Array) => {
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  return Math.sqrt(s / Math.max(1, f.length));
};

export function createVad(options: VadOptions) {
  const o = {
    preRollMs: 500, hangoverMs: 1400, minSpeechMs: 450, maxSpeechMs: 10_000,
    minThreshold: 0.004, ratio: 2.5, startFrames: 2, endRatio: 1.6, warmupMs: 1200, ...options, // a weak microphone peaks near 0.012, so the floor must be low and scale with the room
  };
  const preFrames = Math.max(1, Math.round(o.preRollMs / o.frameMs));
  let floor = 0.004; // running estimate of the background level
  let heardMs = 0; // how long we have been listening (for the warm-up)
  let levelSum = 0; // loudness of the current utterance, to spot steady noise
  let levelCount = 0;
  let speaking = false;
  let above = 0;
  let quietMs = 0;
  let speechMs = 0;
  let totalMs = 0;
  let ring: Float32Array[] = [];
  let utter: Float32Array[] = [];

  const finish = (): Float32Array | null => {
    const long = speechMs >= o.minSpeechMs;
    const frames = utter;
    speaking = false; above = 0; quietMs = 0; speechMs = 0; totalMs = 0; utter = []; ring = []; levelSum = 0; levelCount = 0;
    if (!long) return null;
    const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
    let at = 0;
    for (const f of frames) { out.set(f, at); at += f.length; }
    return out;
  };

  return {
    /** Current threshold, for diagnostics. */
    threshold: () => Math.max(o.minThreshold, floor * o.ratio),
    feed(frame: Float32Array): Float32Array | null {
      const level = rms(frame);
      const threshold = Math.max(o.minThreshold, floor * o.ratio);
      const copy = frame.slice();

      if (!speaking) {
        heardMs += o.frameMs;
        if (heardMs <= o.warmupMs) { // learn the room first; nothing counts as speech yet
          floor = heardMs <= o.frameMs ? level : Math.min(floor, level); // the quietest moment, so early speech is not learned as noise
          return null;
        }
        // Track the background: rise slowly (speech must not teach it that talking is normal),
        // fall quickly. Steady noise therefore becomes the floor instead of looking like speech.
        floor += (level - floor) * (level > floor ? 0.01 : 0.2);
        ring.push(copy);
        if (ring.length > preFrames) ring.shift();
        above = level > threshold ? above + 1 : 0;
        if (above >= o.startFrames) {
          speaking = true;
          utter = [...ring];
          speechMs = above * o.frameMs;
          totalMs = utter.length * o.frameMs;
          quietMs = 0; levelSum = 0; levelCount = 0;
        }
        return null;
      }

      utter.push(copy);
      totalMs += o.frameMs;
      levelSum += level; levelCount++;
      // Hysteresis: starting needs a clear rise above the room, but a quieter syllable mid-sentence still counts as speech.
      const stillTalking = level > Math.max(o.minThreshold * 0.6, floor * o.endRatio);
      if (stillTalking) { quietMs = 0; speechMs += o.frameMs; } else quietMs += o.frameMs;
      if (quietMs >= o.hangoverMs) return finish();
      if (totalMs >= o.maxSpeechMs) {
        // Cut off. If it never went quiet it was probably steady noise: raise the floor so it does not repeat.
        const average = levelSum / Math.max(1, levelCount);
        if (quietMs === 0) floor = Math.max(floor, average * 0.8);
        return finish();
      }
      return null;
    },
    reset() { speaking = false; above = 0; quietMs = 0; speechMs = 0; totalMs = 0; ring = []; utter = []; levelSum = 0; levelCount = 0; },
  };
}
