// Single shared mutable state object.
// All modules import this directly — no prop drilling, no global vars.
export const gameContext = {
  // Three.js objects (set by Game.js during init)
  scene: null,
  camera: null,
  renderer: null,

  // Camera positions
  defaultCameraPos: { x: 0, y: 15, z: 20 },
  buildModeCameraPos: { x: 0, y: 35, z: 0.1 },

  // Grid config
  gridConfig: {
    cellSize: 3,
    gridWidth: 10,
    gridHeight: 10,
    get totalWidth()  { return this.cellSize * this.gridWidth; },
    get totalHeight() { return this.cellSize * this.gridHeight; },
    get offsetX()     { return -this.totalWidth / 2; },
    get offsetZ()     { return -this.totalHeight / 2; },
  },

  // Grid data (2D array, initialized by GridSystem.initGrid())
  grid: null,

  // Entity arrays
  buildings: [],
  zombies: [],
  bigZombies: [],

  // Shield mesh reference (set during initGame)
  shieldMesh: null,

  // Game state flags
  energy: 500,
  playerHealth: 100,
  buildMode: false,
  powerUpMode: false,
  upgradeMode: false,
  gameOver: false,
  gameStarted: false,
  cutsceneActive: false,
  isNight: false,

  // Build/destroy UI state
  selectedBuilding: null,
  selectedBuildingCost: 0,
  destroyMode: false,

  // Round state
  currentRound: 0,
  zombiesKilledThisRound: 0,
  zombiesToKillThisRound: 0,
  roundTimeRemaining: 0,
  currentMaxZombies: 3,
  zombiesLeftFromPreviousRound: 0,
  totalZombiesSpawnedThisRound: 0,

  // Game loop timing
  lastFrameTime: 0,
  spawnAccumulator: 0,
  currentTime: 0,

  // Constants
  hydroElectricRate: 0.25,
  renderRate: 100,

  // Upgrade state
  upgradeState: {
    solarPanel:    { level: 0, baseCost: 1000, costMultiplier: 1.5, bonus: 0.25 },
    windTurbine:   { level: 0, baseCost: 1200, costMultiplier: 1.5, bonus: 0.15 },
    powerPlant:    { level: 0, baseCost: 2000, costMultiplier: 1.6, bonus: 0.50 },
    turret:        { level: 0, baseCost: 1500, costMultiplier: 1.5, bonus: 10   },
    missileTurret: { level: 0, baseCost: 2500, costMultiplier: 1.6, bonus: 25   },
    hydroElectric: { level: 0, baseCost: 50,   costMultiplier: 1.1, bonus: 0.5  },
  },

  // Active power-up state
  powerUpState: {
    shieldActive: false,    shieldTimer: 0,    shieldCooldown: 0,
    instaKillActive: false, instaKillTimer: 0, instaKillCooldown: 0,
    surgeActive: false,     surgeTimer: 0,     surgeCooldown: 0,
  },

  // Round configuration
  roundConfig: {
    baseZombiesToKill: 3,
    zombiesPerRoundIncrease: 3,
    roundTimeLimit: 30,
    zombieHealthIncrease: 0.10,
    zombieDamageIncrease: 0.05,
    zombieSpeedIncrease: 0.1,
    maxZombiesIncrease: 2,
    baseMaxZombies: 3,
    roundBonus: 100,
  },
};
