export type SoundEffect = 'water' | 'boat' | 'palm' | 'window' | 'coconut' | 'cork' | 'paperOpen' | 'paperClose' | 'birds' | 'jump' | 'land' | 'gameOver' | 'gameStart' | 'celestial' | 'language';
export type SoundState = 'waiting' | 'playing' | 'muted' | 'unavailable';

const PREFERENCE = 'kochi-labs-sound-muted';
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const PHRASES = [
  ['D4', 'A4', null, 'G4', 'F4', null, 'D4', null],
  ['D4', null, 'F4', 'G4', null, 'A4', 'G4', null],
  ['F4', 'A4', null, 'C5', 'A4', null, 'G4', null],
  ['D4', 'F4', null, 'G4', 'F4', null, 'D4', null],
] as const;
type Bed = 'water' | 'birds' | 'crickets' | 'rain' | 'fire';
const BED_FILES: Record<Bed, string> = {
  water: 'ambience-water', birds: 'ambience-birds', crickets: 'ambience-crickets',
  rain: 'foley-rain', fire: 'foley-fire',
};
const EFFECT_FILES: Record<SoundEffect, string> = {
  water: 'foley-splash', coconut: 'foley-splash', boat: 'foley-wood', palm: 'foley-leaves',
  window: 'foley-window', cork: 'foley-cork', paperOpen: 'foley-paper', paperClose: 'foley-paper',
  birds: 'ambience-birds', jump: 'foley-step', land: 'foley-step', gameOver: 'foley-wood',
  gameStart: 'handpan/D4-1', celestial: 'handpan/A4-1', language: 'foley-paper',
};

