import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

// ============================================
// Game State
// ============================================

let energy = 500;
let health = 100;
let buildMode = false;
let gameOver = false;
let gameLoopInterval = null;

const hydroElectricRate = 0.25;

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

// Set sky color as scene background
scene.background = new THREE.Color(0x87CEEB); // Sky blue

// Add fog for atmosphere (color, near distance, far distance)
scene.fog = new THREE.Fog(0x87CEEB, 10, 75);

// Create a gradient sky using a large sphere
const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color(0x0077ff) },    // Deep blue at top
    bottomColor: { value: new THREE.Color(0x87CEEB) }, // Light blue at horizon
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
  buildMenu: null,
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
    
    statsPanel.appendChild(this.healthDisplay);
    statsPanel.appendChild(this.energyDisplay);
    statsPanel.appendChild(this.buildModeIndicator);
    this.container.appendChild(statsPanel);

    // Build menu (right side) - hidden by default
    this.buildMenu = document.createElement('div');
    this.buildMenu.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      padding: 15px;
      border-radius: 10px;
      color: white;
      pointer-events: auto;
      display: none;
    `;
    
    const menuTitle = document.createElement('div');
    menuTitle.textContent = 'BUILD';
    menuTitle.style.cssText = 'font-size: 14px; margin-bottom: 10px; text-align: center; opacity: 0.7;';
    this.buildMenu.appendChild(menuTitle);

    const buildingTypes = [
      { key: 'solarPanel', name: 'Solar Panel', cost: 100, hotkey: '1' },
      { key: 'windTurbine', name: 'Wind Turbine', cost: 150, hotkey: '2' },
      { key: 'powerPlant', name: 'Power Plant', cost: 300, hotkey: '3' },
    ];

    buildingTypes.forEach(building => {
      const btn = document.createElement('button');
      btn.textContent = `[${building.hotkey}] ${building.name} ${building.cost} Joules`;
      btn.dataset.buildingType = building.key;
      btn.dataset.cost = building.cost;
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 10px 15px;
        margin-bottom: 5px;
        background: #333;
        border: 2px solid #555;
        color: white;
        border-radius: 5px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      `;
      btn.addEventListener('mouseenter', () => btn.style.borderColor = '#4ecdc4');
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = this.selectedBuilding === building.key ? '#ffd700' : '#555';
      });
      btn.addEventListener('click', () => this.selectBuilding(building.key, building.cost));
      this.buildMenu.appendChild(btn);
    });

    this.container.appendChild(this.buildMenu);
    this.update();
  },

  selectBuilding(type, cost) {
    this.selectedBuilding = type;
    this.selectedBuildingCost = cost;
    // Update button styles
    this.buildMenu.querySelectorAll('button').forEach(btn => {
      btn.style.borderColor = btn.dataset.buildingType === type ? '#ffd700' : '#555';
    });
    console.log(`Selected: ${type}`);
  },

  cancelSelection() {
    this.selectedBuilding = null;
    this.selectedBuildingCost = 0;
    this.buildMenu.querySelectorAll('button').forEach(btn => {
      btn.style.borderColor = '#555';
    });
  },

  toggleBuildMode() {
    buildMode = !buildMode;
    this.updateBuildMode();
    if (!buildMode) {
      this.cancelSelection();
    }
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

  update() {
    this.healthDisplay.textContent = `❤️ Health: ${health}`;
    this.energyDisplay.textContent = `⚡ Energy: ${Math.round(energy)} Joules`;
  }
};

const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const gridHelper = new THREE.GridHelper(
  gridConfig.totalWidth, 
  gridConfig.gridWidth,
  0x444444,
  0x888888
);
scene.add(gridHelper);

// Add lighting for 3D models
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

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
  if (health <= 0) {
    health = 0;
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

  energy += hydroElectricRate;

  currentTime += renderRate;
  
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
  
  // Building hotkeys (only work in build mode)
  if (buildMode) {
    if (e.key === '1') ui.selectBuilding('solarPanel', 100);
    if (e.key === '2') ui.selectBuilding('windTurbine', 150);
    if (e.key === '3') ui.selectBuilding('powerPlant', 300);
  }
  
  if (e.key === 'Escape') {
    if (buildMode) {
      ui.toggleBuildMode();
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
const groundMaterial = new THREE.MeshBasicMaterial({ 
  color: 0x228B22, 
  transparent: true, 
  opacity: 0.3 
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01; // Slightly below grid
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
const hoverGeometry = new THREE.BoxGeometry(gridConfig.cellSize * 0.9, 0.1, gridConfig.cellSize * 0.9);
const hoverMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
const hoverIndicator = new THREE.Mesh(hoverGeometry, hoverMaterial);
hoverIndicator.visible = false;
scene.add(hoverIndicator);

// Mouse move handler for hover effect
window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

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
      } else {
        hoverMaterial.color.setHex(0xff0000); // Red = can't place
      }
    } else {
      hoverIndicator.visible = false;
    }
  } else {
    hoverIndicator.visible = false;
  }
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
          
          this.targetBuilding.health -= this.damage;
        }
      }
    } else{
      if(this.x > 15 || this.x < -15 || this.z > 15 || this.z < -15){
        this.vX = 0;
        this.vZ = 0;

        if(health > 0) {
          health -= this.damage;
        } else { 
          health = 0;
        }
      }

      this.findTarget();
    }
  }

  this.destroy = function destroy() {
    if (this.mesh) {
      scene.remove(this.mesh);
    }
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
  };

  // Manual position corrections for off-center models (in world units, applied after scaling)
  const positionCorrections = {
    solarPanel: { x: 0, y: 0, z: 0 },  
    windTurbine: { x: 0, y: 0, z: 0 },
    powerPlant: { x: 0, y: 0, z: 0 },
  };

  // Default rotations for models (in radians)
  const defaultRotations = {
    solarPanel: Math.PI / 4,  // 45 degrees CCW
    windTurbine: 0,
    powerPlant: 0,
  };

  const defaultEnergyRates = {
    solarPanel: 0.5, 
    windTurbine: 0.25,
    powerPlant: 1,
  }

  this.energyRate = defaultEnergyRates[type];

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

    // --- Health Bar ---
    const barWidth = 2;
    const barHeight = 0.25;
    const barY = box.max.y - minY + 1.2; // float above the model top

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
    this.healthBarGroup.position.set(0, barY, 0);
    this.healthBarGroup.add(this.healthBarBg);
    this.healthBarGroup.add(this.healthBarFg);
    this.healthBarGroup.visible = false; // hidden at full health
    this.mesh.add(this.healthBarGroup);
  }

  this.update = function update() {
    energy += this.energyRate;

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

  this.destroy = function destroy() {
    if (this.mesh) {
      scene.remove(this.mesh);
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
// Game Initialization
// ============================================

async function initGame() {
  console.log('Loading game assets...');
  
  // Initialize UI
  ui.init();
  
  // Preload all models for instant spawning during gameplay
  await modelLoader.preload(['zombie', 'solarPanel', 'windTurbine', 'powerPlant', 'map']);
  
  // Load and add the map to the scene
  const mapModel = modelLoader.getSync('map');
  if (mapModel) {
    // Center the map and position it
    const box = new THREE.Box3().setFromObject(mapModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Position map centered at origin, sitting on ground
    mapModel.position.set(-center.x+30, -box.min.y-10, -center.z-110);
    
    scene.add(mapModel);
  }
  
  console.log('Game assets loaded! Starting game...');
  
  // Start the game loop
  gameLoopInterval = window.setInterval(gameLoop, renderRate);
}

// Initialize the game
initGame();