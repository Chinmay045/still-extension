// Synthesized focus sounds. No audio files: oscillators, noise and filters only.
// Output path: sources -> master gain (volume x 0.75) -> DynamicsCompressor -> speakers.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.nodes = [];
    this.timers = [];
    this.volume = 70;
    this.current = 'off';
    this.buffers = {};
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
      this.setVolume(this.volume);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, Number(v) || 0));
    if (this.master) this.master.gain.setTargetAtTime((this.volume / 100) * 0.75, this.ctx.currentTime, 0.05);
  }

  noiseBuffer(kind) {
    if (this.buffers[kind]) return this.buffers[kind];
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          data[i] = last * 3.5;
        } else {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
      }
    }
    this.buffers[kind] = buf;
    return buf;
  }

  loopNoise(kind, dest, filters) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(kind);
    src.loop = true;
    let node = src;
    (filters || []).forEach(([type, freq, q]) => {
      const bq = ctx.createBiquadFilter();
      bq.type = type; bq.frequency.value = freq;
      if (q) bq.Q.value = q;
      node.connect(bq); node = bq;
    });
    node.connect(dest);
    src.start();
    this.nodes.push(src);
  }

  // Slow, lyric-free chord pad. With pulseHz it is amplitude modulated (beta pulse).
  pad(dest, pulseHz) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    out.connect(lp);
    if (pulseHz) {
      const am = ctx.createGain(); am.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = pulseHz;
      const depth = ctx.createGain(); depth.gain.value = 0.4;
      lfo.connect(depth); depth.connect(am.gain); lfo.start();
      this.nodes.push(lfo);
      lp.connect(am); am.connect(dest);
    } else {
      lp.connect(dest);
    }
    const chords = [[261.63, 329.63, 392.0, 493.88], [220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 261.63, 329.63], [196.0, 246.94, 293.66, 392.0]];
    const len = 6;
    let step = 0;
    const play = () => {
      const t0 = ctx.currentTime + 0.05;
      const chord = chords[step++ % chords.length];
      chord.concat([chord[0] / 2]).forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 4 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = (i - 2) * 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(i === 4 ? 0.28 : 0.14, t0 + 2);
        g.gain.linearRampToValueAtTime(0, t0 + len + 1.5);
        o.connect(g); g.connect(out);
        o.start(t0); o.stop(t0 + len + 1.6);
      });
    };
    play();
    this.timers.push(setInterval(play, len * 1000));
  }

  play(id) {
    this.stop();
    this.current = id;
    if (!id || id === 'off') return;
    const ctx = this.ensure();
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    bus.connect(this.master);
    this.bus = bus;

    if (id === 'ambient') this.pad(bus, 0);
    else if (id === 'beta') this.pad(bus, 16);
    else if (id === 'gamma') {
      // 200 Hz left, 240 Hz right: a 40 Hz binaural beat, over soft brown noise.
      [[-1, 200], [1, 240]].forEach(([p, f]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.35;
        const pan = ctx.createStereoPanner(); pan.pan.value = p;
        o.connect(g); g.connect(pan); pan.connect(bus); o.start();
        this.nodes.push(o);
      });
      const bed = ctx.createGain(); bed.gain.value = 0.35; bed.connect(bus);
      this.loopNoise('brown', bed, [['lowpass', 500]]);
    } else if (id === 'cafe') {
      const murmur = ctx.createGain(); murmur.gain.value = 1.4; murmur.connect(bus);
      this.loopNoise('brown', murmur, [['bandpass', 500, 0.7]]);
      const room = ctx.createGain(); room.gain.value = 0.25; room.connect(bus);
      this.loopNoise('pink', room, [['lowpass', 2500]]);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.3;
      const d = ctx.createGain(); d.gain.value = 0.35;
      lfo.connect(d); d.connect(murmur.gain); lfo.start();
      this.nodes.push(lfo);
      // Occasional cup clinks.
      this.timers.push(setInterval(() => {
        if (Math.random() > 0.45) return;
        const t = ctx.currentTime + Math.random() * 0.5;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 2400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4);
      }, 700));
    }
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    const nodes = this.nodes;
    const bus = this.bus;
    this.nodes = [];
    this.bus = null;
    this.current = 'off';
    if (!this.ctx) return;
    if (bus) {
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); bus.disconnect(); }, 600);
    } else {
      nodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    }
  }

  // Soft three-note chime for the end of a session.
  chime() {
    const ctx = this.ensure();
    [659.25, 830.61, 987.77].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.22;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.7);
    });
  }
}