/** Real instrument takes and field recordings. No oscillator/noise substitutes. */
export function createSoundscape(onState?: (state: SoundState) => void) {
  let context: AudioContext | undefined;
  let master: GainNode, music: GainNode, effects: GainNode;
  let state: SoundState = 'waiting', muted = false, destroyed = false, night = false;
  let rain = 0, fire = 0, beat = 0, phrase = 0, lastTake = 0, nextNote = 0;
  let activation: Promise<void> | undefined, loading: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  const buffers = new Map<string, AudioBuffer>();
  const nodes = new Set<AudioNode>();
  const voices = new Set<{ source: AudioBufferSourceNode; finish: () => void }>();
  const beds = new Map<Bed, { gain: GainNode; next: number }>();
  const lastEffect = new Map<SoundEffect, number>();
  const pending: { type: SoundEffect; pan: number; intensity: number; at: number }[] = [];
  const abort = new AbortController();
  try { muted = localStorage.getItem(PREFERENCE) === 'true'; } catch { /* Optional preference. */ }
  const report = (value: SoundState) => { state = value; onState?.(value); };
  const keep = <T extends AudioNode>(node: T): T => { nodes.add(node); return node; };
  function remember() { try { localStorage.setItem(PREFERENCE, String(muted)); } catch { /* Optional preference. */ } }

  function release() {
    for (const voice of [...voices]) {
      try { voice.source.stop(); } catch { /* Ended. */ }
      voice.finish();
    }
    beds.forEach(bed => { bed.next = 0; });
  }
  function sample(file: string, at: number, strength: number, pan: number, destination: AudioNode, options: { offset?: number; duration?: number; fade?: number; ambience?: boolean } = {}) {
    const buffer = buffers.get(file);
    // Reserve space for two overlapping voices per bed even during rapid clicks.
    if (!context || !buffer || destroyed || voices.size >= (options.ambience ? 32 : 20)) return false;
    const offset = clamp(options.offset ?? 0, 0, Math.max(0, buffer.duration - .05));
    const duration = Math.min(options.duration ?? buffer.duration, buffer.duration - offset);
    const fade = Math.min(options.fade ?? .025, duration / 3);
    const source = context.createBufferSource(), gain = context.createGain(), panner = context.createStereoPanner();
    source.buffer = buffer; // Original pitch preserves a real handpan's resonant overtones.
    panner.pan.value = clamp(pan, -.8, .8);
    source.connect(gain); gain.connect(panner); panner.connect(destination);
    gain.gain.setValueAtTime(0, at);
    if (options.fade) {
      // Equal-power overlap conceals the seam between two field-recording excerpts.
      const curve = Float32Array.from({ length: 32 }, (_, i) => Math.sin(i / 31 * Math.PI / 2) * strength);
      gain.gain.setValueCurveAtTime(curve, at, fade);
      gain.gain.setValueAtTime(strength, at + duration - fade);
      gain.gain.setValueCurveAtTime(Float32Array.from(curve).reverse(), at + duration - fade, fade);
    } else {
      gain.gain.linearRampToValueAtTime(strength, at + .006);
      gain.gain.setValueAtTime(strength, at + duration - fade);
      gain.gain.linearRampToValueAtTime(0, at + duration);
    }
    let ended = false;
    const voice = { source, finish() {
      if (ended) return;
      ended = true; source.disconnect(); gain.disconnect(); panner.disconnect(); voices.delete(voice);
    } };
    source.onended = voice.finish; voices.add(voice);
    source.start(at, offset, duration); source.stop(at + duration + .02);
    return true;
  }
  function mixBeds() {
    if (!context) return;
    const levels: Record<Bed, number> = {
      water: .22, birds: night ? 0 : .26 * (1 - rain * .6), crickets: night ? .18 * (1 - rain * .5) : 0,
      rain: rain * .27, fire: fire * .2,
    };
    beds.forEach((bed, name) => bed.gain.gain.setTargetAtTime(levels[name], context!.currentTime, .9));
  }
  function handpan(note: string, at: number, strength: number, pan: number) {
    lastTake = lastTake === 1 ? 2 : 1;
    sample(`handpan/${note}-${lastTake}`, at, strength, pan, music);
  }
  function schedule() {
    if (!context || state !== 'playing' || document.hidden) return;
    const now = context.currentTime;
    beds.forEach((bed, name) => {
      const file = BED_FILES[name], buffer = buffers.get(file);
      if (!buffer) return;
      if (bed.next < now) bed.next = now + .05;
      if (bed.next < now + .3) {
        const overlap = Math.min(3, buffer.duration / 5);
        if (sample(file, bed.next, 1, name === 'birds' ? -.18 : name === 'crickets' ? .18 : 0, bed.gain, { fade: overlap, ambience: true })) {
          bed.next += buffer.duration - overlap;
        }
      }
    });
    if (nextNote < now - .2) nextNote = now + .35;
    if (nextNote > now + .25) return;
    const pattern = PHRASES[phrase % PHRASES.length]!;
    const note = pattern[beat % pattern.length];
    if (note) {
      handpan(note, nextNote, (beat % 4 === 0 ? .76 : .57) + Math.random() * .09, Math.sin(beat * .7) * .13);
      if (beat === 0 && phrase % 2 === 0) handpan('A3', nextNote + .11, .24, -.15);
    }
    // Small timing and touch differences, long rests, no mechanical click or pitch shifting.
    nextNote += (night ? 1.9 : 1.72) + (Math.random() - .5) * .24;
    beat++;
    if (beat >= pattern.length) { beat = 0; phrase++; nextNote += 1.3 + Math.random() * .8; }
  }
  function create() {
    if (context) return;
    const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error('Web Audio unavailable');
    context = new Constructor({ latencyHint: 'interactive' });
    master = keep(context.createGain()); master.gain.value = 0;
    const limiter = keep(context.createDynamicsCompressor());
    limiter.threshold.value = -15; limiter.knee.value = 18; limiter.ratio.value = 3;
    limiter.attack.value = .015; limiter.release.value = .35;
    master.connect(limiter); limiter.connect(context.destination);
    music = keep(context.createGain()); music.gain.value = .58; music.connect(master);
    effects = keep(context.createGain()); effects.gain.value = .68; effects.connect(master);
    for (const name of Object.keys(BED_FILES) as Bed[]) {
      const gain = keep(context.createGain()); gain.gain.value = 0; gain.connect(master);
      beds.set(name, { gain, next: 0 });
    }
    mixBeds();
    const notes = ['A3', 'D4', 'F4', 'G4', 'A4', 'C5'];
    const files = new Set([...Object.values(BED_FILES), ...Object.values(EFFECT_FILES), ...notes.flatMap(note => [1, 2].map(take => `handpan/${note}-${take}`))]);
    loading = Promise.all([...files].map(async file => {
      try {
        const response = await fetch(`/audio/${file}.mp3`, { signal: abort.signal });
        if (!response.ok) throw new Error(`Audio asset ${response.status}`);
        const buffer = await context!.decodeAudioData(await response.arrayBuffer());
        if (!destroyed) buffers.set(file, buffer);
      } catch (error) { if (!destroyed) console.warn(`Could not load recording: ${file}`, error); }
    })).then(() => {});
  }
  function stopScheduler() { if (timer !== undefined) clearInterval(timer); timer = undefined; }
  async function start() {
    if (destroyed || document.hidden || muted) return;
    if (activation) return activation;
    activation = (async () => {
      try {
        create();
        if (suspendTimer !== undefined) clearTimeout(suspendTimer); suspendTimer = undefined;
        await context!.resume();
        await loading;
        if (destroyed || muted || document.hidden) return;
        if (!buffers.size) { report('unavailable'); return; }
        if (context!.state !== 'running') { report('waiting'); return; }
        master.gain.cancelScheduledValues(context!.currentTime);
        master.gain.setTargetAtTime(.68, context!.currentTime, .35);
        report('playing'); mixBeds();
        for (const item of pending.splice(0)) if (performance.now() - item.at < 1200) controller.play(item.type, item.pan, item.intensity);
        if (timer === undefined) { nextNote = context!.currentTime + .5; schedule(); timer = setInterval(schedule, 100); }
      } catch { report('unavailable'); }
    })();
    try { await activation; } finally { activation = undefined; }
  }
  function hush(next: SoundState, immediate = false) {
    stopScheduler(); pending.length = 0; report(next);
    if (!context) return;
    if (suspendTimer !== undefined) clearTimeout(suspendTimer);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0, context.currentTime, immediate ? .015 : .06);
    suspendTimer = setTimeout(() => { suspendTimer = undefined; release(); void context?.suspend().catch(() => {}); }, immediate ? 70 : 300);
  }
  function visibility() { if (!destroyed && document.hidden) hush(muted ? 'muted' : 'waiting', true); }
  document.addEventListener('visibilitychange', visibility);
  report(muted ? 'muted' : 'waiting');
  const controller = {
    async unlock() { if (!muted && !destroyed && state !== 'playing') await start(); },
    async toggle() {
      if (destroyed) return;
      if (state === 'playing' || activation) { muted = true; remember(); hush('muted'); }
      else { muted = false; remember(); await start(); }
    },
    play(type: SoundEffect, pan = 0, intensity = 1) {
      if (destroyed || document.hidden || muted) return;
      if (state !== 'playing') {
        if (activation && pending.length < 4) pending.push({ type, pan, intensity, at: performance.now() });
        return;
      }
      if (!context) return;
      const now = context.currentTime;
      if (now - (lastEffect.get(type) ?? -10) < (type === 'water' ? .18 : .3)) return;
      lastEffect.set(type, now);
      const volume = clamp(intensity, .15, 1.2);
      const options: { offset?: number; duration?: number; fade?: number } = {};
      let strength = .72 * volume;
      if (type === 'birds') { if (night) return; options.duration = 3; options.fade = .4; strength = .2 * volume; }
      if (type === 'language') { options.duration = .2; strength = .16 * volume; }
      if (type === 'paperClose') { options.duration = .68; strength *= .7; }
      if (type === 'jump' || type === 'land') strength *= .48;
      if (type === 'water') strength *= .65;
      if (type === 'celestial' || type === 'gameStart') strength *= .65;
      sample(EFFECT_FILES[type], now, strength, pan, effects, options);
      if (type === 'boat') sample('ambience-water', now + .08, .3 * volume, pan, effects, { offset: 4, duration: 1.6, fade: .35 });
    },
    setRain(value: number) { rain = clamp(value); mixBeds(); },
    setFire(value: number) { fire = clamp(value); mixBeds(); },
    setNight(value: boolean) { night = value; mixBeds(); },
    destroy() {
      if (destroyed) return;
      destroyed = true; abort.abort(); stopScheduler();
      if (suspendTimer !== undefined) clearTimeout(suspendTimer);
      document.removeEventListener('visibilitychange', visibility);
      release(); nodes.forEach(node => node.disconnect()); nodes.clear(); buffers.clear(); pending.length = 0;
      void context?.close().catch(() => {});
    },
  };
  return controller;
}
