import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let energy = 0;
let health = 100;

const scene = new THREE.Scene();

// ============================================
// Model Loader System
// ============================================

const modelLoader = {
  loader: new GLTFLoader(),
  cache: new Map(), // Cached loaded GLTF data
  
  // Available models mapped to their paths
  models: {
    zombie: '/models/low_poly_zombie/scene.gltf',
    solarPanel: '/models/cartoon_low_poly_solar_panel/scene.gltf',
    windTurbine: '/models/low_poly_wind_turbine/scene.gltf',
    powerPlant: '/models/power_plant_level_two/scene.gltf',
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
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const gridHeper = new THREE.GridHelper(30, 30);
scene.add(gridHeper);

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

function spawnZombie() {
  const zombie = new Zombie(-15, Math.random() * 10 - 5); // Spawn at edge, random Z

  zombie.vX = 0.05; // Move along X axis toward player
  zombies.push(zombie);
}

const renderRate = 20;

let currentTime = 0; // in miliseconds
function gameLoop() {
  if(currentTime % 1000 == 0){
    spawnZombie();
  }
  
  for(let i = 0; i < zombies.length; i++){
    zombies[i].update();
  }

  currentTime += renderRate;
  
  renderer.render( scene, camera );
}

window.addEventListener("resize", ()=>{
  camera.aspect= window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (e)=>{
  if(e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
    cube.position.x += 0.5;
  }
  if(e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
    cube.position.x -= 0.5;
  }
  if(e.key === "w" || e.key === "w" || e.key === "ArrowUp") {
    cube.position.y += 0.5;
  }
  if(e.key === "s" || e.key === "s" || e.key === "ArrowDown") {
    cube.position.y -= 0.5;
  }
});

function Zombie(x, z) {
  this.x = x;
  this.z = z;
  this.vX = 0;
  this.vZ = 0;
  
  // Use getSync since zombie model is preloaded
  this.mesh = modelLoader.getSync('zombie');
  if (this.mesh) {
    this.mesh.position.set(x, 0, z);
    this.mesh.scale.setScalar(0.5); // Adjust scale as needed
    scene.add(this.mesh);
  }

  this.update = function update() {
    if (!this.mesh) return;
    
    this.x += this.vX;
    this.z += this.vZ;
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
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
function Building(type, gridX, gridZ, options = {}) {
  this.type = type;
  this.gridX = gridX;
  this.gridZ = gridZ;
  this.mesh = null;
  this.loaded = false;

  const defaultScales = {
    solarPanel: 0.5,
    windTurbine: 0.3,
    powerPlant: 0.4,
  };

  modelLoader.load(type).then((model) => {
    this.mesh = model;
    this.mesh.position.set(gridX, 0, gridZ);
    this.mesh.scale.setScalar(options.scale || defaultScales[type] || 1);
    if (options.rotationY !== undefined) {
      this.mesh.rotation.y = options.rotationY;
    }
    scene.add(this.mesh);
    this.loaded = true;
  });

  this.destroy = function destroy() {
    if (this.mesh) {
      scene.remove(this.mesh);
      const index = buildings.indexOf(this);
      if (index > -1) buildings.splice(index, 1);
    }
  }
}

/**
 * Place a building on the grid
 * @param {string} type - Building type (solarPanel, windTurbine, powerPlant)
 * @param {number} gridX - Grid X position
 * @param {number} gridZ - Grid Z position
 * @param {object} options - Optional settings
 * @returns {Building} - The created building
 */
function placeBuilding(type, gridX, gridZ, options = {}) {
  const building = new Building(type, gridX, gridZ, options);
  buildings.push(building);
  return building;
}

// Make placeBuilding available globally for debugging/console use
window.placeBuilding = placeBuilding;

// ============================================
// Game Initialization
// ============================================

async function initGame() {
  console.log('Loading game assets...');
  
  // Preload all models for instant spawning during gameplay
  await modelLoader.preload(['zombie', 'solarPanel', 'windTurbine', 'powerPlant']);
  
  console.log('Game assets loaded! Starting game...');
  
  // Start the game loop
  window.setInterval(gameLoop, renderRate);
}

// Initialize the game
initGame();