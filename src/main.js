import './style.css';
import './ui/DamageFlash.js';  // Must load early to register window.__triggerDamageFlash
import { initGame } from './game/Game.js';

initGame();
