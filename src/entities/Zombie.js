import * as THREE from 'three';
import { gameContext } from '../game/gameContext.js';
import { SoundManager } from '../systems/SoundManager.js';
import { modelLoader } from '../systems/ModelLoader.js';
import { getRandomInRange } from '../utils.js';

export function Zombie(x, z, speed, health = 100, damage = 0.5) {
  this.x = x;
  this.z = z;
  this.vX = 0;
  this.vZ = 0;
  this.speed = speed;

  this.targetBuilding = null;
  this.damage = damage;
  this.health = gameContext.powerUpState.instaKillActive ? 1 : health;

  this.animTime = Math.random() * Math.PI * 2;
  this.isMoving = false;
  this.isAttacking = false;
  this.innerModel = null;

  const zombieModel = modelLoader.getSync('zombie');
  if (zombieModel) {
    zombieModel.scale.setScalar(0.2);

    const box = new THREE.Box3().setFromObject(zombieModel);
    const center = box.getCenter(new THREE.Vector3());
    const minY = box.min.y;

    this.mesh = new THREE.Group();
    zombieModel.position.set(-center.x, -minY, -center.z);
    this.mesh.add(zombieModel);
    this.innerModel = zombieModel;

    this.mesh.rotation.x = 0.1;
    this.mesh.position.set(x, 0, z);
    gameContext.scene.add(this.mesh);
  }

  this.findTarget = function findTarget() {
    const { buildings } = gameContext;
    let targetX = 0;
    let targetZ = 0;

    if (buildings.length === 0) {
      targetX = 15;
      targetZ = 0;
    } else {
      const randBuilding = buildings[Math.round(getRandomInRange(0, buildings.length - 1))];
      if (randBuilding) {
        this.targetBuilding = randBuilding;
        targetX = randBuilding.x;
        targetZ = randBuilding.z;
      }
    }

    const xDiff = targetX - this.x;
    const zDiff = targetZ - this.z;
    const mag = Math.sqrt(xDiff * xDiff + zDiff * zDiff);
    this.vX = xDiff / mag;
    this.vZ = zDiff / mag;
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
      const walkSpeed = 8;
      const attackSpeed = 6;

      if (this.isMoving) {
        this.animTime += 0.1 * dt;
        this.isAttacking = false;
        const t = this.animTime * walkSpeed;
        this.mesh.position.y = Math.abs(Math.sin(t)) * 0.15;
        this.innerModel.rotation.z = Math.sin(t) * 0.12;
        this.innerModel.rotation.x = 0.15 + Math.sin(t * 2) * 0.06;
        this.innerModel.rotation.y = Math.sin(t * 0.5) * 0.08;
      } else {
        this.isAttacking = true;
        this.animTime += 0.08 * dt;
        const t = this.animTime * attackSpeed;
        this.mesh.position.y = 0;
        this.innerModel.rotation.x = 0.1 + Math.sin(t) * 0.2;
        this.innerModel.rotation.z = Math.sin(t * 0.7) * 0.06;
        this.innerModel.rotation.y = 0;
      }
    }

    if (this.targetBuilding != null) {
      if (this.targetBuilding.health <= 0) {
        this.targetBuilding = null;
      } else {
        const xDiff = this.targetBuilding.x - this.x;
        const zDiff = this.targetBuilding.z - this.z;
        const dist = Math.sqrt(xDiff * xDiff + zDiff * zDiff);

        if (dist < 2) {
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
          triggerDamageFlash();
        } else if (!gameContext.powerUpState.shieldActive && gameContext.playerHealth <= 0) {
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
    SoundManager.play('splat');
    gameContext.zombiesKilledThisRound++;
    gameContext.totalKills++;
    const index = gameContext.zombies.indexOf(this);
    if (index > -1) gameContext.zombies.splice(index, 1);
  };
}

// Lazily imported to avoid circular dep — DamageFlash is a pure DOM module
function triggerDamageFlash() {
  // We call the global function set up by DamageFlash.js
  if (typeof window.__triggerDamageFlash === 'function') {
    window.__triggerDamageFlash();
  }
}
