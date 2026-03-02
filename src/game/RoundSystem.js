import * as THREE from 'three';
import { gameContext } from './gameContext.js';
import { SoundManager } from '../systems/SoundManager.js';
import { Zombie } from '../entities/Zombie.js';
import { spawnBigZombie } from '../entities/BigZombie.js';
import { getRandomInRange } from '../utils.js';

export function getZombieStatsForRound() {
  const { currentRound, roundConfig } = gameContext;
  const healthMultiplier = 1 + (currentRound - 1) * roundConfig.zombieHealthIncrease;
  const damageMultiplier = 1 + (currentRound - 1) * roundConfig.zombieDamageIncrease;
  const speedMultiplier  = 1 + (currentRound - 1) * roundConfig.zombieSpeedIncrease;
  return {
    health: Math.round(100 * healthMultiplier),
    damage: 0.5 * damageMultiplier,
    speed:  Math.min(0.5 * speedMultiplier, 5.0),
  };
}

export function startRound() {
  const ctx = gameContext;
  ctx.currentRound++;

  if (ctx.currentRound % 3 === 0 && ctx.currentRound !== 0) {
    ctx.isNight = true;
    ctx.scene.background = new THREE.Color(0x0a0a1a);
    ctx.scene.fog = new THREE.Fog(0x0a0a1a, 10, 100);
  } else {
    ctx.isNight = false;
    ctx.scene.background = new THREE.Color(0x87ceeb);
    ctx.scene.fog = new THREE.Fog(0x90c8ff, 10, 100);
  }

  ctx.zombiesKilledThisRound = 0;
  ctx.totalZombiesSpawnedThisRound = 0;

  const newZombies = ctx.roundConfig.baseZombiesToKill + (ctx.currentRound - 1) * ctx.roundConfig.zombiesPerRoundIncrease;
  ctx.zombiesToKillThisRound = newZombies + ctx.zombiesLeftFromPreviousRound;
  ctx.zombiesLeftFromPreviousRound = 0;

  ctx.currentMaxZombies = ctx.roundConfig.baseMaxZombies + (ctx.currentRound - 1) * ctx.roundConfig.maxZombiesIncrease;
  ctx.roundTimeRemaining = ctx.roundConfig.roundTimeLimit;

  SoundManager.play('newRound');
  console.log(`Round ${ctx.currentRound} started! Kill ${ctx.zombiesToKillThisRound} zombies.`);

  if (ctx.currentRound >= 5) {
    const bigCount = Math.floor(1 + (ctx.currentRound - 5) * 0.2);
    for (let i = 0; i < bigCount; i++) {
      spawnBigZombie();
    }
  }
}

export function updateRound(dt) {
  const ctx = gameContext;
  if (ctx.currentRound === 0) return;

  if (ctx.zombiesKilledThisRound >= ctx.zombiesToKillThisRound) {
    ctx.energy += ctx.roundConfig.roundBonus;
    startRound();
    return;
  }

  ctx.roundTimeRemaining -= 0.1 * dt;

  if (ctx.roundTimeRemaining <= 0) {
    ctx.zombiesLeftFromPreviousRound = ctx.zombiesToKillThisRound - ctx.zombiesKilledThisRound;
    console.log(`Time's up! ${ctx.zombiesLeftFromPreviousRound} zombies carry over.`);
    startRound();
  }
}

export function spawnZombie() {
  const ctx = gameContext;
  if (ctx.zombies.length >= ctx.currentMaxZombies || ctx.currentRound === 0) return;

  const stats = getZombieStatsForRound();
  const zombie = new Zombie(-60, getRandomInRange(-15, 15), stats.speed, stats.health, stats.damage);
  zombie.findTarget();
  ctx.zombies.push(zombie);
}
