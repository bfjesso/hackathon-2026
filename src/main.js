import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

// ============================================
// Game State
// ============================================

let energy = 500000000;
let playerHealth = 100;
let buildMode = false;
let powerUpMode = false;
let gameOver = false;
let gameLoopInterval = null;

const hydroElectricRate = 0.25;

// Active power-up state
const powerUpState = {
  shieldActive: false,
  shieldTimer: 0,
  shieldCooldown: 0,
  instaKillActive: false,
  instaKillTimer: 0,
  instaKillCooldown: 0,
  surgeActive: false,
  surgeTimer: 0,
  surgeCooldown: 0,
};

// ============================================
// Grid Configuration
// ============================================

const gridConfig = {
  cellSize: 3,      // Size of each grid cell in world units
  gridWidth: 10,    // Number of cells in X direction
  gridHeight: 10,   // Number of cells in Z direction
  
  // Computed properties
  get totalWidth() { return this.cellSize * this.gridWidth; },
  get totalHeight() { return this.cellSize * this.gridHeight; },
  get offsetX() { return -this.totalWidth / 2; },
  get offsetZ() { return -this.totalHeight / 2; },
};

// Grid data structure to track what's placed where
// null = empty, otherwise contains building reference
const grid = [];
for (let x = 0; x < gridConfig.gridWidth; x++) {
  grid[x] = [];
  for (let z = 0; z < gridConfig.gridHeight; z++) {
    grid[x][z] = null;
  }
}

const scene = new THREE.Scene();

// ============================================
// Skybox and Fog
// ============================================

// Set sky color as scene background - more vibrant
scene.background = new THREE.Color(0x90c8ff); // Brighter sky blue

// Add fog for atmosphere (color, near distance, far distance)
scene.fog = new THREE.Fog(0x90c8ff, 20, 100);

// Create a gradient sky using a large sphere
const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color(0x5599ff) },    // Vibrant blue at top
    bottomColor: { value: new THREE.Color(0xaaddff) }, // Light blue at horizon
    offset: { value: 33 },
    exponent: { value: 0.6 }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `,
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// ============================================
// Tracer System
// ============================================

const tracers = [];

/**
 * Create a tracer effect from turret to target
 * @param {number} startX - Start X position
 * @param {number} startZ - Start Z position  
 * @param {number} endX - End X position
 * @param {number} endZ - End Z position
 * @param {string} type - 'bullet' or 'missile'
 */
function createTracer(startX, startZ, endX, endZ, type = 'bullet') {
  const startY = 2; // Height of turret barrel
  const endY = 1;   // Height of zombie center
  
  if (type === 'bullet') {
    // Fast bullet tracer - thin yellow line
    const points = [
      new THREE.Vector3(startX, startY, startZ),
      new THREE.Vector3(endX, endY, endZ)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: 0xffff00, 
      transparent: true, 
      opacity: 1.0 
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    tracers.push({
      mesh: line,
      lifetime: 100,  // ms
      createdAt: Date.now(),
      type: 'line'
    });
  } else if (type === 'missile') {
    // Missile tracer - thicker orange/red with trail
    const points = [
      new THREE.Vector3(startX, startY, startZ),
      new THREE.Vector3(endX, endY, endZ)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: 0xff4400, 
      transparent: true, 
      opacity: 1.0,
      linewidth: 3
    });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    // Add explosion effect at impact point
    const explosionGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const explosionMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff6600, 
      transparent: true, 
      opacity: 0.8 
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.set(endX, endY, endZ);
    scene.add(explosion);
    
    tracers.push({
      mesh: line,
      lifetime: 150,
      createdAt: Date.now(),
      type: 'line'
    });
    
    tracers.push({
      mesh: explosion,
      lifetime: 300,
      createdAt: Date.now(),
      type: 'explosion',
      maxScale: 3
    });
  }
}

/**
 * Update all active tracers (call in game loop)
 */
function updateTracers() {
  const now = Date.now();
  
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tracer = tracers[i];
    const age = now - tracer.createdAt;
    const progress = age / tracer.lifetime;
    
    if (progress >= 1) {
      // Remove expired tracer
      scene.remove(tracer.mesh);
      if (tracer.mesh.geometry) tracer.mesh.geometry.dispose();
      if (tracer.mesh.material) tracer.mesh.material.dispose();
      tracers.splice(i, 1);
    } else {
      // Fade out tracer
      if (tracer.mesh.material) {
        tracer.mesh.material.opacity = 1 - progress;
      }
      
      // Expand explosion effect
      if (tracer.type === 'explosion') {
        const scale = 1 + progress * (tracer.maxScale - 1);
        tracer.mesh.scale.setScalar(scale);
      }
    }
  }
}

// ============================================
// Model Loader System
// ============================================

const modelLoader = {
  loader: new GLTFLoader(),
  cache: new Map(), // Cached loaded GLTF data
  
  // Available models mapped to their paths
  models: {
    zombie: '/models/low_poly_zombie/scene.gltf',
    solarPanel: '/models/painel_solar/scene.gltf',
    windTurbine: '/models/low_poly_wind_turbine/scene.gltf',
    powerPlant: '/models/cooling-_tower/scene.gltf',
    turret: '/models/turret-low-poly/scene.gltf',
    missileTurret: '/models/missile_turret_-_wip/scene.gltf',
    map: '/models/the_map/Hackathon1.gltf',
  },

  /**
   * Load a model by name (returns a promise)
   * @param {string} modelName - Key from models object
   * @returns {Promise<THREE.Group>} - Cloned model ready to add to scene
   */
  async load(modelName) {
    const path = this.models[modelName];
    if (!path) {
      throw new Error(`Model "${modelName}" not found. Available: ${Object.keys(this.models).join(', ')}`);
    }

    // Return cached clone if already loaded
    if (this.cache.has(modelName)) {
      return this.cache.get(modelName).scene.clone();
    }

    // Load and cache
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          this.cache.set(modelName, gltf);
          resolve(gltf.scene.clone());
        },
        (progress) => {
          // Optional: track loading progress
          // console.log(`Loading ${modelName}: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
        },
        (error) => {
          reject(new Error(`Failed to load model "${modelName}": ${error.message}`));
        }
      );
    });
  },

  /**
   * Preload multiple models (useful for game initialization)
   * @param {string[]} modelNames - Array of model names to preload
   * @returns {Promise<void>}
   */
  async preload(modelNames) {
    const promises = modelNames.map(name => this.load(name));
    await Promise.all(promises);
    console.log(`Preloaded models: ${modelNames.join(', ')}`);
  },

  /**
   * Spawn a model instance at a grid position
   * @param {string} modelName - Key from models object
   * @param {number} gridX - Grid X position
   * @param {number} gridZ - Grid Z position (using Z for ground plane)
   * @param {object} options - Optional settings { scale, rotationY }
   * @returns {Promise<THREE.Group>} - The spawned model
   */
  async spawn(modelName, gridX, gridZ, options = {}) {
    const model = await this.load(modelName);
    
    // Position on grid (assuming 1 unit = 1 grid cell)
    model.position.set(gridX, 0, gridZ);
    
    // Apply scale if provided
    if (options.scale) {
      if (typeof options.scale === 'number') {
        model.scale.setScalar(options.scale);
      } else {
        model.scale.set(options.scale.x, options.scale.y, options.scale.z);
      }
    }
    
    // Apply rotation if provided
    if (options.rotationY !== undefined) {
      model.rotation.y = options.rotationY;
    }
    
    scene.add(model);
    return model;
  },

  /**
   * Get a clone of a cached model synchronously (model must be preloaded)
   * @param {string} modelName - Key from models object
   * @returns {THREE.Group|null} - Cloned model or null if not cached
   */
  getSync(modelName) {
    if (this.cache.has(modelName)) {
      return this.cache.get(modelName).scene.clone();
    }
    console.warn(`Model "${modelName}" not preloaded. Use preload() or load() first.`);
    return null;
  }
};

