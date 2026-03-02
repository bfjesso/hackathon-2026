import { gameContext } from '../game/gameContext.js';

export function showGameOverScreen() {
  const overlay = document.createElement('div');
  overlay.id = 'game-over-screen';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    font-family: 'Segoe UI', Arial, sans-serif;
  `;

  const title = document.createElement('div');
  title.textContent = 'THE CITY HAS FALLEN';
  title.style.cssText = `
    font-size: 72px;
    font-weight: bold;
    color: #ff4444;
    text-shadow: 0 0 20px rgba(255, 68, 68, 0.6);
    margin-bottom: 20px;
  `;

  const stats = document.createElement('div');
  stats.textContent = `Final Energy: ${Math.round(gameContext.energy)} Joules`;
  stats.style.cssText = `
    font-size: 24px;
    color: #4ecdc4;
    margin-bottom: 40px;
  `;

  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Restart';
  restartBtn.style.cssText = `
    padding: 15px 50px;
    font-size: 24px;
    background: #333;
    border: 2px solid #ff4444;
    color: white;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  `;
  restartBtn.addEventListener('mouseenter', () => { restartBtn.style.background = '#ff4444'; });
  restartBtn.addEventListener('mouseleave', () => { restartBtn.style.background = '#333'; });
  restartBtn.addEventListener('click', () => { location.reload(); });

  overlay.appendChild(title);
  overlay.appendChild(stats);
  overlay.appendChild(restartBtn);
  document.body.appendChild(overlay);
}
