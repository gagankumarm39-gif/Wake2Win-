/**
 * Procedural ambient sounds for Focus Mode — generated with WebAudio so they
 * work fully offline with zero audio assets.
 */

export type AmbientType = "rain" | "forest" | "library" | "white";

export const AMBIENT_SOUNDS: { id: AmbientType; label: string; emoji: string }[] = [
  { id: "rain", label: "Rain", emoji: "🌧️" },
  { id: "forest", label: "Forest", emoji: "🌲" },
  { id: "library", label: "Library", emoji: "📚" },
  { id: "white", label: "White noise", emoji: "🌫️" },
];

function fillNoise(data: Float32Array, color: "white" | "pink" | "brown") {
  if (color === "white") {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return;
  }
  if (color === "brown") {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
    return;
  }
  // Pink noise — Paul Kellet approximation
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

export class AmbientSoundEngine {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;

  start(type: AmbientType, volume = 50) {
    this.stop();
    try {
      this.ctx = new AudioContext();
      const ctx = this.ctx;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      fillNoise(
        buffer.getChannelData(0),
        type === "white" ? "white" : type === "library" ? "brown" : "pink"
      );

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      switch (type) {
        case "rain":
          filter.type = "lowpass";
          filter.frequency.value = 1400;
          break;
        case "forest":
          filter.type = "bandpass";
          filter.frequency.value = 900;
          filter.Q.value = 0.6;
          break;
        case "library":
          filter.type = "lowpass";
          filter.frequency.value = 400;
          break;
        default:
          filter.type = "highpass";
          filter.frequency.value = 20;
      }

      // Slow modulation gives rain/forest a natural, breathing texture.
      if (type === "rain" || type === "forest") {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.15;
        lfoGain.gain.value = type === "forest" ? 300 : 150;
        lfo.connect(lfoGain).connect(filter.frequency);
        lfo.start();
        this.lfo = lfo;
      }

      const gain = ctx.createGain();
      gain.gain.value = (Math.min(volume, 100) / 100) * 0.4;

      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      this.src = src;
      void ctx.resume();
    } catch {
      /* audio unavailable — focus mode still works silently */
    }
  }

  stop() {
    try {
      this.lfo?.stop();
      this.src?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close().catch(() => {});
    this.ctx = this.src = null as never;
    this.lfo = null;
  }
}

/** Short pleasant chime played when a focus session or break completes. */
export function playChime() {
  try {
    const ctx = new AudioContext();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 2000);
  } catch {
    /* silent */
  }
}
