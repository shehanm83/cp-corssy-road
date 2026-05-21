// Procedural retro audio — uses Web Audio API to synthesize chiptune-style SFX
// and a looping music bed entirely in code. No external audio files needed for MVP.
// Real .wav/.ogg files can be loaded later by extending this module.

const STORAGE_MUTE = 'cp-retro.mute';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicNodes = null;
    this.muted = localStorage.getItem(STORAGE_MUTE) === '1';
    this._musicRunning = false;
  }

  // Browsers require an AudioContext to start in response to a user gesture.
  ensureContext() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.master);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_MUTE, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }

  isMuted() { return this.muted; }

  // ---- SFX ----

  _blip({ freq = 440, dur = 0.08, type = 'square', sweepTo = null, gain = 0.3 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  hop()      { this._blip({ freq: 520, sweepTo: 740, dur: 0.07, type: 'square', gain: 0.18 }); }
  coin()     { this._blip({ freq: 880, sweepTo: 1320, dur: 0.10, type: 'square', gain: 0.25 });
               setTimeout(() => this._blip({ freq: 1320, sweepTo: 1760, dur: 0.10, type: 'square', gain: 0.22 }), 60); }
  death()    {
    this._blip({ freq: 440, sweepTo: 80, dur: 0.45, type: 'sawtooth', gain: 0.35 });
    setTimeout(() => this._blip({ freq: 200, sweepTo: 50, dur: 0.30, type: 'square', gain: 0.25 }), 200);
  }
  unlock()   {
    // 3-note ascending fanfare
    this._blip({ freq: 660, dur: 0.10, gain: 0.25 });
    setTimeout(() => this._blip({ freq: 880, dur: 0.10, gain: 0.25 }), 110);
    setTimeout(() => this._blip({ freq: 1320, dur: 0.16, gain: 0.28 }), 220);
  }
  trainHorn(){ this._blip({ freq: 220, sweepTo: 180, dur: 0.45, type: 'triangle', gain: 0.25 }); }

  // ---- Music (very simple two-bar chiptune loop) ----

  startMusic() {
    if (!this.ctx || this._musicRunning) return;
    this._musicRunning = true;
    const notes = [262, 330, 392, 330, 349, 392, 440, 392, 262, 330, 392, 523, 494, 440, 392, 330];
    const stepDur = 0.18;
    const t0 = this.ctx.currentTime + 0.05;

    const loop = (startTime) => {
      if (!this._musicRunning) return;
      for (let i = 0; i < notes.length; i++) {
        const t = startTime + i * stepDur;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = notes[i];
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.9);
        osc.connect(g).connect(this.musicGain);
        osc.start(t);
        osc.stop(t + stepDur);
      }
      const nextStart = startTime + notes.length * stepDur;
      const wait = (nextStart - this.ctx.currentTime) * 1000 - 100;
      setTimeout(() => loop(nextStart), Math.max(50, wait));
    };
    loop(t0);
  }

  stopMusic() {
    this._musicRunning = false;
  }
}
