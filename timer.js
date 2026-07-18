function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const MUSIC_PROFILES = {
  appetiser: {
    mode: "arpeggio",
    leadWave: "sine",
    bassWave: "triangle",
    tempo: 240,
    pattern: "up",
    chords: [
      { notes: [60, 64, 67, 72], bass: 48, steps: 4 },
      { notes: [65, 69, 72, 77], bass: 41, steps: 4 },
      { notes: [67, 71, 74, 79], bass: 43, steps: 4 },
      { notes: [60, 64, 67, 72], bass: 48, steps: 4 },
    ],
    filterBase: 900,
    filterLFODepth: 700,
    filterLFORate: 0.12,
    delayTime: 0.16,
    delayFeedback: 0.22,
    delayMix: 0.2,
  },
  "side-dish": {
    mode: "arpeggio",
    leadWave: "triangle",
    bassWave: "sine",
    tempo: 330,
    pattern: "updown",
    chords: [
      { notes: [57, 60, 64], bass: 45, steps: 4 },
      { notes: [55, 59, 62], bass: 43, steps: 4 },
      { notes: [57, 60, 64], bass: 45, steps: 4 },
      { notes: [53, 57, 60], bass: 41, steps: 4 },
    ],
    filterBase: 1100,
    filterLFODepth: 500,
    filterLFORate: 0.2,
    delayTime: 0.22,
    delayFeedback: 0.28,
    delayMix: 0.22,
  },
  "main-dish": {
    mode: "pad-sparse",
    padWave: "sine",
    leadWave: "sine",
    chordHoldMs: 4200,
    leadIntervalMs: 1900,
    leadNoteDuration: 2.2,
    chords: [
      { notes: [38, 57, 62, 65] },
      { notes: [34, 53, 58, 62] },
      { notes: [41, 60, 65, 69] },
      { notes: [36, 55, 60, 64] },
    ],
    filterBase: 1400,
    filterLFODepth: 400,
    filterLFORate: 0.05,
    delayTime: 0.4,
    delayFeedback: 0.38,
    delayMix: 0.3,
  },
  specials: {
    mode: "scale-random",
    wavePool: ["square", "triangle"],
    scale: [60, 62, 65, 67, 70, 72, 74, 77, 79],
    bassNotes: [36, 41, 43, 38],
    bassChangeEverySteps: 8,
    tempoMin: 200,
    tempoMax: 480,
    restProbability: 0.18,
    panRandom: true,
    filterBase: 1600,
    filterLFODepth: 900,
    filterLFORate: 0.3,
    delayTime: 0.18,
    delayFeedback: 0.32,
    delayMix: 0.26,
  },
  dessert: {
    mode: "bell-scale",
    wave: "triangle",
    scale: [72, 74, 76, 79, 81, 84, 86],
    tempo: 560,
    noteDuration: 1.4,
    bassNotes: [48, 52],
    bassChangeMs: 5000,
    filterBase: 3200,
    filterLFODepth: 200,
    filterLFORate: 0.08,
    delayTime: 0.42,
    delayFeedback: 0.48,
    delayMix: 0.34,
  },
};

