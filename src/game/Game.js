import * as THREE from 'three';
import { gameContext } from './gameContext.js';
import { SoundManager } from '../systems/SoundManager.js';
import { modelLoader } from '../systems/ModelLoader.js';
import { initGrid, updateHoverIndicator } from '../systems/GridSystem.js';
import { updateTracers } from '../systems/TracerSystem.js';
import { ui } from '../ui/UI.js';
import { showGameOverScreen } from '../ui/GameOverScreen.js';
import { updateRound, spawnZombie } from './RoundSystem.js';
import { createPowerUpShop, createUpgradeShop } from './PowerUpShop.js';
import { playCutscene } from './CutsceneSystem.js';
import { attachInputHandlers } from './InputHandler.js';

export async function initGame() {
  console.log('Loading game assets...');

  // --- Three.js scene setup ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x90c8ff);
  scene.fog = new THREE.Fog(0x90c8ff, 10, 100);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 15, 20);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // Store in shared context
  gameContext.scene = scene;
  gameContext.camera = camera;
  gameContext.renderer = renderer;

  // --- Grid ---
  initGrid();

  // --- Grid helper ---
  const { gridConfig } = gameContext;
  const gridHelper = new THREE.GridHelper(gridConfig.totalWidth, gridConfig.gridWidth, 0x666666, 0x999999);
  scene.add(gridHelper);

  // --- Lighting ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  const directionalLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
  directionalLight.position.set(15, 25, 15);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 100;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  directionalLight.shadow.bias = -0.0001;
  scene.add(directionalLight);

  const fillLight = new THREE.DirectionalLight(0xb0c4ff, 0.4);
  fillLight.position.set(-10, 10, -10);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
  rimLight.position.set(0, 5, -20);
  scene.add(rimLight);

  // Register gameLoop on context so CutsceneSystem can start it without circular import
  gameContext._gameLoop = gameLoop;

  // --- UI ---
  ui.init();
  if (ui.container) ui.container.style.display = 'none';

  // --- Preload models ---
  await modelLoader.preload(['zombie', 'solarPanel', 'windTurbine', 'powerPlant', 'turret', 'missileTurret', 'map']);

  // --- Shops ---
  createPowerUpShop();
  createUpgradeShop();

  // --- Shield dome visual ---
  const shieldPosition = { x: 16, y: 0, z: 0 };
  const shieldRadius = 1.5;
  const shieldGeo = new THREE.SphereGeometry(shieldRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.set(shieldPosition.x, shieldPosition.y, shieldPosition.z);
  shieldMesh.visible = false;
  scene.add(shieldMesh);
  gameContext.shieldMesh = shieldMesh;

  // --- Map model ---
  const mapModel = modelLoader.getSync('map');
  if (mapModel) {
    const box = new THREE.Box3().setFromObject(mapModel);
    const center = box.getCenter(new THREE.Vector3());
    mapModel.position.set(-center.x + 22.5, -box.min.y - 3, -center.z - 101.5);
    mapModel.traverse((child) => {
      if (child.isMesh) { child.receiveShadow = true; child.castShadow = true; }
    });
    scene.add(mapModel);
  }

  console.log('Game assets loaded! Waiting for player...');

  renderer.render(scene, camera);

  // --- Input ---
  attachInputHandlers();

  // --- Menu button ---
  const newGameBtn = document.getElementById('new-game-btn');
  newGameBtn.addEventListener('click', () => {
    const cutsceneOverlay = document.getElementById('cutscene-overlay');
    cutsceneOverlay.style.display = 'flex';
    cutsceneOverlay.style.opacity = '1';

    const menu = document.getElementById('main-menu');
    menu.style.transition = 'opacity 0.6s ease';
    menu.style.opacity = '0';
    setTimeout(() => {
      menu.style.display = 'none';
      playCutscene();
      SoundManager.play('newRound');
    }, 600);
  });
}

