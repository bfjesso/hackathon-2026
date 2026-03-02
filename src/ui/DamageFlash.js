const damageFlash = document.createElement('div');
damageFlash.style.cssText = `
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(ellipse at center, rgba(255, 0, 0, 0) 0%, rgba(255, 0, 0, 0.6) 100%);
  pointer-events: none;
  opacity: 0;
  z-index: 50;
`;
document.body.appendChild(damageFlash);

let lastDamageFlashTime = 0;
const damageFlashCooldown = 500;

export function triggerDamageFlash() {
  const now = Date.now();
  if (now - lastDamageFlashTime < damageFlashCooldown) return;
  lastDamageFlashTime = now;

  damageFlash.style.transition = 'none';
  damageFlash.style.opacity = '1';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      damageFlash.style.transition = 'opacity 0.4s ease-out';
      damageFlash.style.opacity = '0';
    });
  });
}

// Expose on window so Zombie/BigZombie can call it without importing
// (avoids a circular dependency path through the module graph)
window.__triggerDamageFlash = triggerDamageFlash;
