export const SoundManager = (() => {
  let ctx = null;
  const sounds = {};

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  async function preload(name, src, volume = 1.0, cooldownMs = 0) {
    sounds[name] = { buffer: null, volume, cooldownMs, lastPlayed: 0 };
    try {
      const resp = await fetch(src);
      const arrayBuf = await resp.arrayBuffer();
      sounds[name].buffer = await getCtx().decodeAudioData(arrayBuf);
    } catch (e) {
      console.warn(`SoundManager: failed to load "${name}"`, e);
    }
  }

  function play(name) {
    const s = sounds[name];
    if (!s || !s.buffer) return;

    const now = performance.now();
    if (s.cooldownMs > 0 && now - s.lastPlayed < s.cooldownMs) return;
    s.lastPlayed = now;

    const c = getCtx();
    const source = c.createBufferSource();
    source.buffer = s.buffer;

    const gain = c.createGain();
    gain.gain.value = s.volume;

    source.connect(gain).connect(c.destination);
    source.start(0);
  }

  preload('build',     '/sounds/build.mp3',      0.5, 0);
  preload('explosion', '/sounds/explosion.mp3',   0.4, 300);
  preload('gunshot',   '/sounds/gun-shot.mp3',    0.3, 120);
  preload('splat',     '/sounds/splat.mp3',       0.5, 80);
  preload('newRound',  '/sounds/new-round.mp3',   0.6, 0);

  return { play };
})();