class ComplexAmbientMusic {
  constructor(profile) {
    this.profile = profile;
    this.ctx = null;
    this.masterGain = null;
    this.filter = null;
    this.lfo = null;
    this.sustained = [];
    this.playing = false;
    this.timers = [];
    this.chordIndex = 0;
    this.stepInChord = 0;
    this.updownIndex = 0;
    this.stepCount = 0;
    this.bassStepCount = 0;
  }

  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return true;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    const ctx = new AudioContextClass();
    const p = this.profile;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    analyser.connect(ctx.destination);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(analyser);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = p.filterBase || 1800;
    filter.Q.value = 0.6;
    filter.connect(masterGain);

    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = p.delayTime || 0.25;
    const feedback = ctx.createGain();
    feedback.gain.value = p.delayFeedback ?? 0.3;
    const delayOut = ctx.createGain();
    delayOut.gain.value = p.delayMix ?? 0.25;
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayOut);
    delayOut.connect(analyser);

    if (p.filterLFORate) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = p.filterLFORate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = p.filterLFODepth || 0;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      this.lfo = lfo;
    }

    this.ctx = ctx;
    this.masterGain = masterGain;
    this.filter = filter;
    this.analyser = analyser;
    return true;
  }

  playNote(freq, duration, opts = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = opts.wave || this.profile.leadWave || "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const attack = opts.attack ?? 0.02;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.velocity ?? 0.6, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    let outNode = gain;
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gain.connect(panner);
      outNode = panner;
    }
    osc.connect(gain);
    outNode.connect(this.filter);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  startSustained(voices, filterCutoff) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const localFilter = ctx.createBiquadFilter();
    localFilter.type = "lowpass";
    localFilter.frequency.value = filterCutoff || 600;
    localFilter.connect(this.filter);

    const nodes = voices.map(({ midi, wave, detune, level }) => {
      const osc = ctx.createOscillator();
      osc.type = wave || "sine";
      osc.frequency.value = midiToFreq(midi);
      if (detune) osc.detune.value = detune;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level ?? 0.25, now + 0.6);
      osc.connect(gain);
      gain.connect(localFilter);
      osc.start(now);
      return { osc, gain };
    });

    const group = { nodes, localFilter };
    this.sustained.push(group);
    return group;
  }

  fadeOutSustainedGroup(group, fadeSeconds) {
    const now = this.ctx.currentTime;
    group.nodes.forEach(({ osc, gain }) => {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
        osc.stop(now + fadeSeconds + 0.05);
      } catch (e) {
        /* already stopped */
      }
    });
  }

  schedule(fn, delayMs) {
    const id = setTimeout(fn, delayMs);
    this.timers.push(id);
    return id;
  }

  clearTimers() {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
  }

  start() {
    if (this.playing || !this.profile) return;
    if (!this.ensureContext()) return;
    this.playing = true;
    this.chordIndex = 0;
    this.stepInChord = 0;
    this.updownIndex = 0;
    this.stepCount = 0;
    this.bassStepCount = 0;

    switch (this.profile.mode) {
      case "arpeggio":
        this.runArpeggio();
        break;
      case "scale-random":
        this.runRandomScale();
        break;
      case "bell-scale":
        this.runBellScale();
        break;
      case "pad-sparse":
        this.runPadSparse();
        break;
    }
  }

  runArpeggio() {
    const p = this.profile;
    let currentBassGroup = null;

    const retriggerBass = (bassMidi) => {
      if (currentBassGroup) this.fadeOutSustainedGroup(currentBassGroup, 0.3);
      currentBassGroup = this.startSustained(
        [
          { midi: bassMidi, wave: p.bassWave, level: 0.22 },
          { midi: bassMidi, wave: p.bassWave, detune: 6, level: 0.18 },
        ],
        500
      );
    };

    const step = () => {
      if (!this.playing) return;
      const chord = p.chords[this.chordIndex];
      if (this.stepInChord === 0) retriggerBass(chord.bass);

      let midi;
      if (p.pattern === "updown") {
        const up = chord.notes;
        const down = [...up].slice(1, -1).reverse();
        const cycle = up.concat(down.length ? down : []);
        midi = cycle[this.updownIndex % cycle.length];
        this.updownIndex++;
      } else {
        midi = chord.notes[this.stepInChord % chord.notes.length];
      }

      this.playNote(midiToFreq(midi), p.tempo / 1000 + 0.35, {
        wave: p.leadWave,
        velocity: 0.55,
      });

      this.stepInChord++;
      if (this.stepInChord >= chord.steps) {
        this.stepInChord = 0;
        this.chordIndex = (this.chordIndex + 1) % p.chords.length;
      }
      this.schedule(step, p.tempo);
    };
    step();
  }

  runRandomScale() {
    const p = this.profile;
    let currentBassGroup = null;

    const retriggerBass = () => {
      const midi = p.bassNotes[Math.floor(Math.random() * p.bassNotes.length)];
      if (currentBassGroup) this.fadeOutSustainedGroup(currentBassGroup, 0.35);
      currentBassGroup = this.startSustained(
        [{ midi, wave: "sine", level: 0.2 }],
        450
      );
    };

    const step = () => {
      if (!this.playing) return;
      if (this.bassStepCount % p.bassChangeEverySteps === 0) retriggerBass();
      this.bassStepCount++;

      if (Math.random() >= (p.restProbability || 0)) {
        const midi = p.scale[Math.floor(Math.random() * p.scale.length)];
        const wave = p.wavePool[Math.floor(Math.random() * p.wavePool.length)];
        const pan = p.panRandom ? Math.random() * 1.6 - 0.8 : 0;
        this.playNote(midiToFreq(midi), 0.4, { wave, velocity: 0.5, pan });
      }

      const nextTempo = p.tempoMin + Math.random() * (p.tempoMax - p.tempoMin);
      this.schedule(step, nextTempo);
    };
    step();
  }

  runBellScale() {
    const p = this.profile;
    this.startSustained(
      p.bassNotes.map((midi) => ({ midi, wave: "sine", level: 0.14 })),
      350
    );

    const step = () => {
      if (!this.playing) return;
      const midi = p.scale[Math.floor(Math.random() * p.scale.length)];
      this.playNote(midiToFreq(midi), p.noteDuration, {
        wave: p.wave,
        velocity: 0.45,
        attack: 0.005,
      });
      this.stepCount++;
      this.schedule(step, p.tempo);
    };
    step();
  }

  runPadSparse() {
    const p = this.profile;

    const crossfadeTo = (chord, previousGroup) => {
      if (previousGroup) this.fadeOutSustainedGroup(previousGroup, 1.4);
      return this.startSustained(
        chord.notes.map((midi, i) => ({
          midi,
          wave: p.padWave,
          detune: i % 2 === 0 ? 4 : -4,
          level: 0.16,
        })),
        900
      );
    };

    let padGroup = crossfadeTo(p.chords[0], null);

    const advanceChord = () => {
      if (!this.playing) return;
      this.chordIndex = (this.chordIndex + 1) % p.chords.length;
      padGroup = crossfadeTo(p.chords[this.chordIndex], padGroup);
      this.schedule(advanceChord, p.chordHoldMs);
    };
    this.schedule(advanceChord, p.chordHoldMs);

    const sparseLead = () => {
      if (!this.playing) return;
      const chord = p.chords[this.chordIndex];
      const midi = chord.notes[Math.floor(Math.random() * chord.notes.length)];
      this.playNote(midiToFreq(midi) * 2, p.leadNoteDuration, {
        wave: p.leadWave,
        velocity: 0.22,
        attack: 0.3,
      });
      this.schedule(sparseLead, p.leadIntervalMs + Math.random() * 800);
    };
    this.schedule(sparseLead, p.leadIntervalMs);
  }

  stop() {
    this.playing = false;
    this.clearTimers();
    this.sustained.forEach((group) => this.fadeOutSustainedGroup(group, 0.35));
    this.sustained = [];
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const timerEl = document.querySelector(".div-timer");
  if (!timerEl) return;

  const display = timerEl.querySelector(".timer-display");
  const startBtn = timerEl.querySelector(".timer-start");
  const pauseBtn = timerEl.querySelector(".timer-pause");
  const resetBtn = timerEl.querySelector(".timer-reset");
  const minutesInput = timerEl.querySelector(".timer-minutes-input");

  const profile = MUSIC_PROFILES[timerEl.dataset.category];
  const music = profile ? new ComplexAmbientMusic(profile) : null;

  const canvas = timerEl.querySelector(".div-timer-canvas");
  const canvasCtx = canvas ? canvas.getContext("2d") : null;
  let visualizerFrame = null;

  function resizeCanvas() {
    if (!canvas) return;
    const rect = timerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }

  function drawVisualizer() {
    if (!canvas || !canvasCtx || !music || !music.analyser) return;
    const data = new Uint8Array(music.analyser.frequencyBinCount);
    music.analyser.getByteFrequencyData(data);

    const w = canvas.width;
    const h = canvas.height;
    canvasCtx.clearRect(0, 0, w, h);

    const barCount = 26;
    const step = Math.max(1, Math.floor(data.length / barCount));
    const barWidth = w / barCount;
    canvasCtx.fillStyle = "rgba(0, 0, 0, 0.1)";
    for (let i = 0; i < barCount; i++) {
      const value = data[i * step] || 0;
      const barHeight = (value / 255) * h * 0.85;
      const x = i * barWidth;
      canvasCtx.fillRect(x + barWidth * 0.15, h - barHeight, barWidth * 0.7, barHeight);
    }

    visualizerFrame = requestAnimationFrame(drawVisualizer);
  }

  function startVisualizer() {
    if (!canvas || visualizerFrame) return;
    resizeCanvas();
    drawVisualizer();
  }

  function stopVisualizer() {
    if (visualizerFrame) {
      cancelAnimationFrame(visualizerFrame);
      visualizerFrame = null;
    }
    if (canvasCtx && canvas) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.addEventListener("resize", resizeCanvas);

  let durationSeconds = parseInt(timerEl.dataset.duration, 10) || 600;
  let remaining = durationSeconds;
  let intervalId = null;

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function render() {
    display.textContent = formatTime(remaining);
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      render();
      clearInterval(intervalId);
      intervalId = null;
      if (music) music.stop();
      stopVisualizer();
      display.textContent = "Time's Up!";
      return;
    }
    render();
  }

  function start() {
    if (intervalId || remaining <= 0) return;
    intervalId = setInterval(tick, 1000);
    if (music) music.start();
    startVisualizer();
  }

  function pause() {
    clearInterval(intervalId);
    intervalId = null;
    if (music) music.stop();
    stopVisualizer();
  }

  function reset() {
    pause();
    if (minutesInput) {
      const minutes = parseInt(minutesInput.value, 10) || 10;
      durationSeconds = minutes * 60;
    }
    remaining = durationSeconds;
    render();
  }

  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", pause);
  resetBtn.addEventListener("click", reset);
  if (minutesInput) {
    minutesInput.addEventListener("change", reset);
  }

  render();
});
