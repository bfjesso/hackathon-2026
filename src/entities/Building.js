import * as THREE from 'three';
import { gameContext } from '../game/gameContext.js';
import { SoundManager } from '../systems/SoundManager.js';
import { modelLoader } from '../systems/ModelLoader.js';
import { worldToGrid, gridToWorld, isCellEmpty, isValidGridPos, updateGridRings } from '../systems/GridSystem.js';
import { createTracer } from '../systems/TracerSystem.js';
import { startRound } from '../game/RoundSystem.js';

export function applyUpgradeToBuildings(type) {
  const upgrade = gameContext.upgradeState[type];

  gameContext.buildings.forEach(building => {
    if (building.type !== type) return;

    if (type === 'turret' || type === 'missileTurret') {
      const baseDamage = type === 'turret' ? 20 : 50;
      building.turretStats.damage = baseDamage + (upgrade.level * upgrade.bonus);
    } else {
      const baseRates = { solarPanel: 0.5, windTurbine: 0.25, powerPlant: 1 };
      const baseRate = baseRates[type] || 0;
      building.energyRate = baseRate * (1 + upgrade.level * upgrade.bonus);
    }
  });
}

export function getBuildingStats(type) {
  const upgrade = gameContext.upgradeState[type];

  if (type === 'turret' || type === 'missileTurret') {
    const baseDamage = type === 'turret' ? 20 : 50;
    return { damage: baseDamage + (upgrade.level * upgrade.bonus) };
  } else {
    const baseRates = { solarPanel: 0.5, windTurbine: 0.25, powerPlant: 1 };
    const baseRate = baseRates[type] || 0;
    return { energyRate: baseRate * (1 + upgrade.level * upgrade.bonus) };
  }
}