// Make modelLoader available globally for debugging
window.modelLoader = modelLoader;

// ============================================
// UI System
// ============================================

const ui = {
  container: null,
  healthDisplay: null,
  energyDisplay: null,
  buildModeIndicator: null,
  powerUpModeIndicator: null,
  buildMenu: null,
  powerUpMenu: null,
  activeBuffBar: null,
  selectedBuilding: null,


  init() {
    // Create UI container
    this.container = document.createElement('div');
    this.container.id = 'game-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      pointer-events: none;
      font-family: 'Segoe UI', Arial, sans-serif;
      z-index: 100;
    `;
    document.body.appendChild(this.container);

    // Stats panel (left side)
    const statsPanel = document.createElement('div');
    statsPanel.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      padding: 15px 20px;
      border-radius: 10px;
      color: white;
      pointer-events: auto;
    `;
  
    this.healthDisplay = document.createElement('div');
    this.healthDisplay.style.cssText = 'font-size: 18px; color: #ff6b6b; margin-bottom: 5px;';
    
    this.energyDisplay = document.createElement('div');
    this.energyDisplay.style.cssText = 'font-size: 18px; color: #4ecdc4; margin-bottom: 10px;';
    
    this.buildModeIndicator = document.createElement('div');
    this.buildModeIndicator.style.cssText = 'font-size: 14px; color: #888; margin-top: 5px; padding-top: 10px; border-top: 1px solid #444;';
    this.buildModeIndicator.textContent = '[B] Build Mode';

    this.powerUpModeIndicator = document.createElement('div');
    this.powerUpModeIndicator.style.cssText = 'font-size: 14px; color: #888; margin-top: 5px;';
    this.powerUpModeIndicator.textContent = '[P] Power Ups';

    statsPanel.appendChild(this.healthDisplay);
    statsPanel.appendChild(this.energyDisplay);
    statsPanel.appendChild(this.buildModeIndicator);
    statsPanel.appendChild(this.powerUpModeIndicator);
    this.container.appendChild(statsPanel);

    // Active power-up HUD bar (top center)
    this.activeBuffBar = document.createElement('div');
    this.activeBuffBar.style.cssText = `
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      z-index: 200;
      pointer-events: none;
    `;
    document.body.appendChild(this.activeBuffBar);

    // Build menu (right side) - hidden by default
    this.buildMenu = document.createElement('div');
    this.buildMenu.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 30, 20, 0.92), rgba(10, 18, 10, 0.95));
      padding: 18px;
      border-radius: 6px;
      color: white;
      pointer-events: auto;
      display: none;
      border: 1px solid #2e8b57;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-family: 'Segoe UI', Arial, sans-serif;
      overflow: visible;
      position: relative;
    `;
    
    const menuTitle = document.createElement('div');
    menuTitle.textContent = 'BUILD';
    menuTitle.style.cssText = 'font-size: 16px; margin-bottom: 12px; text-align: center; color: #5dde8e; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;';
    this.buildMenu.appendChild(menuTitle);

    const buildingTypes = [
      { key: 'solarPanel', name: 'Solar Panel', cost: 100, hotkey: '1', desc: 'Generates energy from sunlight' },
      { key: 'windTurbine', name: 'Wind Turbine', cost: 150, hotkey: '2', desc: 'Generates energy from wind' },
      { key: 'powerPlant', name: 'Power Plant', cost: 300, hotkey: '3', desc: 'High output energy generator' },
      { key: 'turret', name: 'Turret', cost: 200, hotkey: '4', desc: 'Shoots nearby zombies' },
      { key: 'missileTurret', name: 'Missile Turret', cost: 400, hotkey: '5', desc: 'Splash damage missiles' },
    ];

    buildingTypes.forEach(building => {
      const btn = document.createElement('button');
      btn.innerHTML = `<span style="opacity:0.5;margin-right:6px;">${building.hotkey}</span> ${building.name} <span style="float:right;color:#5dde8e;">${building.cost}</span>`;
      btn.dataset.buildingType = building.key;
      btn.dataset.cost = building.cost;
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 4px;
        background: rgba(46, 139, 87, 0.15);
        border: 1px solid rgba(46, 139, 87, 0.3);
        color: #ccc;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif;
        text-align: left;
        transition: background 0.15s;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(46, 139, 87, 0.35)';
        btn.style.color = '#fff';
        if (this.selectedBuilding === building.key) btn.style.borderColor = '#ffd700';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(46, 139, 87, 0.15)';
        btn.style.color = '#ccc';
        btn.style.borderColor = this.selectedBuilding === building.key ? '#ffd700' : 'rgba(46, 139, 87, 0.3)';
      });
      btn.addEventListener('click', () => this.selectBuilding(building.key, building.cost));
      this.buildMenu.appendChild(btn);
    });

    this.container.appendChild(this.buildMenu);

    // ============================================
    // Power-Ups Menu (similar to build menu)
    // ============================================
    this.powerUpMenu = document.createElement('div');
    this.powerUpMenu.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 30, 20, 0.92), rgba(10, 18, 10, 0.95));
      padding: 18px;
      border-radius: 6px;
      color: white;
      pointer-events: auto;
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      min-width: 300px;
      border: 1px solid #2e8b57;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-family: 'Segoe UI', Arial, sans-serif;
      overflow: visible;
    `;
    
    const powerUpTitle = document.createElement('div');
    powerUpTitle.textContent = 'POWER UPS';
    powerUpTitle.style.cssText = 'font-size: 16px; margin-bottom: 12px; text-align: center; color: #5dde8e; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;';
    this.powerUpMenu.appendChild(powerUpTitle);

    const powerUps = [
      { key: 'shield', name: 'Shield', cost: 500, hotkey: '1', desc: 'Protects player and buildings for 10 seconds (45s cooldown)' },
      { key: 'instaKill', name: 'Insta Kill', cost: 750, hotkey: '2', desc: 'Sets all zombies to 1 HP for 10 seconds, including new spawns (60s cooldown)' },
      { key: 'surge', name: 'Surge', cost: 400, hotkey: '3', desc: 'Doubles energy generation for 10 seconds (30s cooldown)' },
    ];

    // Tooltip element for power-up descriptions
    this.powerUpTooltip = document.createElement('div');
    this.powerUpTooltip.style.cssText = `
      position: absolute;
      left: calc(100% + 10px);
      top: 0;
      background: linear-gradient(135deg, rgba(15, 25, 15, 0.95), rgba(8, 14, 8, 0.97));
      border: 1px solid #2e8b57;
      border-radius: 4px;
      padding: 10px 14px;
      color: #ddd;
      font-size: 12px;
      min-width: 180px;
      pointer-events: none;
      display: none;
      box-shadow: 0 3px 12px rgba(0,0,0,0.5);
      font-family: 'Segoe UI', Arial, sans-serif;
      line-height: 1.5;
      z-index: 10;
    `;
    this.powerUpMenu.style.position = 'fixed';
    this.powerUpMenu.appendChild(this.powerUpTooltip);

    powerUps.forEach(powerUp => {
      const btn = document.createElement('button');
      btn.innerHTML = `<span style="opacity:0.5;margin-right:6px;">${powerUp.hotkey}</span> ${powerUp.name} <span style="float:right;color:#5dde8e;">${powerUp.cost}</span>`;
      btn.dataset.powerUpType = powerUp.key;
      btn.dataset.cost = powerUp.cost;
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 4px;
        background: rgba(46, 139, 87, 0.15);
        border: 1px solid rgba(46, 139, 87, 0.3);
        color: #ccc;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif;
        text-align: left;
        transition: background 0.15s;
        position: relative;
        overflow: hidden;
      `;
      btn.addEventListener('mouseenter', (e) => {
        btn.style.background = 'rgba(46, 139, 87, 0.35)';
        btn.style.color = '#fff';
        // Show tooltip
        this.powerUpTooltip.innerHTML = `<div style="color:#5dde8e;font-weight:bold;margin-bottom:4px;">${powerUp.name}</div><div style="margin-bottom:6px;">${powerUp.desc}</div><div style="color:#5dde8e;">Cost: ${powerUp.cost} Joules</div>`;
        this.powerUpTooltip.style.display = 'block';
        // Position tooltip vertically aligned with hovered button
        const menuRect = this.powerUpMenu.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        this.powerUpTooltip.style.top = (btnRect.top - menuRect.top) + 'px';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(46, 139, 87, 0.15)';
        btn.style.color = '#ccc';
        this.powerUpTooltip.style.display = 'none';
      });
      btn.addEventListener('click', () => this.buyPowerUp(powerUp.key, powerUp.cost));
      this.powerUpMenu.appendChild(btn);
    });

    const closeHint = document.createElement('div');
    closeHint.textContent = '[P] or [Esc] to close';
    closeHint.style.cssText = 'font-size: 10px; text-align: center; opacity: 0.35; margin-top: 10px;';
    this.powerUpMenu.appendChild(closeHint);

    document.body.appendChild(this.powerUpMenu);

    this.update();
  },

  buyPowerUp(type, cost) {
    if (energy < cost) {
      console.log('Not enough energy for power-up!');
      return;
    }
    // Check cooldown
    const cooldownKey = type + 'Cooldown';
    if (powerUpState[cooldownKey] > 0) {
      console.log(`${type} is on cooldown! ${Math.ceil(powerUpState[cooldownKey] / 1000)}s remaining.`);
      return;
    }
    energy -= cost;

    switch (type) {
      case 'shield':
        powerUpState.shieldActive = true;
        powerUpState.shieldTimer = 10000;
        powerUpState.shieldCooldown = 45000;
        if (shieldMesh) shieldMesh.visible = true;
        // Add glowing blue floor under every building
        buildings.forEach(b => {
          if (!b.shieldGlow && b.mesh) {
            const glow = new THREE.Mesh(
              new THREE.CircleGeometry(1.8, 32),
              new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
            );
            glow.rotation.x = -Math.PI / 2;
            glow.position.set(b.x, 0.05, b.z);
            scene.add(glow);
            b.shieldGlow = glow;
          }
        });
        console.log('Shield activated for 10s!');
        break;
      case 'instaKill':
        powerUpState.instaKillActive = true;
        powerUpState.instaKillTimer = 10000;
        powerUpState.instaKillCooldown = 60000;
        // Set all current zombies to 1 health
        zombies.forEach(z => { z.health = Math.min(z.health, 1); });
        console.log('Insta Kill! All zombies set to 1 HP for 10s.');
        break;
      case 'surge':
        powerUpState.surgeActive = true;
        powerUpState.surgeTimer = 10000;
        powerUpState.surgeCooldown = 30000;
        console.log('Surge activated for 10s! Double energy gen.');
        break;
    }
    this.update();
  },

  selectBuilding(type, cost) {
    this.selectedBuilding = type;
    this.selectedBuildingCost = cost;
    // Update button styles
    this.buildMenu.querySelectorAll('button').forEach(btn => {
      btn.style.borderColor = btn.dataset.buildingType === type ? '#ffd700' : 'rgba(46, 139, 87, 0.3)';
    });
    console.log(`Selected: ${type}`);
  },

  cancelSelection() {
    this.selectedBuilding = null;
    this.selectedBuildingCost = 0;
    this.buildMenu.querySelectorAll('button').forEach(btn => {
      btn.style.borderColor = 'rgba(46, 139, 87, 0.3)';
    });
  },

  toggleBuildMode() {
    if (powerUpMode) this.togglePowerUpMode(); // close power-ups first
    buildMode = !buildMode;
    this.updateBuildMode();
    if (!buildMode) {
      this.cancelSelection();
    }
  },

  togglePowerUpMode() {
    if (buildMode) this.toggleBuildMode(); // close build mode first
    powerUpMode = !powerUpMode;
    this.updatePowerUpMode();
  },

  updateBuildMode() {
    // Show/hide build menu
    this.buildMenu.style.display = buildMode ? 'block' : 'none';
    
    // Update indicator
    if (buildMode) {
      this.buildModeIndicator.textContent = '🔨 BUILD MODE [B to exit]';
      this.buildModeIndicator.style.color = '#4ecdc4';
    } else {
      this.buildModeIndicator.textContent = '[B] Build Mode';
      this.buildModeIndicator.style.color = '#888';
    }
    
    // Show/hide grid cell rings
    updateGridRings();
  },

  updatePowerUpMode() {
    this.powerUpMenu.style.display = powerUpMode ? 'block' : 'none';
    
    if (powerUpMode) {
      this.powerUpModeIndicator.textContent = 'POWER UPS [P to exit]';
      this.powerUpModeIndicator.style.color = '#5dde8e';
    } else {
      this.powerUpModeIndicator.textContent = '[P] Power Ups';
      this.powerUpModeIndicator.style.color = '#888';
    }
  },

  update() {
    this.healthDisplay.textContent = `❤️ Health: ${playerHealth}`;
    this.energyDisplay.textContent = `⚡ Energy: ${Math.round(energy)} Joules`;
  }
};

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

// Enhanced renderer with antialiasing and better quality
const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Sharper on high-DPI displays
renderer.shadowMap.enabled = true; // Enable shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Better color grading
renderer.toneMappingExposure = 1.2; // Slightly brighter and more vibrant
renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space
document.body.appendChild( renderer.domElement );

const gridHelper = new THREE.GridHelper(
  gridConfig.totalWidth, 
  gridConfig.gridWidth,
  0x666666,  // Lighter center lines
  0x999999   // Lighter grid lines for better contrast
);
scene.add(gridHelper);

// Add lighting for 3D models - enhanced for cartoon feel
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Brighter ambient for less harsh shadows
scene.add(ambientLight);

// Main directional light (sun)
const directionalLight = new THREE.DirectionalLight(0xfff4e6, 1.2); // Warm sunlight, brighter
directionalLight.position.set(15, 25, 15);
directionalLight.castShadow = true; // Enable shadow casting

// Configure shadow quality
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

// Add a subtle fill light from the opposite side for softer look
const fillLight = new THREE.DirectionalLight(0xb0c4ff, 0.4); // Cool blue fill
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// Add rim light for better edge definition (cartoony look)
const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
rimLight.position.set(0, 5, -20);
scene.add(rimLight);

camera.position.set(0, 15, 20);
camera.lookAt(0, 0, 0);

const cubeGeometry = new THREE.BoxGeometry( 1, 1, 1 );
const cubeMaterial = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true } );

let zombies = [];
const maxNumOfZombies = 10;

function spawnZombie() {
  if(zombies.length >= maxNumOfZombies || buildings.length == 0) {
    return;
  }
  
  const zombie = new Zombie(-15, getRandomInRange(-15, 15), 0.5); // Spawn at edge, random Z
  zombie.findTarget();

  zombies.push(zombie);
}

const renderRate = 100;

let currentTime = 0; // in miliseconds
function gameLoop() {
  if (gameOver) return;

  // Check for game over
  if (playerHealth <= 0) {
    playerHealth = 0;
    gameOver = true;
    ui.update();
    showGameOverScreen();
    renderer.render(scene, camera);
    return;
  }

  if(currentTime % 1000 == 0){
    spawnZombie();
  }
  
  for(let i = 0; i < zombies.length; i++){
    zombies[i].update();
  }

  for(let i = 0; i < buildings.length; i++){
    buildings[i].update();
  }

  // Update tracer effects
  updateTracers();

  // Animate power-up shop character
  if (shopCharacter) {
    shopCharacter.position.y = 0.45 + Math.sin(Date.now() * 0.003) * 0.1;
  }
  if (shopSign) {
    shopSign.position.y = 3.8 + Math.sin(Date.now() * 0.002) * 0.05;
  }

  // Tick power-up timers
  if (powerUpState.shieldTimer > 0) {
    powerUpState.shieldTimer -= renderRate;
    if (powerUpState.shieldTimer <= 0) {
      powerUpState.shieldActive = false;
      powerUpState.shieldTimer = 0;
      if (shieldMesh) shieldMesh.visible = false;
      // Remove all building shield glows
      buildings.forEach(b => {
        if (b.shieldGlow) {
          scene.remove(b.shieldGlow);
          b.shieldGlow = null;
        }
      });
    }
  }

  // Animate shield dome
  if (shieldMesh && shieldMesh.visible) {
    shieldMesh.rotation.y += 0.008;
  }
  if (powerUpState.instaKillTimer > 0) {
    powerUpState.instaKillTimer -= renderRate;
    if (powerUpState.instaKillTimer <= 0) {
      powerUpState.instaKillActive = false;
      powerUpState.instaKillTimer = 0;
    }
  }
  if (powerUpState.surgeTimer > 0) {
    powerUpState.surgeTimer -= renderRate;
    if (powerUpState.surgeTimer <= 0) {
      powerUpState.surgeActive = false;
      powerUpState.surgeTimer = 0;
    }
  }

  energy += hydroElectricRate * (powerUpState.surgeActive ? 2 : 1);

  // Tick cooldowns
  if (powerUpState.shieldCooldown > 0) powerUpState.shieldCooldown -= renderRate;
  if (powerUpState.instaKillCooldown > 0) powerUpState.instaKillCooldown -= renderRate;
  if (powerUpState.surgeCooldown > 0) powerUpState.surgeCooldown -= renderRate;

  // Update power-up button cooldown visuals
  if (ui.powerUpMenu) {
    const cdMaxes = { shield: 45000, instaKill: 60000, surge: 30000 };
    ui.powerUpMenu.querySelectorAll('button').forEach(btn => {
      const key = btn.dataset.powerUpType;
      if (!key) return;
      const cdKey = key + 'Cooldown';
      const cd = powerUpState[cdKey];
      if (cd > 0) {
        const secs = Math.ceil(cd / 1000);
        const pct = Math.max(0, cd / cdMaxes[key]) * 100;
        btn.style.cursor = 'not-allowed';
        btn.style.color = '#777';
        // Cooldown overlay
        let cdOverlay = btn.querySelector('.cd-overlay');
        if (!cdOverlay) {
          cdOverlay = document.createElement('div');
          cdOverlay.className = 'cd-overlay';
          cdOverlay.style.cssText = `
            position: absolute; top:0; left:0; bottom:0;
            background: rgba(0,0,0,0.55);
            pointer-events: none;
            transition: width 0.1s linear;
          `;
          btn.appendChild(cdOverlay);
        }
        cdOverlay.style.width = pct + '%';
        // Centered countdown text
        let cdLabel = btn.querySelector('.cd-label');
        if (!cdLabel) {
          cdLabel = document.createElement('div');
          cdLabel.className = 'cd-label';
          cdLabel.style.cssText = `
            position:absolute; top:0; left:0; right:0; bottom:0;
            display:flex; align-items:center; justify-content:center;
            color:#ff8888; font-size:14px; font-weight:bold;
            text-shadow: 0 0 6px rgba(0,0,0,0.8);
            pointer-events:none; z-index:2;
          `;
          btn.appendChild(cdLabel);
        }
        cdLabel.textContent = secs + 's';
      } else {
        btn.style.cursor = 'pointer';
        btn.style.color = '#ccc';
        const cdOverlay = btn.querySelector('.cd-overlay');
        if (cdOverlay) cdOverlay.remove();
        const cdLabel = btn.querySelector('.cd-label');
        if (cdLabel) cdLabel.remove();
      }
    });
  }

  // === Active Power-Up HUD Icons ===
  const buffIcons = {
    shield:    { emoji: '🛡️', color: '#44aaff', label: 'SHIELD', timer: powerUpState.shieldTimer },
    instaKill: { emoji: '💀', color: '#ff4444', label: 'INSTA KILL', timer: powerUpState.instaKillTimer },
    surge:     { emoji: '⚡', color: '#ffcc00', label: 'SURGE', timer: powerUpState.surgeTimer },
  };
  if (ui.activeBuffBar) {
    // Remove icons for expired buffs, add/update active ones
    const existing = ui.activeBuffBar.querySelectorAll('[data-buff]');
    const activeKeys = new Set();
    for (const [key, info] of Object.entries(buffIcons)) {
      const timerKey = key + 'Active';
      if (!powerUpState[timerKey]) continue;
      activeKeys.add(key);
      let icon = ui.activeBuffBar.querySelector(`[data-buff="${key}"]`);
      if (!icon) {
        icon = document.createElement('div');
        icon.dataset.buff = key;
        icon.style.cssText = `
          display: flex; flex-direction: column; align-items: center;
          background: linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.55));
          border: 2px solid ${info.color};
          border-radius: 10px;
          padding: 6px 10px 4px;
          min-width: 56px;
          box-shadow: 0 0 12px ${info.color}55, inset 0 0 8px ${info.color}22;
        `;
        icon.innerHTML = `
          <div style="font-size:24px;line-height:1;">${info.emoji}</div>
          <div class="buff-label" style="font-size:8px;color:${info.color};letter-spacing:1px;margin-top:2px;font-weight:bold;font-family:'Segoe UI',Arial,sans-serif;">${info.label}</div>
          <div class="buff-timer" style="font-size:12px;color:#fff;font-weight:bold;font-family:'Segoe UI',Arial,sans-serif;margin-top:1px;"></div>
        `;
        ui.activeBuffBar.appendChild(icon);
      }
      const secs = Math.ceil(info.timer / 1000);
      icon.querySelector('.buff-timer').textContent = secs + 's';
      // Flash when about to expire (last 3 seconds)
      if (info.timer <= 3000 && info.timer > 0) {
        const flash = Math.sin(Date.now() * 0.012) > 0;
        icon.style.opacity = flash ? '1' : '0.3';
        icon.style.borderColor = flash ? info.color : '#666';
      } else {
        icon.style.opacity = '1';
        icon.style.borderColor = info.color;
      }
    }
    // Remove icons no longer active
    existing.forEach(el => {
      if (!activeKeys.has(el.dataset.buff)) el.remove();
    });
  }

  // === Flash shield visuals when about to expire ===
  if (powerUpState.shieldActive && powerUpState.shieldTimer <= 3000 && powerUpState.shieldTimer > 0) {
    const flash = Math.sin(Date.now() * 0.012) > 0;
    if (shieldMesh) shieldMesh.visible = flash;
    buildings.forEach(b => {
      if (b.shieldGlow) b.shieldGlow.visible = flash;
    });
  }

  currentTime += renderRate;
  
  // Update hover indicator every frame
  updateHoverIndicator();
  
  ui.update();
  renderer.render( scene, camera );
}

function showGameOverScreen() {
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
  stats.textContent = `Final Energy: ${Math.round(energy)} Joules`;
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
  restartBtn.addEventListener('mouseenter', () => {
    restartBtn.style.background = '#ff4444';
  });
  restartBtn.addEventListener('mouseleave', () => {
    restartBtn.style.background = '#333';
  });
  restartBtn.addEventListener('click', () => {
    location.reload();
  });

  overlay.appendChild(title);
  overlay.appendChild(stats);
  overlay.appendChild(restartBtn);
  document.body.appendChild(overlay);
}

window.addEventListener("resize", ()=>{
  camera.aspect= window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (e)=>{
  // Toggle build mode
  if (e.key === 'b' || e.key === 'B') {
    ui.toggleBuildMode();
    return;
  }

  // Toggle power-up mode
  if (e.key === 'p' || e.key === 'P') {
    ui.togglePowerUpMode();
    return;
  }
  
  // Building hotkeys (only work in build mode)
  if (buildMode) {
    if (e.key === '1') ui.selectBuilding('solarPanel', 100);
    if (e.key === '2') ui.selectBuilding('windTurbine', 150);
    if (e.key === '3') ui.selectBuilding('powerPlant', 300);
    if (e.key === '4') ui.selectBuilding('turret', 200);
    if (e.key === '5') ui.selectBuilding('missileTurret', 400);
  }

  // Power-up hotkeys (only work in power-up mode)
  if (powerUpMode) {
    if (e.key === '1') ui.buyPowerUp('shield', 500);
    if (e.key === '2') ui.buyPowerUp('instaKill', 750);
    if (e.key === '3') ui.buyPowerUp('surge', 400);
  }
  
  if (e.key === 'Escape') {
    if (buildMode) {
      ui.toggleBuildMode();
    }
    if (powerUpMode) {
      ui.togglePowerUpMode();
    }
  }
});

// ============================================
// Grid Placement System
// ============================================

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Create a ground plane for raycasting
const groundGeometry = new THREE.PlaneGeometry(gridConfig.totalWidth, gridConfig.totalHeight);
const groundMaterial = new THREE.MeshStandardMaterial({ 
  color: 0x4a9a4a, // Richer green
  roughness: 0.8,
  metalness: 0.1
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01; // Slightly below grid
ground.receiveShadow = true; // Ground receives shadows
scene.add(ground);

/**
 * Convert world position to grid coordinates
 */
function worldToGrid(worldX, worldZ) {
  const gridX = Math.floor((worldX - gridConfig.offsetX) / gridConfig.cellSize);
  const gridZ = Math.floor((worldZ - gridConfig.offsetZ) / gridConfig.cellSize);
  return { x: gridX, z: gridZ };
}

/**
 * Convert grid coordinates to world position (center of cell)
 */
function gridToWorld(gridX, gridZ) {
  const worldX = gridConfig.offsetX + (gridX + 0.5) * gridConfig.cellSize;
  const worldZ = gridConfig.offsetZ + (gridZ + 0.5) * gridConfig.cellSize;
  return { x: worldX, z: worldZ };
}

/**
 * Check if grid coordinates are valid
 */
function isValidGridPos(gridX, gridZ) {
  return gridX >= 0 && gridX < gridConfig.gridWidth && 
         gridZ >= 0 && gridZ < gridConfig.gridHeight;
}

/**
 * Check if a grid cell is empty
 */
function isCellEmpty(gridX, gridZ) {
  return isValidGridPos(gridX, gridZ) && grid[gridX][gridZ] === null;
}

// ============================================
// Grid Cell Rings (for build mode)
// ============================================

const gridRingsGroup = new THREE.Group();
gridRingsGroup.visible = false;
scene.add(gridRingsGroup);

// Create ring geometry for each cell
const ringOuterRadius = gridConfig.cellSize * 0.45;
const ringInnerRadius = gridConfig.cellSize * 0.38;
const ringGeometry = new THREE.RingGeometry(ringInnerRadius, ringOuterRadius, 32);
const ringMaterial = new THREE.MeshBasicMaterial({ 
  color: 0x00ffff, 
  transparent: true, 
  opacity: 0.6,
  side: THREE.DoubleSide
});

// Create rings for all grid cells
for (let x = 0; x < gridConfig.gridWidth; x++) {
  for (let z = 0; z < gridConfig.gridHeight; z++) {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
    const worldPos = gridToWorld(x, z);
    ring.position.set(worldPos.x, 0.02, worldPos.z);
    ring.rotation.x = -Math.PI / 2;
    ring.userData.gridX = x;
    ring.userData.gridZ = z;
    gridRingsGroup.add(ring);
  }
}

/**
 * Update grid rings visibility and colors based on build mode and cell occupancy
 */
function updateGridRings() {
  gridRingsGroup.visible = buildMode;
  
  if (buildMode) {
    gridRingsGroup.children.forEach(ring => {
      const { gridX, gridZ } = ring.userData;
      const isEmpty = grid[gridX][gridZ] === null;
      
      if (isEmpty) {
        ring.material.color.setHex(0x00ffff); // Cyan for empty
        ring.material.opacity = 0.6;
      } else {
        ring.material.color.setHex(0xff4444); // Red for occupied
        ring.material.opacity = 0.4;
      }
    });
  }
}

// Make updateGridRings available globally
window.updateGridRings = updateGridRings;

// Hover indicator
const hoverGeometry = new THREE.BoxGeometry(gridConfig.cellSize * 0.9, 0.2, gridConfig.cellSize * 0.9);
const hoverMaterial = new THREE.MeshStandardMaterial({ 
  color: 0x00ff00, 
  transparent: true, 
  opacity: 0.6,
  emissive: 0x00ff00,
  emissiveIntensity: 0.3,
  roughness: 0.5,
  metalness: 0.1
});
const hoverIndicator = new THREE.Mesh(hoverGeometry, hoverMaterial);
hoverIndicator.visible = false;
scene.add(hoverIndicator);

// Function to update hover indicator (called every frame)
function updateHoverIndicator() {
  if (!buildMode || !ui.selectedBuilding) {
    hoverIndicator.visible = false;
    return;
  }

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(ground);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const gridPos = worldToGrid(point.x, point.z);
    
    if (isValidGridPos(gridPos.x, gridPos.z)) {
      const worldPos = gridToWorld(gridPos.x, gridPos.z);
      hoverIndicator.position.set(worldPos.x, 0.05, worldPos.z);
      hoverIndicator.visible = true;
      
      // Color based on can place or not
      if (isCellEmpty(gridPos.x, gridPos.z) && energy >= ui.selectedBuildingCost) {
        hoverMaterial.color.setHex(0x00ff00); // Green = can place
        hoverMaterial.emissive.setHex(0x00ff00);
      } else {
        hoverMaterial.color.setHex(0xff0000); // Red = can't place
        hoverMaterial.emissive.setHex(0xff0000);
      }
    } else {
      hoverIndicator.visible = false;
    }
  } else {
    hoverIndicator.visible = false;
  }
}

// Mouse move handler - just update mouse position
window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Click handler for placing buildings
window.addEventListener('click', (event) => {
  if (!buildMode || !ui.selectedBuilding) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(ground);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const gridPos = worldToGrid(point.x, point.z);
    
    if (isCellEmpty(gridPos.x, gridPos.z) && energy >= ui.selectedBuildingCost) {
      const worldPos = gridToWorld(gridPos.x, gridPos.z);
      
      // Deduct energy
      energy -= ui.selectedBuildingCost;
      
      // Place building
      const building = placeBuildingOnGrid(ui.selectedBuilding, gridPos.x, gridPos.z);
      console.log(`Placed ${ui.selectedBuilding} at grid (${gridPos.x}, ${gridPos.z})`);
      
      // Update grid rings to show new occupied cell
      updateGridRings();
    }
  }
});

function Zombie(x, z, speed) {
  this.x = x;
  this.z = z;
  this.vX = 0;
  this.vZ = 0;
  this.speed = speed;

  this.targetBuilding = null;
  this.damage = 0.5;
  this.health = powerUpState.instaKillActive ? 1 : 100; // Zombie health
  
  // Use getSync since zombie model is preloaded
  this.mesh = modelLoader.getSync('zombie');
  if (this.mesh) {
    this.mesh.position.set(x, 0, z);
    this.mesh.scale.setScalar(0.2); // Zombie model is ~8 units, scale to ~0.8
    scene.add(this.mesh);
  }

  this.findTarget = function findTarget() {
    let targetX = 0;
    let targetZ = 0;
    
    if(buildings.length == 0){
      targetX = 15;
      targetZ = 0;
    } else {
      const randBuilding = buildings[getRandomInRange(0, buildings.length - 1)];
      if(randBuilding){
        this.targetBuilding = randBuilding;
        targetX = randBuilding.x;
        targetZ = randBuilding.z;
      }
    }

    let xDiff = (targetX - this.x);
    let zDiff = (targetZ - this.z);
    const vectorMagnitude = Math.sqrt(xDiff * xDiff + zDiff * zDiff);

    this.vX = xDiff / vectorMagnitude;
    this.vZ = zDiff / vectorMagnitude;
  }

  this.update = function update() {
    if (!this.mesh) return;
    
    // Check if zombie is dead
    if (this.health <= 0) {
      this.destroy();
      return;
    }
    
    this.x += this.vX * this.speed;
    this.z += this.vZ * this.speed;
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;

    if(this.targetBuilding != null && this.targetBuilding != undefined){
      if(this.targetBuilding.health <= 0){
          this.targetBuilding = null;
      } else {
        let xDiff = this.targetBuilding.x - this.x;
        let zDiff = this.targetBuilding.z - this.z;
        let distanceToTarget = Math.sqrt(xDiff * xDiff + zDiff * zDiff);

        if(distanceToTarget < 2){
          this.vX = 0;
          this.vZ = 0;
          
          if (!powerUpState.shieldActive) {
            this.targetBuilding.health -= this.damage;
          }
        }
      }
    } else{
      if(this.x > 15 || this.x < -15 || this.z > 15 || this.z < -15){
        this.vX = 0;
        this.vZ = 0;

        if(playerHealth > 0 && !powerUpState.shieldActive) {
          playerHealth -= this.damage;
        } else if (!powerUpState.shieldActive) { 
          playerHealth = 0;
        }
      }

      this.findTarget();
    }
  }

  this.destroy = function destroy() {
    if (this.mesh) {
      scene.remove(this.mesh);
    }
    // Remove from zombies array
    const index = zombies.indexOf(this);
    if (index > -1) zombies.splice(index, 1);
  }
}

// ============================================
// Building System for Tower Defense
// ============================================

let buildings = [];

/**
 * Building class for placing structures on the grid
 * @param {string} type - Building type (solarPanel, windTurbine, powerPlant)
 * @param {number} gridX - Grid X position
 * @param {number} gridZ - Grid Z position
 * @param {object} options - Optional settings { scale, rotationY }
 */
function Building(type, x, z, options = {}) {
  this.type = type;
  this.x = x;
  this.z = z;
  this.gridX = null; // Set by placeBuildingOnGrid
  this.gridZ = null;
  this.mesh = null;

  this.health = 100;

  const defaultScales = {
    solarPanel: 0.10,
    windTurbine: 2,     
    powerPlant: 0.3,
    turret: .3,
    missileTurret: 0.5,
  };

  // Manual position corrections for off-center models (in world units, applied after scaling)
  const positionCorrections = {
    solarPanel: { x: 0, y: 0, z: 0 },  
    windTurbine: { x: 0, y: 0, z: 0 },
    powerPlant: { x: 0, y: 0, z: 0 },
    turret: { x: 0, y: 0, z: 0 },
    missileTurret: { x: 0, y: 0, z: 0 },
  };

  // Default rotations for models (in radians)
  const defaultRotations = {
    solarPanel: Math.PI / 4,  // 45 degrees CCW
    windTurbine: 0,
    powerPlant: 0,
    turret: 0,
    missileTurret: 0,
  };

  const defaultEnergyRates = {
    solarPanel: 0.5, 
    windTurbine: 0.25,
    powerPlant: 1,
    turret: 0,
    missileTurret: 0,
  }

  this.energyRate = defaultEnergyRates[type];

  // ============================================
  // Turret Attack Configuration
  // ============================================
  
  const turretConfig = {
    turret: {
      damage: 20,
      fireRate: 200,      // ms between shots
      range: 15,
      splashRadius: 0,    // no splash
      rotationSpeed: 0.15 // radians per frame for smooth rotation
    },
    missileTurret: {
      damage: 50,
      fireRate: 1000,     // ms between shots (slower)
      range: 20,
      splashRadius: 10,    // splash damage radius
      rotationSpeed: 0.08 // slower rotation for missile turret
    }
  };

  // Turret state
  this.isTurret = (type === 'turret' || type === 'missileTurret');
  this.turretStats = turretConfig[type] || null;
  this.targetZombie = null;
  this.lastFireTime = 0;
  this.currentRotation = 0;
  this.targetRotation = 0;

  // Use getSync since models are preloaded
  const model = modelLoader.getSync(type);
  if (model) {
    // Apply scale
    const scale = options.scale || defaultScales[type] || 1;
    model.scale.setScalar(scale);
    
    // Apply custom color for specific building types
    const buildingColors = {
      powerPlant: 0xffffff, 
    };
    
    if (buildingColors[type]) {
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone(); // Clone to avoid affecting other instances
          child.material.color.setHex(buildingColors[type]);
          // Enable shadows for all building meshes
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    } else {
      // Enable shadows for buildings without custom colors
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
    
    // Calculate bounding box to center the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const minY = box.min.y;
    
    // Create a container group to hold the model centered
    this.mesh = new THREE.Group();
    
    // Offset the model so its center (X,Z) is at origin and bottom is at Y=0
    const correction = positionCorrections[type] || { x: 0, y: 0, z: 0 };
    model.position.set(-center.x + correction.x, -minY + correction.y, -center.z + correction.z);
    this.mesh.add(model);
    
    // Position container at grid cell
    this.mesh.position.set(x, 0, z);
    
    // Apply rotation (use provided option or default for this type)
    const rotation = options.rotationY !== undefined ? options.rotationY : (defaultRotations[type] || 0);
    this.mesh.rotation.y = rotation;
    
    scene.add(this.mesh);

    // --- Health Bar (added to scene, not building, so it doesn't rotate) ---
    const barWidth = 2;
    const barHeight = 0.25;
    this.healthBarY = box.max.y - minY + 1.2; // float above the model top

    // Background (dark red)
    const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8, depthTest: false });
    this.healthBarBg = new THREE.Mesh(bgGeo, bgMat);
    this.healthBarBg.renderOrder = 999;

    // Foreground (green -> red gradient based on health)
    const fgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x00cc44, transparent: true, opacity: 0.9, depthTest: false });
    this.healthBarFg = new THREE.Mesh(fgGeo, fgMat);
    this.healthBarFg.renderOrder = 1000;

    // Group them so we can position / billboard together
    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.position.set(x, this.healthBarY, z); // Position at building location
    this.healthBarGroup.add(this.healthBarBg);
    this.healthBarGroup.add(this.healthBarFg);
    this.healthBarGroup.visible = false; // hidden at full health
    scene.add(this.healthBarGroup); // Add to scene, not building mesh
  }

  this.update = function update() {
    energy += this.energyRate * (powerUpState.surgeActive ? 2 : 1);

    // ============================================
    // Turret Attack Logic
    // ============================================
    if (this.isTurret && this.turretStats) {
      // Find target if we don't have one or current target is dead
      if (!this.targetZombie || this.targetZombie.health <= 0) {
        this.targetZombie = this.findClosestZombie();
      }
      
      // Check if current target is still in range
      if (this.targetZombie) {
        const dist = this.getDistanceToZombie(this.targetZombie);
        if (dist > this.turretStats.range || this.targetZombie.health <= 0) {
          this.targetZombie = this.findClosestZombie();
        }
      }
      
      // Rotate towards target
      if (this.targetZombie && this.mesh) {
        // Calculate angle to target
        const dx = this.targetZombie.x - this.x;
        const dz = this.targetZombie.z - this.z;
        this.targetRotation = Math.atan2(dx, dz);
        
        // Smoothly interpolate rotation
        let rotationDiff = this.targetRotation - this.currentRotation;
        
        // Normalize angle difference to [-PI, PI]
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        
        // Interpolate
        if (Math.abs(rotationDiff) > 0.01) {
          this.currentRotation += rotationDiff * this.turretStats.rotationSpeed;
        } else {
          this.currentRotation = this.targetRotation;
        }
        
        // Apply rotation to mesh
        this.mesh.rotation.y = this.currentRotation;
        
        // Fire at target (regardless of rotation - turret never misses)
        const now = Date.now();
        if (now - this.lastFireTime >= this.turretStats.fireRate) {
          this.fireAtTarget();
          this.lastFireTime = now;
        }
      }
    }

    // Update health bar visibility and scale
    if (this.healthBarGroup) {
      if (this.health < 100) {
        this.healthBarGroup.visible = true;
        const pct = Math.max(this.health, 0) / 100;
        this.healthBarFg.scale.x = pct;
        // Shift foreground so it stays left-aligned
        this.healthBarFg.position.x = -(1 - pct);

        // Color: green at high health, yellow in the middle, red at low
        const r = pct < 0.5 ? 1 : 1 - (pct - 0.5) * 2;
        const g = pct > 0.5 ? 1 : pct * 2;
        this.healthBarFg.material.color.setRGB(r, g, 0);

        // Billboard: make the health bar face the camera
        this.healthBarGroup.quaternion.copy(camera.quaternion);
      } else {
        this.healthBarGroup.visible = false;
      }
    }

    // Destroy building when health reaches 0
    if (this.health <= 0) {
      this.destroy();
    }
  }

  // Find closest zombie within range
  this.findClosestZombie = function() {
    let closest = null;
    let closestDist = Infinity;
    
    for (const zombie of zombies) {
      if (zombie.health <= 0) continue;
      
      const dist = this.getDistanceToZombie(zombie);
      if (dist <= this.turretStats.range && dist < closestDist) {
        closestDist = dist;
        closest = zombie;
      }
    }
    
    return closest;
  }

  // Get distance to a zombie
  this.getDistanceToZombie = function(zombie) {
    const dx = zombie.x - this.x;
    const dz = zombie.z - this.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Fire at the current target
  this.fireAtTarget = function() {
    if (!this.targetZombie) return;
    
    // Create tracer effect
    const tracerType = this.type === 'missileTurret' ? 'missile' : 'bullet';
    createTracer(this.x, this.z, this.targetZombie.x, this.targetZombie.z, tracerType);
    
    // Apply damage to target
    this.targetZombie.health -= this.turretStats.damage;
    
    // Splash damage for missile turret
    if (this.turretStats.splashRadius > 0) {
      for (const zombie of zombies) {
        if (zombie === this.targetZombie) continue;
        if (zombie.health <= 0) continue;
        
        // Distance from target zombie to other zombies
        const dx = zombie.x - this.targetZombie.x;
        const dz = zombie.z - this.targetZombie.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist <= this.turretStats.splashRadius) {
          // Full splash damage to all zombies in radius
          zombie.health -= this.turretStats.damage;
        }
      }
    }
    
    // Check if zombie died
    if (this.targetZombie.health <= 0) {
      this.targetZombie = null;
    }
  }

  this.destroy = function destroy() {
    if (this.mesh) {
      scene.remove(this.mesh);
    }
    // Remove shield glow if present
    if (this.shieldGlow) {
      scene.remove(this.shieldGlow);
      this.shieldGlow = null;
    }
    // Remove health bar from scene
    if (this.healthBarGroup) {
      scene.remove(this.healthBarGroup);
    }
    // Remove from grid
    if (this.gridX !== null && this.gridZ !== null) {
      grid[this.gridX][this.gridZ] = null;
    }
    // Remove from buildings array
    const index = buildings.indexOf(this);
    if (index > -1) buildings.splice(index, 1);

    // Update grid rings so the freed cell shows as available again
    updateGridRings();
  }
}

/**
 * Place a building on the grid (uses world coordinates)
 * @param {string} type - Building type (solarPanel, windTurbine, powerPlant)
 * @param {number} gridX - Grid X index
 * @param {number} gridZ - Grid Z index
 * @param {object} options - Optional settings
 * @returns {Building} - The created building
 */
function placeBuildingOnGrid(type, gridX, gridZ, options = {}) {
  if (!isCellEmpty(gridX, gridZ)) {
    console.warn(`Cannot place building: cell (${gridX}, ${gridZ}) is occupied`);
    return null;
  }
  
  const worldPos = gridToWorld(gridX, gridZ);
  const building = new Building(type, worldPos.x, worldPos.z, options);
  building.gridX = gridX;
  building.gridZ = gridZ;
  buildings.push(building);
  grid[gridX][gridZ] = building; // Mark cell as occupied
  return building;
}

// Legacy function for direct world coordinate placement
function placeBuilding(type, worldX, worldZ, options = {}) {
  const gridPos = worldToGrid(worldX, worldZ);
  return placeBuildingOnGrid(type, gridPos.x, gridPos.z, options);
}

// Make functions available globally for debugging/console use
window.placeBuilding = placeBuilding;
window.placeBuildingOnGrid = placeBuildingOnGrid;
window.gridConfig = gridConfig;
window.grid = grid;

// ============================================
// Power-Up Shop (3D Object)
// ============================================

let shopCharacter = null;
let shopSign = null;
let shieldMesh = null;

// ===== SHIELD VISUAL — adjust position here =====
const shieldPosition = { x: 16, y: 0, z: 0 }; // tweak these to move the shield
const shieldRadius = 1.5; // radius of the dome

/**
 * Make a canvas texture with text on it (for readable 3D signs)
 */
function makeTextTexture(text, fontSize, fgColor, bgColor, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w || 512;
  canvas.height = h || 128;
  const ctx = canvas.getContext('2d');

  // Background
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = fgColor || '#ffffff';
  ctx.font = `bold ${fontSize || 64}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function createPowerUpShop() {
  const shopGroup = new THREE.Group();

  // --- Booth frame: dark weathered wood ---
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.95 });
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 });

  // Back planks
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 0.12), plankMat);
    plank.position.set(-1.3 + i * 0.87, 1.4, -0.85);
    plank.castShadow = true;
    shopGroup.add(plank);
  }

  // Counter slab 
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.18, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7 })
  );
  counter.position.set(0, 1.05, 0);
  counter.castShadow = true;
  shopGroup.add(counter);

  // Counter edge trim
  const edgeTrim = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.08, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.5, metalness: 0.2 })
  );
  edgeTrim.position.set(0, 1.16, 0.65);
  shopGroup.add(edgeTrim);

  // Corner posts (chunky)
  const postGeo = new THREE.BoxGeometry(0.22, 3.2, 0.22);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.9 });
  [[-1.75, 0], [1.75, 0]].forEach(([px, pz]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(px, 1.6, pz);
    post.castShadow = true;
    shopGroup.add(post);
  });

  // Awning (striped look via two overlapping boxes)
  const awning1 = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 0.1, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.6 })
  );
  awning1.position.set(0, 3.2, 0.2);
  awning1.rotation.x = -0.15;
  awning1.castShadow = true;
  shopGroup.add(awning1);

  // Awning stripe
  const awning2 = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.06, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x44cc66, roughness: 0.5 })
  );
  awning2.position.set(0, 3.22, 0.9);
  shopGroup.add(awning2);

  // Front overhang drape
  const drape = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 0.25, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x44cc66, roughness: 0.5 })
  );
  drape.position.set(0, 3.08, 1.25);
  shopGroup.add(drape);

  // --- Shopkeeper character ---
  const guy = new THREE.Group();

  // Body (round-ish cylinder)
  const bodyGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.75, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22aa55, roughness: 0.7 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.38;
  body.castShadow = true;
  guy.add(body);

  // Head (sphere, not box)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5c99a, roughness: 0.8 })
  );
  head.position.y = 1.0;
  head.castShadow = true;
  guy.add(head);

  // Eyes – white sclera + dark pupil
  [[-0.1, 0], [0.1, 0]].forEach(([ex]) => {
    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sclera.position.set(ex, 1.04, 0.24);
    guy.add(sclera);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    pupil.position.set(ex, 1.04, 0.29);
    guy.add(pupil);
  });

  // Mouth
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.018, 6, 10, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x333333 })
  );
  mouth.position.set(0, 0.91, 0.26);
  mouth.rotation.x = Math.PI;
  guy.add(mouth);

  // Cap (flat beret)
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.28, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.7 })
  );
  cap.position.y = 1.28;
  cap.castShadow = true;
  guy.add(cap);

  // Arms
  const armMat = new THREE.MeshStandardMaterial({ color: 0x22aa55 });
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), armMat);
  lArm.position.set(-0.38, 0.5, 0);
  lArm.rotation.z = 0.25;
  guy.add(lArm);
  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.12), armMat);
  rArm.position.set(0.38, 0.58, 0);
  rArm.rotation.z = -0.5;
  guy.add(rArm);

  guy.position.set(0, 0.5, -0.35);
  shopCharacter = guy;
  shopGroup.add(guy);

  // --- Sign with actual readable text via canvas texture ---
  const signTex = makeTextTexture('POWER UPS', 72, '#ffffff', '#228833', 512, 128);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), signMat);
  signMesh.position.set(0, 3.65, 0.3);
  shopSign = signMesh;
  shopGroup.add(signMesh);

  // Lantern on each post
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.6 });
  [[-1.75, 0], [1.75, 0]].forEach(([lx, lz]) => {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lanternMat);
    lantern.position.set(lx, 2.9, lz + 0.15);
    shopGroup.add(lantern);
    const lLight = new THREE.PointLight(0xffaa44, 0.6, 5);
    lLight.position.set(lx, 2.9, lz + 0.15);
    shopGroup.add(lLight);
  });

  // Some crates / boxes on the counter for clutter
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.85 });
  const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), crateMat);
  crate1.position.set(-1.1, 1.32, 0.15);
  crate1.rotation.y = 0.4;
  shopGroup.add(crate1);
  const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), crateMat);
  crate2.position.set(-0.75, 1.27, 0.3);
  crate2.rotation.y = -0.3;
  shopGroup.add(crate2);

  // Potion bottles (cylinders with sphere tops)
  const potionColors = [0xff4466, 0x44bbff, 0xaaff44];
  potionColors.forEach((col, i) => {
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.8, roughness: 0.2, metalness: 0.1 })
    );
    bottle.position.set(0.7 + i * 0.22, 1.27, 0.2);
    shopGroup.add(bottle);
    const cork = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xaa8855 })
    );
    cork.position.set(0.7 + i * 0.22, 1.42, 0.2);
    shopGroup.add(cork);
  });

  // Position: above the grid on the Z-negative side (top when viewed from default camera)
  shopGroup.position.set(0, 0, -(gridConfig.totalHeight / 2 + 1.5));
  shopGroup.rotation.y = 0; // Face towards camera

  scene.add(shopGroup);
}

