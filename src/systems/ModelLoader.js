import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const modelLoader = {
  loader: new GLTFLoader(),
  cache: new Map(),

  models: {
    zombie:       '/models/low_poly_zombie/scene.gltf',
    solarPanel:   '/models/painel_solar/scene.gltf',
    windTurbine:  '/models/low_poly_wind_turbine/scene.gltf',
    powerPlant:   '/models/cooling-_tower/scene.gltf',
    turret:       '/models/turret-low-poly/scene.gltf',
    missileTurret:'/models/missile_turret_-_wip/scene.gltf',
    map:          '/models/the_map/Hackathon1.gltf',
  },

  async load(modelName) {
    const path = this.models[modelName];
    if (!path) {
      throw new Error(`Model "${modelName}" not found. Available: ${Object.keys(this.models).join(', ')}`);
    }

    if (this.cache.has(modelName)) {
      return this.cache.get(modelName).scene.clone();
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          this.cache.set(modelName, gltf);
          resolve(gltf.scene.clone());
        },
        undefined,
        (error) => reject(new Error(`Failed to load model "${modelName}": ${error.message}`))
      );
    });
  },

  async preload(modelNames) {
    const promises = modelNames.map(name => this.load(name));
    await Promise.all(promises);
    console.log(`Preloaded models: ${modelNames.join(', ')}`);
  },

  getSync(modelName) {
    if (this.cache.has(modelName)) {
      return this.cache.get(modelName).scene.clone();
    }
    console.warn(`Model "${modelName}" not preloaded. Use preload() or load() first.`);
    return null;
  },
};