export function Building(type, x, z, options = {}) {
  this.type = type;
  this.x = x;
  this.z = z;
  this.gridX = null;
  this.gridZ = null;
  this.mesh = null;

  const defaultScales = {
    solarPanel: 0.10, windTurbine: 2, powerPlant: 0.3, turret: 0.3, missileTurret: 0.5,
  };

  const positionCorrections = {
    solarPanel: { x: 0, y: 0, z: 0 }, windTurbine: { x: 0, y: 0, z: 0 },
    powerPlant: { x: 0, y: 0, z: 0 }, turret: { x: 0, y: 0, z: 0 }, missileTurret: { x: 0, y: 0, z: 0 },
  };

  const defaultRotations = {
    solarPanel: Math.PI / 4, windTurbine: 0, powerPlant: 0, turret: 0, missileTurret: 0,
  };

  const defaultBuildingHealth = {
    solarPanel: 50, windTurbine: 75, powerPlant: 200, turret: 100, missileTurret: 150,
  };
  this.maxHealth = defaultBuildingHealth[type] || 100;
  this.health = this.maxHealth;

  const defaultEnergyRates = {
    solarPanel: 0.5, windTurbine: 0.25, powerPlant: 1, turret: 0, missileTurret: 0,
  };

  const energyUpgrade = gameContext.upgradeState[type];
  if (energyUpgrade && type !== 'turret' && type !== 'missileTurret') {
    this.energyRate = defaultEnergyRates[type] * (1 + energyUpgrade.level * energyUpgrade.bonus);
  } else {
    this.energyRate = defaultEnergyRates[type];
  }

  this.isSolarPanel    = (type === 'solarPanel');
  this.isWindTurbine   = (type === 'windTurbine');
  this.isPowerPlant    = (type === 'powerPlant');

  const turretUpgrade = gameContext.upgradeState[type];
  const turretConfig = {
    turret: {
      damage: 25 + (turretUpgrade ? turretUpgrade.level * turretUpgrade.bonus : 0),
      fireRate: 200, range: 15, splashRadius: 0, rotationSpeed: 0.15,
    },
    missileTurret: {
      damage: 35 + (turretUpgrade ? turretUpgrade.level * turretUpgrade.bonus : 0),
      fireRate: 1000, range: 20, splashRadius: 5, rotationSpeed: 0.08,
    },
  };

  this.isTurret     = (type === 'turret' || type === 'missileTurret');
  this.turretStats  = turretConfig[type] || null;
  this.targetZombie = null;
  this.lastFireTime = 0;
  this.currentRotation = 0;
  this.targetRotation  = 0;

  const model = modelLoader.getSync(type);
  if (model) {
    const scale = options.scale || defaultScales[type] || 1;
    model.scale.setScalar(scale);

    const buildingColors = { powerPlant: 0xffffff };

    if (buildingColors[type]) {
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.color.setHex(buildingColors[type]);
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    } else {
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const minY = box.min.y;

    this.mesh = new THREE.Group();
    const correction = positionCorrections[type] || { x: 0, y: 0, z: 0 };
    model.position.set(-center.x + correction.x, -minY + correction.y, -center.z + correction.z);
    this.mesh.add(model);
    this.mesh.position.set(x, 0, z);

    const rotation = options.rotationY !== undefined ? options.rotationY : (defaultRotations[type] || 0);
    this.mesh.rotation.y = rotation;

    gameContext.scene.add(this.mesh);

    // Health bar
    const barWidth = 2;
    const barHeight = 0.25;
    this.healthBarY = box.max.y - minY + 1.2;

    const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8, depthTest: false });
    this.healthBarBg = new THREE.Mesh(bgGeo, bgMat);
    this.healthBarBg.renderOrder = 999;

    const fgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x00cc44, transparent: true, opacity: 0.9, depthTest: false });
    this.healthBarFg = new THREE.Mesh(fgGeo, fgMat);
    this.healthBarFg.renderOrder = 1000;

    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.position.set(x, this.healthBarY, z);
    this.healthBarGroup.add(this.healthBarBg);
    this.healthBarGroup.add(this.healthBarFg);
    this.healthBarGroup.visible = false;
    gameContext.scene.add(this.healthBarGroup);
  }

  this.update = function update(dt) {
    if (!this.isSolarPanel || !gameContext.isNight) {
      gameContext.energy += this.energyRate * (gameContext.powerUpState.surgeActive ? 2 : 1) * dt;
    }

    if (this.isTurret && this.turretStats) {
      if (!this.targetZombie || this.targetZombie.health <= 0) {
        this.targetZombie = this.findClosestZombie();
      }

      if (this.targetZombie) {
        const dist = this.getDistanceToZombie(this.targetZombie);
        if (dist > this.turretStats.range || this.targetZombie.health <= 0) {
          this.targetZombie = this.findClosestZombie();
        }
      }

      if (this.targetZombie && this.mesh) {
        const dx = this.targetZombie.x - this.x;
        const dz = this.targetZombie.z - this.z;
        this.targetRotation = Math.atan2(dx, dz);

        let rotationDiff = this.targetRotation - this.currentRotation;
        while (rotationDiff > Math.PI)  rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

        if (Math.abs(rotationDiff) > 0.01) {
          this.currentRotation += rotationDiff * this.turretStats.rotationSpeed * dt;
        } else {
          this.currentRotation = this.targetRotation;
        }

        this.mesh.rotation.y = this.currentRotation;

        const now = Date.now();
        if (now - this.lastFireTime >= this.turretStats.fireRate) {
          this.fireAtTarget();
          this.lastFireTime = now;
        }
      }
    }

    if (this.healthBarGroup) {
      if (this.health < this.maxHealth) {
        this.healthBarGroup.visible = true;
        const pct = Math.max(this.health, 0) / this.maxHealth;
        this.healthBarFg.scale.x = pct;
        this.healthBarFg.position.x = -(1 - pct);

        const r = pct < 0.5 ? 1 : 1 - (pct - 0.5) * 2;
        const g = pct > 0.5 ? 1 : pct * 2;
        this.healthBarFg.material.color.setRGB(r, g, 0);

        this.healthBarGroup.quaternion.copy(gameContext.camera.quaternion);
      } else {
        this.healthBarGroup.visible = false;
      }
    }

    if (this.health <= 0) {
      this.destroy();
    }
  };

  this.findClosestZombie = function () {
    let closest = null;
    let closestDist = Infinity;
    const allZombies = [...gameContext.zombies, ...gameContext.bigZombies];

    for (const zombie of allZombies) {
      if (zombie.health <= 0) continue;
      const dist = this.getDistanceToZombie(zombie);
      if (dist <= this.turretStats.range && dist < closestDist) {
        closestDist = dist;
        closest = zombie;
      }
    }
    return closest;
  };

  this.getDistanceToZombie = function (zombie) {
    const dx = zombie.x - this.x;
    const dz = zombie.z - this.z;
    return Math.sqrt(dx * dx + dz * dz);
  };

  this.fireAtTarget = function () {
    if (!this.targetZombie) return;

    const tracerType = this.type === 'missileTurret' ? 'missile' : 'bullet';
    createTracer(this.x, this.z, this.targetZombie.x, this.targetZombie.z, tracerType);

    SoundManager.play(this.type === 'missileTurret' ? 'explosion' : 'gunshot');

    this.targetZombie.health -= this.turretStats.damage;

    if (this.turretStats.splashRadius > 0) {
      const allZombies = [...gameContext.zombies, ...gameContext.bigZombies];
      for (const zombie of allZombies) {
        if (zombie === this.targetZombie || zombie.health <= 0) continue;
        const dx = zombie.x - this.targetZombie.x;
        const dz = zombie.z - this.targetZombie.z;
        if (Math.sqrt(dx * dx + dz * dz) <= this.turretStats.splashRadius) {
          zombie.health -= this.turretStats.damage;
        }
      }
    }

    if (this.targetZombie.health <= 0) {
      this.targetZombie = null;
    }
  };

  this.destroy = function destroy() {
    if (this.mesh) {
      gameContext.scene.remove(this.mesh);
    }
    if (this.shieldGlow) {
      gameContext.scene.remove(this.shieldGlow);
      this.shieldGlow = null;
    }
    if (this.healthBarGroup) {
      gameContext.scene.remove(this.healthBarGroup);
    }
    if (this.gridX !== null && this.gridZ !== null) {
      gameContext.grid[this.gridX][this.gridZ] = null;
    }
    const index = gameContext.buildings.indexOf(this);
    if (index > -1) gameContext.buildings.splice(index, 1);

    updateGridRings();
  };
}

export function placeBuildingOnGrid(type, gridX, gridZ, options = {}) {
  if (!isCellEmpty(gridX, gridZ)) {
    console.warn(`Cannot place building: cell (${gridX}, ${gridZ}) is occupied`);
    return null;
  }

  const worldPos = gridToWorld(gridX, gridZ);
  const building = new Building(type, worldPos.x, worldPos.z, options);
  building.gridX = gridX;
  building.gridZ = gridZ;
  gameContext.buildings.push(building);
  gameContext.grid[gridX][gridZ] = building;

  if (gameContext.currentRound === 0) {
    startRound();
  }

  return building;
}

export function placeBuilding(type, worldX, worldZ, options = {}) {
  const gridPos = worldToGrid(worldX, worldZ);
  return placeBuildingOnGrid(type, gridPos.x, gridPos.z, options);
}
