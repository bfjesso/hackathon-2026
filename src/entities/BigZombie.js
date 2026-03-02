import * as THREE from 'three';
import { gameContext } from '../game/gameContext.js';
import { SoundManager } from '../systems/SoundManager.js';
import { modelLoader } from '../systems/ModelLoader.js';


export function BigZombie(x, z) {
  this.x = x;
  this.z = z;
  this.vX = 0;
  this.vZ = 0;
  this.speed = 0.12;

  const roundScale = 1 + Math.max(0, gameContext.currentRound - 5) * 0.2;
  this.maxHealth = Math.round(1200 * roundScale);
  this.health = this.maxHealth;
  this.damage = 2.0 * roundScale;
  this.isBigZombie = true;

  this.targetBuilding = null;

  this.animTime = Math.random() * Math.PI * 2;
  this.isMoving = false;
  this.isAttacking = false;
  this.innerModel = null;

  const zombieModel = modelLoader.getSync('zombie');
  if (zombieModel) {
    zombieModel.scale.setScalar(0.6);

    const box = new THREE.Box3().setFromObject(zombieModel);
    const center = box.getCenter(new THREE.Vector3());
    const minY = box.min.y;

    this.mesh = new THREE.Group();
    zombieModel.position.set(-center.x, -minY, -center.z);
    this.mesh.add(zombieModel);
    this.innerModel = zombieModel;

    this.mesh.rotation.x = 0.1;

    zombieModel.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.color.multiplyScalar(0.5);
        child.material.emissive = new THREE.Color(0x220000);
        child.material.emissiveIntensity = 0.3;
      }
    });

    this.mesh.position.set(x, 0, z);
    gameContext.scene.add(this.mesh);

    // Health bar
    const barWidth = 4;
    const barHeight = 0.35;
    const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false, transparent: true, opacity: 0.7 });
    this.healthBarBg = new THREE.Mesh(bgGeo, bgMat);
    this.healthBarBg.renderOrder = 999;

    const fgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
    const fgMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true, opacity: 0.9 });
    this.healthBarFg = new THREE.Mesh(fgGeo, fgMat);
    this.healthBarFg.renderOrder = 1000;

    const modelBox = new THREE.Box3().setFromObject(this.mesh);
    this.healthBarY = (modelBox.max.y - modelBox.min.y) + 0.8;

    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.position.set(x, this.healthBarY, z);
    this.healthBarGroup.add(this.healthBarBg);
    this.healthBarGroup.add(this.healthBarFg);
    gameContext.scene.add(this.healthBarGroup);
  }

  this.findTarget = function findTarget() {
    const { buildings } = gameContext;
    let targetX = 15;
    let targetZ = 0;

    if (buildings.length > 0) {
      let closest = null;
      let closestDist = Infinity;
      for (const b of buildings) {
        if (b.health <= 0) continue;
        const dx = b.x - this.x;
        const dz = b.z - this.z;
        const dist = dx * dx + dz * dz;
        if (dist < closestDist) {
          closestDist = dist;
          closest = b;
        }
      }
      if (closest) {
        this.targetBuilding = closest;
        targetX = closest.x;
        targetZ = closest.z;
      }
    }

    const xDiff = targetX - this.x;
    const zDiff = targetZ - this.z;
    const mag = Math.sqrt(xDiff * xDiff + zDiff * zDiff);
    if (mag > 0) {
      this.vX = xDiff / mag;
      this.vZ = zDiff / mag;
    }
  };

  this.update = function update(dt) {
    if (!this.mesh) return;

    if (this.health <= 0) {
      this.destroy();
      return;
    }

    this.x += this.vX * this.speed * dt;
    this.z += this.vZ * this.speed * dt;
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;

    this.isMoving = (this.vX !== 0 || this.vZ !== 0);

    if (this.isMoving) {
      this.mesh.rotation.y = Math.atan2(this.vX, this.vZ);
    }

    if (this.innerModel) {
      const walkSpeed = 4;
      const attackSpeed = 3;

      if (this.isMoving) {
        this.animTime += 0.1 * dt;
        this.isAttacking = false;
        const t = this.animTime * walkSpeed;
        this.mesh.position.y = Math.abs(Math.sin(t)) * 0.25;
        this.innerModel.rotation.z = Math.sin(t) * 0.08;
        this.innerModel.rotation.x = 0.15 + Math.sin(t * 2) * 0.04;
        this.innerModel.rotation.y = Math.sin(t * 0.5) * 0.05;
      } else {
        this.isAttacking = true;
        this.animTime += 0.08 * dt;
        const t = this.animTime * attackSpeed;
        this.mesh.position.y = 0;
        this.innerModel.rotation.x = 0.1 + Math.sin(t) * 0.25;
        this.innerModel.rotation.z = Math.sin(t * 0.7) * 0.08;
        this.innerModel.rotation.y = 0;
      }
    }

    if (this.healthBarGroup) {
      const pct = Math.max(0, this.health / this.maxHealth);
      this.healthBarFg.scale.x = pct;
      this.healthBarFg.position.x = -(1 - pct) * 2;

      const r = pct < 0.5 ? 1 : 1 - (pct - 0.5) * 2;
      const g = pct > 0.5 ? 1 : pct * 2;
      this.healthBarFg.material.color.setRGB(r, g, 0);

      this.healthBarGroup.quaternion.copy(gameContext.camera.quaternion);
      this.healthBarGroup.position.set(this.x, this.healthBarY, this.z);
    }

    if (this.targetBuilding != null) {
      if (this.targetBuilding.health <= 0) {
        this.targetBuilding = null;
      } else {
        const xDiff = this.targetBuilding.x - this.x;
        const zDiff = this.targetBuilding.z - this.z;
        const dist = Math.sqrt(xDiff * xDiff + zDiff * zDiff);

        if (dist < 3) {
          this.vX = 0;
          this.vZ = 0;
          if (!gameContext.powerUpState.shieldActive) {
            this.targetBuilding.health -= this.damage * dt;
          }
        }
      }
    } else {
      if (this.x > 15 && this.z >= -15 && this.z <= 15) {
        this.vX = 0;
        this.vZ = 0;

        if (gameContext.playerHealth > 0 && !gameContext.powerUpState.shieldActive) {
          gameContext.playerHealth -= this.damage * dt;
        } else if (!gameContext.powerUpState.shieldActive) {
          triggerDamageFlash();
          gameContext.playerHealth = 0;
        }
      }

      this.findTarget();
    }
  };

  this.destroy = function destroy() {
    if (this.mesh) {
      gameContext.scene.remove(this.mesh);
    }
    if (this.healthBarGroup) {
      gameContext.scene.remove(this.healthBarGroup);
    }
    SoundManager.play('splat');
    SoundManager.play('explosion');
    // Big zombie counts as 3 kills + bonus energy
    gameContext.zombiesKilledThisRound += 3;
    gameContext.totalKills += 3;
    gameContext.energy += 200;
    const index = gameContext.bigZombies.indexOf(this);
    if (index > -1) gameContext.bigZombies.splice(index, 1);
  };
}

export function spawnBigZombie() {
  const bz = new BigZombie(-65, Math.random() * 20 - 10);
  bz.findTarget();
  gameContext.bigZombies.push(bz);
  console.log('BIG ZOMBIE spawned!');
}

function triggerDamageFlash() {
  if (typeof window.__triggerDamageFlash === 'function') {
    window.__triggerDamageFlash();
  }
}