export function gameLoop(timestamp) {
  const ctx = gameContext;
  if (ctx.gameOver) return;

  requestAnimationFrame(gameLoop);

  // Delta time
  if (ctx.lastFrameTime === 0) ctx.lastFrameTime = timestamp;
  const rawDeltaMs = Math.min(timestamp - ctx.lastFrameTime, 200);
  ctx.lastFrameTime = timestamp;

  // Paused — still render but skip all game logic
  if (ctx.paused) {
    ui.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
    return;
  }

  const deltaTimeMs = rawDeltaMs * ctx.timeScale;
  const dt = deltaTimeMs / ctx.renderRate;

  // Game over check
  if (ctx.playerHealth <= 0) {
    ctx.playerHealth = 0;
    ctx.gameOver = true;
    ui.update();
    showGameOverScreen();
    ctx.renderer.render(ctx.scene, ctx.camera);
    return;
  }

  // Spawn zombies every ~1000ms
  ctx.spawnAccumulator += deltaTimeMs;
  if (ctx.spawnAccumulator >= 1000) {
    ctx.spawnAccumulator -= 1000;
    while (ctx.zombies.length < ctx.currentMaxZombies && ctx.currentRound > 0) {
      spawnZombie();
    }
  }

  // Update entities
  for (let i = 0; i < ctx.zombies.length; i++)    ctx.zombies[i].update(dt);
  for (let i = 0; i < ctx.bigZombies.length; i++) ctx.bigZombies[i].update(dt);
  for (let i = 0; i < ctx.buildings.length; i++)  ctx.buildings[i].update(dt);

  updateTracers();
  updateRound(dt);

  // Power-up timers
  const { powerUpState, scene, buildings, shieldMesh } = ctx;

  if (powerUpState.shieldTimer > 0) {
    powerUpState.shieldTimer -= deltaTimeMs;
    if (powerUpState.shieldTimer <= 0) {
      powerUpState.shieldActive = false;
      powerUpState.shieldTimer = 0;
      if (shieldMesh) shieldMesh.visible = false;
      buildings.forEach(b => {
        if (b.shieldGlow) { scene.remove(b.shieldGlow); b.shieldGlow = null; }
      });
    }
  }

  if (shieldMesh && shieldMesh.visible) shieldMesh.rotation.y += 0.008 * dt;

  if (powerUpState.instaKillTimer > 0) {
    powerUpState.instaKillTimer -= deltaTimeMs;
    if (powerUpState.instaKillTimer <= 0) { powerUpState.instaKillActive = false; powerUpState.instaKillTimer = 0; }
  }

  if (powerUpState.surgeTimer > 0) {
    powerUpState.surgeTimer -= deltaTimeMs;
    if (powerUpState.surgeTimer <= 0) { powerUpState.surgeActive = false; powerUpState.surgeTimer = 0; }
  }

  // Hydroelectric passive income
  if (ctx.currentRound > 0) {
    const hydroLevel = ctx.upgradeState.hydroElectric.level;
    const hydroBonus = ctx.upgradeState.hydroElectric.bonus;
    const hydroRate = ctx.hydroElectricRate * (1 + hydroLevel * hydroBonus);
    ctx.energy += hydroRate * (powerUpState.surgeActive ? 2 : 1) * dt;
  }

  // Cooldown timers
  if (powerUpState.shieldCooldown > 0)    powerUpState.shieldCooldown -= deltaTimeMs;
  if (powerUpState.instaKillCooldown > 0) powerUpState.instaKillCooldown -= deltaTimeMs;
  if (powerUpState.surgeCooldown > 0)     powerUpState.surgeCooldown -= deltaTimeMs;

  // Shield flash when expiring
  if (powerUpState.shieldActive && powerUpState.shieldTimer <= 3000 && powerUpState.shieldTimer > 0) {
    const flash = Math.sin(Date.now() * 0.012) > 0;
    if (shieldMesh) shieldMesh.visible = flash;
    buildings.forEach(b => { if (b.shieldGlow) b.shieldGlow.visible = flash; });
  }

  ctx.currentTime += deltaTimeMs;

  // UI updates
  ui.updatePowerUpCooldowns(deltaTimeMs);
  ui.updateBuffIcons();
  updateHoverIndicator();
  ui.update();

  ctx.renderer.render(ctx.scene, ctx.camera);
}
