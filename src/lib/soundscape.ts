export type SoundEffect = 'water' | 'boat' | 'palm' | 'window' | 'coconut' | 'cork' | 'paperOpen' | 'paperClose' | 'birds' | 'jump' | 'land' | 'gameOver' | 'gameStart' | 'celestial' | 'language';
export type SoundState = 'waiting' | 'playing' | 'muted' | 'unavailable';
export type SceneSoundMotion = { metroPan: number; metroMoving: boolean; boatPan: number; boatSpeed: number; boatDragging: boolean };

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const PHRASES = [
  ['D4', 'A4', null, 'G4', 'F4', null, 'D4', null],
  ['D4', null, 'F4', 'G4', null, 'A4', 'G4', null],
  ['F4', 'A4', null, 'C5', 'A4', null, 'G4', null],
  ['D4', 'F4', null, 'G4', 'F4', null, 'D4', null],
] as const;
type Bed = 'water' | 'birds' | 'crickets' | 'rain' | 'fire';
// Listener faces -Z. Broad stereo fields keep their two recorded channels.
const BED_SPACE: Record<Bed, { width: number; height: number; depth: number }> = {
  water: { width: 1.6, height: -.55, depth: -1.3 },
  birds: { width: 2.1, height: 1.2, depth: -2.2 },
  crickets: { width: 2.4, height: -.2, depth: .8 },
  rain: { width: 1.8, height: 2.4, depth: -.6 },
  fire: { width: .65, height: .3, depth: -2.8 },
};
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
  let depthFilter: BiquadFilterNode | undefined;
  let waterDepth = 0;
  let state: SoundState = 'waiting', muted = false, destroyed = false, night = false;
  let rain = 0, fire = 0, beat = 0, phrase = 0, lastTake = 0, nextNote = 0;
  let activation: Promise<void> | undefined, loading: Promise<void> | undefined;
  let activationVersion = 0, autoAttempted = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  const buffers = new Map<string, AudioBuffer>();
  const nodes = new Set<AudioNode>();
  const voices = new Set<{ source: AudioBufferSourceNode; finish: () => void }>();
  const beds = new Map<Bed, { gain: GainNode; next: number }>();
  const movers = new Map<'metro' | 'boat', { gain: GainNode; panner: PannerNode; next: number }>();
  let motion: SceneSoundMotion = { metroPan: 0, metroMoving: false, boatPan: 0, boatSpeed: 0, boatDragging: false };
  let lastMotionUpdate = -1;
  const lastEffect = new Map<SoundEffect, number>();
  const pending: { type: SoundEffect; pan: number; intensity: number; at: number }[] = [];
  const abort = new AbortController();
  const report = (value: SoundState) => { state = value; onState?.(value); };
  const keep = <T extends AudioNode>(node: T): T => { nodes.add(node); return node; };
  function depthCutoff() {
    const surfaceHz = Math.min(22000, context!.sampleRate / 2);
    return surfaceHz * Math.pow(550 / surfaceHz, waterDepth);
  }
  function spatialPanner(x: number, y: number, z: number) {
    const panner = context!.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = .12;
    panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z;
    return panner;
  }

  function release() {
    for (const voice of [...voices]) {
      try { voice.source.stop(); } catch { /* Ended. */ }
      voice.finish();
    }
    beds.forEach(bed => { bed.next = 0; });
    movers.forEach(mover => { mover.next = 0; });
  }
  function sample(file: string, at: number, strength: number, pan: number, destination: AudioNode, options: { offset?: number; duration?: number; fade?: number; ambience?: boolean; attack?: number } = {}) {
    const buffer = buffers.get(file);
    // Reserve space for two overlapping voices per bed even during rapid clicks.
    if (!context || !buffer || destroyed || voices.size >= (options.ambience ? 32 : 16)) return false;
    const offset = clamp(options.offset ?? 0, 0, Math.max(0, buffer.duration - .05));
    const duration = Math.min(options.duration ?? buffer.duration, buffer.duration - offset);
    const fade = Math.min(options.fade ?? .025, duration / 3);
    const source = context.createBufferSource(), gain = context.createGain();
    // Ambient channels are spatialized once on their shared bus, so crossfades
    // never jump between positions. Local interactions follow their screen X.
    const spatial = !options.ambience;
    const height = file.includes('birds') || file.includes('leaves') ? .9 : file.includes('splash') || file.includes('step') ? -.5 : 0;
    const panner = spatial ? spatialPanner(clamp(pan, -.8, .8) * 2.2, height, file.startsWith('handpan/') ? -1.6 : -1.1) : context.createStereoPanner();
    source.buffer = buffer; // Original pitch preserves a real handpan's resonant overtones.
    source.connect(gain); gain.connect(panner); panner.connect(destination);
    gain.gain.setValueAtTime(0, at);
    if (options.fade) {
      // Equal-power overlap conceals the seam between two field-recording excerpts.
      const curve = Float32Array.from({ length: 32 }, (_, i) => Math.sin(i / 31 * Math.PI / 2) * strength);
      gain.gain.setValueCurveAtTime(curve, at, fade);
      gain.gain.setValueAtTime(strength, at + duration - fade);
      gain.gain.setValueCurveAtTime(Float32Array.from(curve).reverse(), at + duration - fade, fade);
    } else {
      gain.gain.linearRampToValueAtTime(strength, at + Math.min(options.attack ?? (file.startsWith('handpan/') ? .022 : .012), duration / 4));
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
      water: .42, birds: night ? 0 : .14 * (1 - rain * .45), crickets: night ? .26 * (1 - rain * .4) : 0,
      rain: rain * .27, fire: fire * .2,
    };
    // About six seconds to settle: no abrupt wildlife or weather switch.
    beds.forEach((bed, name) => bed.gain.gain.setTargetAtTime(levels[name], context!.currentTime, 2));
  }
  function moveSounds(force = false) {
    if (!context || state !== 'playing') return;
    const now = context.currentTime;
    if (!force && now - lastMotionUpdate < 1 / 30) return;
    lastMotionUpdate = now;
    const metro = movers.get('metro'), boat = movers.get('boat');
    if (metro) {
      const edge = clamp((Math.abs(motion.metroPan) - .78) / .3);
      const visibility = 1 - edge * edge * (3 - 2 * edge);
      metro.panner.positionX.setTargetAtTime(clamp(motion.metroPan, -1.4, 1.4) * 3.2, now, .06);
      // Fade away before the offscreen wrap, so it never sweeps across the
      // listener when the visual train resets to the opposite edge.
      metro.gain.gain.setTargetAtTime(motion.metroMoving ? .42 * visibility : 0, now, .18);
    }
    if (boat) {
      boat.panner.positionX.setTargetAtTime(clamp(motion.boatPan, -1, 1) * 2.7, now, .055);
      const speed = Math.abs(motion.boatSpeed);
      const movement = clamp(speed / 90);
      const level = motion.boatDragging ? .12 + .7 * movement : speed > 3 ? .035 + .515 * movement : .55 * movement;
      boat.gain.gain.setTargetAtTime(level, now, .16);
    }
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
      if (name === 'birds') {
        // A brief distant call, then 18–34 seconds of quiet; never a chorus loop.
        if (bed.next === 0) bed.next = now + 6 + Math.random() * 8;
        if (night) { bed.next = Math.max(bed.next, now + 10); return; }
        if (bed.next < now) bed.next = now + .05;
        if (bed.next < now + .3) {
          const duration = Math.min(2.4 + Math.random() * 1.2, buffer.duration);
          const offset = Math.random() * Math.max(0, buffer.duration - duration);
          if (sample(file, bed.next, .72, 0, bed.gain, { offset, duration, fade: .55, ambience: true })) {
            bed.next += duration + 18 + Math.random() * 16;
          }
        }
        return;
      }
      if (bed.next < now) bed.next = now + .05;
      if (bed.next < now + .3) {
        const overlap = Math.min(5, buffer.duration / 5);
        if (sample(file, bed.next, 1, name === 'crickets' ? .18 : 0, bed.gain, { fade: overlap, ambience: true })) {
          bed.next += buffer.duration - overlap;
        }
      }
    });
    moveSounds();
    movers.forEach((mover, name) => {
      const file = name === 'metro' ? 'metro-roll' : 'ambience-water';
      const buffer = buffers.get(file);
      if (!buffer) return;
      const offset = name === 'boat' ? Math.min(8, buffer.duration / 4) : 0;
      const duration = buffer.duration - offset;
      if (mover.next < now) mover.next = now + .04;
      if (mover.next < now + .3) {
        const fade = Math.min(2, duration / 5);
        if (sample(file, mover.next, 1, 0, mover.gain, { offset, duration, fade, ambience: true })) mover.next += duration - fade;
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
    depthFilter = keep(context.createBiquadFilter());
    depthFilter.type = 'lowpass';
    depthFilter.Q.value = -3;
    depthFilter.frequency.value = depthCutoff();
    master.connect(depthFilter); depthFilter.connect(limiter); limiter.connect(context.destination);
    music = keep(context.createGain()); music.gain.value = .40;
    const warmth = keep(context.createBiquadFilter()); warmth.type = 'lowpass'; warmth.frequency.value = 3400; warmth.Q.value = .35;
    music.connect(warmth); warmth.connect(master);
    effects = keep(context.createGain()); effects.gain.value = .60; effects.connect(master);
    for (const name of Object.keys(BED_FILES) as Bed[]) {
      const gain = keep(context.createGain()); gain.gain.value = 0;
      const split = keep(context.createChannelSplitter(2));
      const field = BED_SPACE[name];
      // Separate, stable emitters preserve the original stereo field and add
      // binaural elevation/depth without spinning or modulating the recordings.
      const left = keep(spatialPanner(-field.width, field.height, field.depth));
      const right = keep(spatialPanner(field.width, field.height, field.depth));
      const blend = keep(context.createGain()); blend.gain.value = .88;
      gain.connect(split); split.connect(left, 0); split.connect(right, 1);
      left.connect(blend); right.connect(blend); blend.connect(master);
      beds.set(name, { gain, next: 0 });
    }
    for (const name of ['metro', 'boat'] as const) {
      const gain = keep(context.createGain()); gain.gain.value = 0;
      const panner = keep(spatialPanner(0, name === 'metro' ? .25 : -.5, name === 'metro' ? -1.7 : -.9));
      // A single persistent emitter follows each object; dragging never
      // restarts the recording or leaves water sounds at the previous position.
      gain.connect(panner); panner.connect(effects);
      movers.set(name, { gain, panner, next: 0 });
    }
    mixBeds();
    const notes = ['A3', 'D4', 'F4', 'G4', 'A4', 'C5'];
    const files = new Set(['metro-roll', ...Object.values(BED_FILES), ...Object.values(EFFECT_FILES), ...notes.flatMap(note => [1, 2].map(take => `handpan/${note}-${take}`))]);
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
  async function start(fromGesture = false) {
    if (destroyed || document.hidden || muted) return;
    // A browser can leave an autoplay resume() promise pending indefinitely.
    // A real gesture must issue a new resume() synchronously, never await that attempt.
    if (activation && !fromGesture) return activation;
    const version = ++activationVersion;
    const attempt = (async () => {
      try {
        create();
        if (suspendTimer !== undefined) clearTimeout(suspendTimer); suspendTimer = undefined;
        await context!.resume();
        if (destroyed || muted || document.hidden) {
          if (!destroyed) void context?.suspend().catch(() => {});
          return;
        }
        if (version !== activationVersion) return;
        await loading;
        if (destroyed || muted || document.hidden || version !== activationVersion) return;
        if (!buffers.size) { report('unavailable'); return; }
        if (context!.state !== 'running') { report('waiting'); return; }
        master.gain.cancelScheduledValues(context!.currentTime);
        master.gain.setTargetAtTime(.68, context!.currentTime, .7);
        report('playing'); mixBeds(); moveSounds(true);
        for (const item of pending.splice(0)) if (performance.now() - item.at < 1200) controller.play(item.type, item.pan, item.intensity);
        if (timer === undefined) { nextNote = context!.currentTime + .5; schedule(); timer = setInterval(schedule, 100); }
      } catch {
        if (!destroyed && !muted && version === activationVersion) report(context ? 'waiting' : 'unavailable');
      }
    })();
    activation = attempt;
    try { await attempt; } finally { if (activation === attempt) activation = undefined; }
  }
  function hush(next: SoundState, immediate = false) {
    ++activationVersion; activation = undefined;
    stopScheduler(); pending.length = 0; report(next);
    if (!context) return;
    if (suspendTimer !== undefined) clearTimeout(suspendTimer);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0, context.currentTime, immediate ? .015 : .1);
    suspendTimer = setTimeout(() => { suspendTimer = undefined; release(); void context?.suspend().catch(() => {}); }, immediate ? 70 : 500);
  }
  function visibility() { if (!destroyed && document.hidden) hush(muted ? 'muted' : 'waiting', true); }
  document.addEventListener('visibilitychange', visibility);
  // Sound starts enabled on every visit; mute applies only to this instance.
  report('waiting');
  const controller = {
    autostart() {
      if (autoAttempted || destroyed || muted) return;
      autoAttempted = true; void start();
    },
    async unlock() { if (!muted && !destroyed && state !== 'playing') await start(true); },
    async toggle() {
      if (destroyed) return;
      if (state === 'playing') { muted = true; hush('muted'); }
      else { muted = false; await start(true); }
    },
    play(type: SoundEffect, pan = 0, intensity = 1) {
      if (destroyed || document.hidden || muted || type === 'gameStart') return;
      if (state !== 'playing') {
        if (activation && pending.length < 4) pending.push({ type, pan, intensity, at: performance.now() });
        return;
      }
      if (!context) return;
      const now = context.currentTime;
      const cooldown = type === 'birds' ? 8 : type === 'jump' || type === 'land' ? .08 : type === 'water' ? .18 : .3;
      if (now - (lastEffect.get(type) ?? -10) < cooldown) return;
      lastEffect.set(type, now);
      const volume = clamp(intensity, .15, 1.2);
      const options: { offset?: number; duration?: number; fade?: number; attack?: number } = {};
      let strength = .72 * volume;
      if (type === 'birds') { if (night) return; options.duration = 1.8; options.fade = .4; strength = .07 * volume; }
      if (type === 'language') { options.duration = .2; strength = .16 * volume; }
      if (type === 'paperClose') { options.duration = .68; strength *= .7; }
      // Different dry portions of the CC0 sand-footstep recording: a fast
      // takeoff brush, then a slightly deeper contact when the dino lands.
      if (type === 'jump') { options.offset = .18; options.duration = .13; options.attack = .003; strength = .48 * volume; }
      if (type === 'land') { options.offset = .22; options.duration = .20; options.attack = .004; strength = .58 * volume; }
      if (type === 'water') strength *= .65;
      const musical = type === 'celestial';
      if (musical) strength *= .65;
      sample(EFFECT_FILES[type], now, strength, pan, musical ? music : effects, options);
    },
    setMotion(value: SceneSoundMotion) {
      if (destroyed) return;
      motion = { metroPan: clamp(value.metroPan, -2, 2), metroMoving: value.metroMoving,
        boatPan: clamp(value.boatPan, -1, 1), boatSpeed: clamp(value.boatSpeed, -2000, 2000), boatDragging: value.boatDragging };
      moveSounds();
    },
    setRain(value: number) { rain = clamp(value); mixBeds(); },
    setFire(value: number) { fire = clamp(value); mixBeds(); },
    setNight(value: boolean) { night = value; mixBeds(); },
    setDepth(progress: number) {
      const depth = clamp(progress);
      if (destroyed || depth === waterDepth) return;
      waterDepth = depth;
      if (context && depthFilter) depthFilter.frequency.setTargetAtTime(depthCutoff(), context.currentTime, .14);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; ++activationVersion; activation = undefined; abort.abort(); stopScheduler();
      if (suspendTimer !== undefined) clearTimeout(suspendTimer);
      document.removeEventListener('visibilitychange', visibility);
      release(); nodes.forEach(node => node.disconnect()); nodes.clear(); buffers.clear(); pending.length = 0;
      void context?.close().catch(() => {});
    },
  };
  return controller;
}
