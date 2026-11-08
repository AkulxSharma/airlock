// Barge-in detector: while Airlock is speaking, decides when the person starts talking over it.
// Pure code (no browser APIs), tested with synthetic audio.
//
// The microphone also picks up Airlock's own voice from the speakers. The browser's echo cancellation
// removes most of it, and what is left is learned as the baseline during the first frames of speech
// (nobody interrupts in the first fraction of a second). Barge-in is then a clear rise above that baseline
// that lasts a few frames, so a click, a cough or the tail of the echo does not stop the reply.
export interface BargeInOptions {
  baselineFrames?: number; // frames used to learn the echo level at the start of a reply
  ratio?: number; // speech must be this many times louder than the echo baseline
  minLevel?: number; // loudness floor (RMS, 0..1), so a silent room cannot trigger on noise
  frames?: number; // loud frames in a row before it counts as interruption
}

const rms = (f: Float32Array) => {
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  return Math.sqrt(s / Math.max(1, f.length));
};

export function createBargeInDetector(options: BargeInOptions = {}) {
  const o = { baselineFrames: 3, ratio: 3, minLevel: 0.008, frames: 2, ...options };
  let seen = 0;
  let base = 0;
  let above = 0;

  return {
    /** Start fresh for a new reply. */
    reset() {
      seen = 0;
      base = 0;
      above = 0;
    },
    /** Feed one frame of microphone samples. Returns true when the person is talking over Airlock. */
    feed(frame: Float32Array): boolean {
      const level = rms(frame);
      if (seen < o.baselineFrames) {
        base = (base * seen + level) / (seen + 1);
        seen++;
        return false;
      }
      const threshold = Math.max(o.minLevel, base * o.ratio);
      if (level > threshold) {
        above++;
        return above >= o.frames;
      }
      above = 0;
      base = base * 0.9 + level * 0.1; // follow the echo slowly as the reply's loudness changes
      return false;
    },
  };
}
