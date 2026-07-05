/**
 * WebAudio-based alarm sound engine.
 * Generates alarm tones procedurally so alarms work fully offline with zero
 * audio assets. Drop real MP3s into /public/sounds later and extend if desired.
 */

type Pattern = { freqs: number[]; beepMs: number; gapMs: number; type: OscillatorType };

const PATTERNS: Record<string, Pattern> = {
  sunrise: { freqs: [523, 659, 784, 659], beepMs: 400, gapMs: 450, type: "sine" },
  classic: { freqs: [880, 880], beepMs: 250, gapMs: 250, type: "square" },
  digital: { freqs: [1047, 1319], beepMs: 150, gapMs: 130, type: "triangle" },
  storm: { freqs: [440, 587, 740, 988], beepMs: 200, gapMs: 100, type: "sawtooth" },
};

export const ALARM_SOUNDS = Object.keys(PATTERNS);

export class AlarmSoundEngine {
  private ctx: AudioContext | null = null;
  private beepTimer: ReturnType<typeof setInterval> | null = null;
  private vibTimer: ReturnType<typeof setInterval> | null = null;
  private step = 0;

  start(sound: string, volume: number, vibrate: boolean) {
    this.stop();
    const pattern = PATTERNS[sound] ?? PATTERNS.classic;
    const gain = Math.max(0.02, Math.min(volume, 100) / 100) * 0.5;

    try {
      this.ctx = new AudioContext();
      void this.ctx.resume(); // may be suspended until first user gesture
      const period = pattern.beepMs + pattern.gapMs;

      this.beepTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== "running") {
          void this.ctx?.resume();
          return;
        }
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = pattern.type;
        osc.frequency.value = pattern.freqs[this.step++ % pattern.freqs.length];
        g.gain.value = gain;
        osc.connect(g).connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + pattern.beepMs / 1000);
      }, period);
    } catch {
      // Audio unavailable — vibration below may still work.
    }

    if (vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
      this.vibTimer = setInterval(() => navigator.vibrate([400, 200]), 800);
    }
  }

  /** Call from a click handler to satisfy browser autoplay policies. */
  unlock() {
    void this.ctx?.resume();
  }

  stop() {
    if (this.beepTimer) clearInterval(this.beepTimer);
    if (this.vibTimer) clearInterval(this.vibTimer);
    this.beepTimer = this.vibTimer = null;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(0);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