// ============================================
// Game Initialization
// ============================================

async function initGame() {
  console.log('Loading game assets...');
  
  // Initialize UI
  ui.init();
  
  // Preload all models for instant spawning during gameplay
  await modelLoader.preload(['zombie', 'solarPanel', 'windTurbine', 'powerPlant', 'turret', 'missileTurret', 'map']);

  // ============================================
  // Power-Up Shop (cute 3D booth)
  // ============================================
  createPowerUpShop();

  // Shield Dome Visual
  const shieldGeo = new THREE.SphereGeometry(shieldRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.position.set(shieldPosition.x, shieldPosition.y, shieldPosition.z);
  shieldMesh.visible = false;
  scene.add(shieldMesh);
  
  // Load and add the map to the scene
  const mapModel = modelLoader.getSync('map');
  if (mapModel) {
    // Center the map and position it
    const box = new THREE.Box3().setFromObject(mapModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Position map centered at origin, sitting on ground
    mapModel.position.set(-center.x+30, -box.min.y-10, -center.z-110);
    
    // Enable shadows for map
    mapModel.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });
    
    scene.add(mapModel);
  }
  
  console.log('Game assets loaded! Starting game...');
  
  // Start the game loop
  gameLoopInterval = window.setInterval(gameLoop, renderRate);
}

// Initialize the game
initGame();