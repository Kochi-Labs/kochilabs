export type SoundEffect = 'water' | 'boat' | 'palm' | 'window' | 'coconut' | 'cork' | 'paperOpen' | 'paperClose' | 'birds' | 'jump' | 'land' | 'gameOver' | 'gameStart' | 'celestial' | 'language';
export type SoundState = 'waiting' | 'playing' | 'muted' | 'unavailable';

const PREFERENCE = 'kochi-labs-sound-muted';
const NOTES = [146.832, 174.614, 195.998, 220, 261.626, 293.665, 349.228, 440];
// Spaces are part of the melody: this is a slow, original handpan-style phrase.
const PHRASES = [[0, 3, 5, 4, 2, 3, 1, null], [0, 2, 4, 5, null, 3, 2, null], [1, 3, 6, 5, 4, 2, 0, null], [0, null, 3, 4, 7, 5, 3, null]] as const;
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

/** Local, sample-free handpan synthesis and quiet material/foley responses. */
export function createSoundscape(onState?: (state: SoundState) => void) {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let effects: GainNode | undefined;
  let music: GainNode | undefined;
  let reverb: ConvolverNode | undefined;
  let noiseBuffer: AudioBuffer | undefined;
  let rainGain: GainNode | undefined;
  let fireGain: GainNode | undefined;
  let rainLevel = 0, fireLevel = 0, night = false;
  let muted = false, destroyed = false, state: SoundState = 'waiting';
  let timer: ReturnType<typeof setInterval> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let nextNote = 0, nextCrackle = 0, beat = 0, phrase = 0;
  let activation: Promise<void> | undefined;
  const nodes = new Set<AudioNode>();
  const voices = new Set<{ source: AudioScheduledSourceNode; finish: () => void }>();
  const ambientSources: AudioBufferSourceNode[] = [];
  const lastEffect = new Map<SoundEffect, number>();
  const pendingEffects: { type: SoundEffect; pan: number; intensity: number; at: number }[] = [];
  try { muted = localStorage.getItem(PREFERENCE) === 'true'; } catch { /* Private browsing may disable storage. */ }

  function report(next: SoundState) { state = next; onState?.(next); }
  function remember() { try { localStorage.setItem(PREFERENCE, String(muted)); } catch { /* Preference is optional. */ } }
  function keep<T extends AudioNode>(node: T): T { nodes.add(node); return node; }

  function releaseVoices() {
    for (const voice of [...voices]) {
      try { voice.source.stop(); } catch { /* Already ended. */ }
      voice.finish();
    }
  }
  function attach(source: AudioScheduledSourceNode, chain: AudioNode[], at: number, duration: number) {
    if (voices.size >= 96) { source.disconnect(); chain.forEach(node => node.disconnect()); return; }
    let ended = false;
    const voice = { source, finish() {
      if (ended) return;
      ended = true; source.disconnect(); chain.forEach(node => node.disconnect()); voices.delete(voice);
    } };
    source.onended = voice.finish;
    voices.add(voice);
    source.start(at); source.stop(at + duration);
  }
  function envelope(gain: AudioParam, at: number, strength: number, attack: number, duration: number) {
    gain.setValueAtTime(.00001, at);
    gain.exponentialRampToValueAtTime(Math.max(.00002, strength), at + attack);
    gain.exponentialRampToValueAtTime(.00001, at + duration);
  }
  function panNode(pan: number, destination: AudioNode, wet = .12) {
    const panner = context!.createStereoPanner(); panner.pan.value = clamp(pan, -.85, .85);
    panner.connect(destination);
    const send = context!.createGain(); send.gain.value = wet;
    panner.connect(send); send.connect(reverb!);
    return { panner, send };
  }
  function tone(hz: number, at: number, duration: number, strength: number, pan = 0, endHz = hz, destination = effects!, wet = .1) {
    if (!context || voices.size >= 90) return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    const { panner, send } = panNode(pan, destination, wet);
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(Math.max(20, hz), at);
    if (endHz !== hz) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), at + duration * .85);
    envelope(gain.gain, at, strength, Math.min(.012, duration * .15), duration);
    oscillator.connect(gain); gain.connect(panner);
    attach(oscillator, [gain, panner, send], at, duration + .025);
  }
  function noise(at: number, duration: number, strength: number, frequency: number, pan = 0, type: BiquadFilterType = 'bandpass', endFrequency = frequency, wet = .06) {
    if (!context || !noiseBuffer || voices.size >= 90) return;
    const source = context.createBufferSource(); source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter(); filter.type = type; filter.Q.value = .65;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(35, endFrequency), at + duration);
    const gain = context.createGain(); envelope(gain.gain, at, strength, Math.min(.025, duration * .18), duration);
    const { panner, send } = panNode(pan, effects!, wet);
    source.connect(filter); filter.connect(gain); gain.connect(panner);
    attach(source, [filter, gain, panner, send], at, Math.min(duration + .03, 3.9));
  }
  function handpan(hz: number, at: number, velocity = .7, pan = 0) {
    // Shell modes: fundamental, octave, compound fifth, and quieter inharmonics.
    const modes = [[1, 1, 3.9], [2.001, .44, 2.7], [3.005, .25, 2.05], [4.82, .065, .75], [6.36, .027, .42]] as const;
    for (const [ratio, amount, decay] of modes) {
      tone(hz * ratio, at, decay, .135 * velocity * amount, pan, hz * ratio * .9993, music!, .28);
    }
    noise(at, .065, .018 * velocity, 950, pan, 'lowpass', 380, .08);
  }
  function schedule() {
    if (!context || state !== 'playing' || document.hidden) return;
    const now = context.currentTime;
    if (fireLevel > .1 && now >= nextCrackle) {
      noise(now + .01, .035 + Math.random() * .045, .045 * fireLevel, 900 + Math.random() * 1800, (Math.random() - .5) * .3, 'lowpass', 280);
      nextCrackle = now + .3 + Math.random() * .65;
    }
    if (nextNote < now - .2) nextNote = now + .15;
    while (nextNote < now + .2) {
      const pattern = PHRASES[phrase % PHRASES.length]!;
      const degree = pattern[beat % pattern.length];
      if (degree !== null && degree !== undefined) {
        const velocity = (beat % 4 === 0 ? .78 : .54) + Math.random() * .09;
        handpan(NOTES[degree]!, nextNote, velocity * (night ? .88 : 1), Math.sin(beat * 1.8) * .27);
        if (beat % 8 === 4) handpan(NOTES[0]! / 2, nextNote + .035, .32, -.12);
      }
      nextNote += (night ? 1.42 : 1.29) + (Math.random() - .5) * .07;
      beat++;
      if (beat % pattern.length === 0) { phrase++; nextNote += .55; }
    }
  }
  function ambient(gain: GainNode | undefined, value: number, maximum: number) {
    if (!gain || !context) return;
    gain.gain.setTargetAtTime(clamp(value) * maximum, context.currentTime, .65);
  }
  function makeAmbient(frequency: number, type: BiquadFilterType, highpass: number) {
    const source = keep(context!.createBufferSource()); source.buffer = noiseBuffer!; source.loop = true;
    const filter = keep(context!.createBiquadFilter()); filter.type = type; filter.frequency.value = frequency; filter.Q.value = .5;
    const high = keep(context!.createBiquadFilter()); high.type = 'highpass'; high.frequency.value = highpass;
    const gain = keep(context!.createGain()); gain.gain.value = 0;
    source.connect(filter); filter.connect(high); high.connect(gain); gain.connect(effects!);
    source.start(); ambientSources.push(source); return gain;
  }
  function create() {
    if (context) return true;
    const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) { report('unavailable'); return false; }
    try {
      context = new Constructor({ latencyHint: 'interactive' });
      master = keep(context.createGain()); master.gain.value = 0;
      const compressor = keep(context.createDynamicsCompressor());
      compressor.threshold.value = -18; compressor.knee.value = 16; compressor.ratio.value = 3;
      compressor.attack.value = .008; compressor.release.value = .25;
      const soften = keep(context.createBiquadFilter()); soften.type = 'lowpass'; soften.frequency.value = 6500; soften.Q.value = .3;
      master.connect(soften); soften.connect(compressor); compressor.connect(context.destination);
      music = keep(context.createGain()); music.gain.value = .72; music.connect(master);
      effects = keep(context.createGain()); effects.gain.value = .85; effects.connect(master);
      reverb = keep(context.createConvolver());
      const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 2.15), context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel); let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = last * .63 + (Math.random() * 2 - 1) * .37;
          data[i] = last * Math.pow(1 - i / data.length, 3.2) * .5;
        }
      }
      reverb.buffer = impulse;
      const room = keep(context.createGain()); room.gain.value = .24; reverb.connect(room); room.connect(master);
      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 4), context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .75;
      rainGain = makeAmbient(3600, 'lowpass', 420);
      fireGain = makeAmbient(900, 'lowpass', 100);
      ambient(rainGain, rainLevel, .052); ambient(fireGain, fireLevel, .035);
      return true;
    } catch {
      report('unavailable'); return false;
    }
  }
  function stopScheduler() { if (timer !== undefined) clearInterval(timer); timer = undefined; }
  async function start() {
    if (destroyed || document.hidden || muted) return;
    if (activation) return activation;
    activation = (async () => {
      if (!create() || !context) return;
      if (suspendTimer !== undefined) clearTimeout(suspendTimer); suspendTimer = undefined;
      try {
        await context.resume();
        if (destroyed || muted || document.hidden) return;
        if (context.state !== 'running') { report('waiting'); return; }
        master!.gain.cancelScheduledValues(context.currentTime);
        master!.gain.setTargetAtTime(.32, context.currentTime, .12);
        report('playing');
        for (const pending of pendingEffects.splice(0)) {
          if (performance.now() - pending.at < 350) controller.play(pending.type, pending.pan, pending.intensity);
        }
        if (timer === undefined) { nextNote = context.currentTime + .2; schedule(); timer = setInterval(schedule, 90); }
      } catch { report('waiting'); }
    })();
    try { await activation; } finally { activation = undefined; }
  }
  function hush(next: SoundState, immediate = false) {
    stopScheduler(); pendingEffects.length = 0; report(next);
    if (!context || !master) return;
    if (suspendTimer !== undefined) clearTimeout(suspendTimer);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0, context.currentTime, immediate ? .015 : .05);
    suspendTimer = setTimeout(() => {
      suspendTimer = undefined;
      releaseVoices();
      void context?.suspend().catch(() => {});
    }, immediate ? 60 : 220);
  }
  function visibility() {
    if (destroyed) return;
    if (document.hidden) hush(muted ? 'muted' : 'waiting', true);
    // Returning remains quiet until the next pointer/keyboard gesture calls unlock.
  }
  document.addEventListener('visibilitychange', visibility);
  report(muted ? 'muted' : 'waiting');

  const controller = {
    async unlock() { if (!muted && !destroyed && state !== 'playing') await start(); },
    async toggle() {
      if (destroyed || state === 'unavailable') return;
      if (state === 'playing') { muted = true; remember(); hush('muted'); }
      else { muted = false; remember(); await start(); }
    },
    play(type: SoundEffect, pan = 0, intensity = 1) {
      if (destroyed || document.hidden || muted) return;
      if (state !== 'playing') {
        if (activation && pendingEffects.length < 4) pendingEffects.push({ type, pan, intensity, at: performance.now() });
        return;
      }
      if (!context) return;
      const now = context.currentTime;
      const cooldown = type === 'boat' || type === 'palm' ? .35 : type === 'water' ? .12 : .07;
      if (now - (lastEffect.get(type) ?? -10) < cooldown || voices.size > 72) return;
      lastEffect.set(type, now);
      const volume = clamp(intensity, .15, 1.2), side = clamp(pan, -.8, .8);
      switch (type) {
        case 'water':
          noise(now, .48, .12 * volume, 1700, side, 'lowpass', 500);
          for (let i = 0; i < 4; i++) tone(600 + Math.random() * 550, now + .03 + i * .065, .16, .055 * volume, side + (Math.random() - .5) * .15, 210 + Math.random() * 180);
          break;
        case 'coconut':
          tone(210, now, .27, .19 * volume, side, 62); noise(now + .035, .72, .18 * volume, 2000, side, 'lowpass', 350);
          tone(440, now + .12, .19, .045 * volume, side, 130); break;
        case 'boat':
          noise(now, .65, .10 * volume, 600, side, 'lowpass', 210);
          tone(185, now + .025, .32, .038 * volume, side, 165); tone(370, now + .05, .21, .012 * volume, side, 330); break;
        case 'palm': noise(now, .65, .09 * volume, 1800, side, 'bandpass', 2900); noise(now + .17, .45, .045 * volume, 3500, side, 'lowpass', 1400); break;
        case 'window': tone(420, now, .055, .07 * volume, side, 300); noise(now + .025, .31, .05 * volume, 900, side, 'bandpass', 500); tone(150, now + .13, .10, .03 * volume, side, 125); break;
        case 'cork': tone(360, now, .11, .17 * volume, side, 105); noise(now + .015, .07, .12 * volume, 1700, side, 'lowpass', 500); break;
        case 'paperOpen': noise(now, 1.15, .08 * volume, 1800, side, 'bandpass', 800); noise(now + .15, .65, .04 * volume, 3300, side, 'lowpass', 1700); break;
        case 'paperClose': noise(now, .64, .07 * volume, 1000, side, 'bandpass', 2200); break;
        case 'birds': for (let i = 0; i < 3; i++) { tone(1500 + i * 220, now + i * .15, .12, .025 * volume, side, 2250 + i * 160); tone(2200, now + i * .15 + .09, .08, .016 * volume, side, 1650); } break;
        case 'jump': tone(290, now, .14, .06 * volume, side, 450); break;
        case 'land': noise(now, .06, .05 * volume, 650, side, 'lowpass', 180); tone(110, now, .08, .055 * volume, side, 75); break;
        case 'gameOver': tone(220, now, .22, .075 * volume, side, 146.832); tone(146.832, now + .14, .34, .055 * volume, side); break;
        case 'gameStart': handpan(NOTES[3]!, now, .38, side); break;
        case 'celestial': handpan(night ? NOTES[0]! : NOTES[5]!, now, .42, -.12); handpan(night ? NOTES[3]! : NOTES[6]!, now + .23, .28, .12); break;
        case 'language': tone(660, now, .11, .026 * volume, side, 590); break;
      }
    },
    setRain(level: number) { rainLevel = clamp(level); ambient(rainGain, rainLevel, .052); },
    setFire(level: number) {
      const before = fireLevel; fireLevel = clamp(level); ambient(fireGain, fireLevel, .035);
      if (context && state === 'playing' && fireLevel > .15 && before < .15) {
        for (let i = 0; i < 5; i++) noise(context.currentTime + i * .19, .04 + Math.random() * .06, .045, 1300 + Math.random() * 900, (Math.random() - .5) * .25, 'lowpass', 300);
      }
    },
    setNight(value: boolean) { night = value; },
    destroy() {
      if (destroyed) return;
      destroyed = true; stopScheduler();
      if (suspendTimer !== undefined) clearTimeout(suspendTimer);
      document.removeEventListener('visibilitychange', visibility);
      releaseVoices(); ambientSources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
      nodes.forEach(node => node.disconnect()); nodes.clear(); lastEffect.clear(); pendingEffects.length = 0;
      void context?.close().catch(() => {});
    },
  };
  return controller;
}
