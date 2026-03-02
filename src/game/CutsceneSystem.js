import { gameContext } from './gameContext.js';
import { SoundManager } from '../systems/SoundManager.js';
import { ui } from '../ui/UI.js';

const cutsceneNarration = [
  "The world changed when the fossil fuels ran out.",
  "For decades, humanity ignored the warnings...\nburning oil, coal, and gas until there was nothing left.",
  "The power grid collapsed. Cities went dark.\nWithout energy, civilization crumbled.",
  "Then came the plague.\nSomething in the poisoned air... it turned people.",
  "The dead began to rise, twisted by the toxic remnants\nof a world addicted to fossil fuels.",
  "The last defense manager stationed here...\ndid not make it.",
  "Now it's your turn.",
  "Keep the remaining survivors alive.\nBuild renewable energy. Defend the city.\n\nThis is Power Defense.",
];

export function playCutscene() {
  const ctx = gameContext;
  ctx.cutsceneActive = true;
  const overlay = document.getElementById('cutscene-overlay');
  const textEl = document.getElementById('cutscene-text');
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  overlay.style.background = '#000';

  ctx.renderer.domElement.style.opacity = '0';

  let lineIndex = 0;
  let skipped = false;

  function skipCutscene() {
    if (skipped) return;
    skipped = true;
    overlay.style.opacity = '0';
    ctx.renderer.domElement.style.opacity = '1';
    const { defaultCameraPos } = ctx;
    ctx.camera.position.set(defaultCameraPos.x, defaultCameraPos.y, defaultCameraPos.z);
    ctx.camera.lookAt(0, 0, 0);
    setTimeout(() => {
      overlay.style.display = 'none';
      ctx.cutsceneActive = false;
      startGameplay();
    }, 500);
  }

  function onSkipKey(e) {
    if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
      e.preventDefault();
      skipCutscene();
      window.removeEventListener('keydown', onSkipKey);
    }
  }
  window.addEventListener('keydown', onSkipKey);

  function showNextLine() {
    if (skipped) return;

    if (lineIndex >= cutsceneNarration.length) {
      textEl.classList.remove('visible');
      textEl.classList.add('fade-out');
      setTimeout(() => {
        if (skipped) return;
        startCameraAnimation(overlay, () => {
          window.removeEventListener('keydown', onSkipKey);
          ctx.cutsceneActive = false;
          startGameplay();
        });
      }, 1000);
      return;
    }

    textEl.classList.remove('visible');
    textEl.classList.add('fade-out');

    setTimeout(() => {
      if (skipped) return;
      textEl.innerHTML = cutsceneNarration[lineIndex].replace(/\n/g, '<br>');
      textEl.classList.remove('fade-out');
      textEl.classList.add('visible');
      lineIndex++;
      const displayTime = Math.max(2500, cutsceneNarration[lineIndex - 1].length * 35);
      setTimeout(showNextLine, displayTime);
    }, 600);
  }

  setTimeout(showNextLine, 1000);
}

function startCameraAnimation(overlay, onComplete) {
  const ctx = gameContext;

  ctx.renderer.domElement.style.transition = 'opacity 1.5s ease';
  ctx.renderer.domElement.style.opacity = '1';
  overlay.style.background = 'transparent';
  overlay.style.transition = 'opacity 2s ease';
  overlay.style.opacity = '0';

  const { defaultCameraPos } = ctx;
  const phases = [
    {
      startPos:    { x: -35, y: 4, z: 15 }, startLookAt: { x: 0, y: 2, z: 0 },
      endPos:      { x: 25, y: 5, z: 18 },  endLookAt:   { x: 0, y: 2, z: 0 },
      duration: 5000,
    },
    {
      startPos:    { x: 25, y: 5, z: 18 },               startLookAt: { x: 0, y: 2, z: 0 },
      endPos:      { x: defaultCameraPos.x, y: defaultCameraPos.y, z: defaultCameraPos.z },
      endLookAt:   { x: 0, y: 0, z: 0 },
      duration: 3000,
    },
  ];

  let currentPhase = 0;
  let phaseStartTime = performance.now();

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function animateCamera(timestamp) {
    if (!ctx.cutsceneActive) return;

    const phase = phases[currentPhase];
    const elapsed = timestamp - phaseStartTime;
    const rawT = Math.min(elapsed / phase.duration, 1);
    const t = easeInOutCubic(rawT);

    ctx.camera.position.set(
      lerp(phase.startPos.x, phase.endPos.x, t),
      lerp(phase.startPos.y, phase.endPos.y, t),
      lerp(phase.startPos.z, phase.endPos.z, t)
    );
    ctx.camera.lookAt(
      lerp(phase.startLookAt.x, phase.endLookAt.x, t),
      lerp(phase.startLookAt.y, phase.endLookAt.y, t),
      lerp(phase.startLookAt.z, phase.endLookAt.z, t)
    );

    ctx.renderer.render(ctx.scene, ctx.camera);

    if (rawT >= 1) {
      currentPhase++;
      if (currentPhase >= phases.length) {
        overlay.style.display = 'none';
        onComplete();
        return;
      }
      phaseStartTime = timestamp;
    }

    requestAnimationFrame(animateCamera);
  }

  const p0 = phases[0];
  ctx.camera.position.set(p0.startPos.x, p0.startPos.y, p0.startPos.z);
  ctx.camera.lookAt(p0.startLookAt.x, p0.startLookAt.y, p0.startLookAt.z);
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(animateCamera);
}

export function startGameplay() {
  const ctx = gameContext;
  if (ctx.gameStarted) return;
  ctx.gameStarted = true;

  const { defaultCameraPos } = ctx;
  ctx.camera.position.set(defaultCameraPos.x, defaultCameraPos.y, defaultCameraPos.z);
  ctx.camera.lookAt(0, 0, 0);

  if (ui.container) ui.container.style.display = 'flex';

  console.log('Game starting!');
  ctx.lastFrameTime = 0;
  ctx.spawnAccumulator = 0;

  // gameLoop is registered on gameContext by Game.js to avoid circular import
  if (ctx._gameLoop) requestAnimationFrame(ctx._gameLoop);
}
