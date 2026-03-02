import { gameContext } from './gameContext.js';
import { ui } from '../ui/UI.js';
import { SoundManager } from '../systems/SoundManager.js';
import { placeBuildingOnGrid } from '../entities/Building.js';
import { raycaster, mouse, ground, worldToGrid, isCellEmpty, isValidGridPos, updateGridRings } from '../systems/GridSystem.js';
import { startRound } from './RoundSystem.js';

function onKeyDown(e) {
  const ctx = gameContext;
  if (!ctx.gameStarted || ctx.cutsceneActive) return;

  if (e.key === 'Enter' && ctx.currentRound === 0) {
    startRound();
    return;
  }

  if (e.key === 'b' || e.key === 'B') { ui.toggleBuildMode(); return; }
  if (e.key === 'p' || e.key === 'P') { ui.togglePowerUpMode(); return; }
  if (e.key === 'u' || e.key === 'U') { ui.toggleUpgradeMode(); return; }

  if (ctx.buildMode) {
    const buildHotkeys = {
      '1': { type: 'windTurbine',   cost: 100 },
      '2': { type: 'solarPanel',    cost: 250 },
      '3': { type: 'powerPlant',    cost: 600 },
      '4': { type: 'turret',        cost: 400 },
      '5': { type: 'missileTurret', cost: 600 },
    };

    if (buildHotkeys[e.key]) {
      const { type, cost } = buildHotkeys[e.key];
      ui.selectBuilding(type, cost);
      raycaster.setFromCamera(mouse, ctx.camera);
      const hits = raycaster.intersectObject(ground);
      if (hits.length > 0) {
        const gridPos = worldToGrid(hits[0].point.x, hits[0].point.z);
        if (isCellEmpty(gridPos.x, gridPos.z) && ctx.energy >= cost) {
          ctx.energy -= cost;
          placeBuildingOnGrid(type, gridPos.x, gridPos.z);
          SoundManager.play('build');
          updateGridRings();
        }
      }
    }

    if (e.key === 'x' || e.key === 'X') {
      ui.toggleDestroyMode();
      raycaster.setFromCamera(mouse, ctx.camera);
      const hits = raycaster.intersectObject(ground);
      if (hits.length > 0) {
        const gridPos = worldToGrid(hits[0].point.x, hits[0].point.z);
        if (isValidGridPos(gridPos.x, gridPos.z) && !isCellEmpty(gridPos.x, gridPos.z)) {
          ctx.grid[gridPos.x][gridPos.z].destroy();
          SoundManager.play('explosion');
        }
      }
    }
  }

  if (ctx.powerUpMode) {
    if (e.key === '1') ui.buyPowerUp('shield', 500);
    if (e.key === '2') ui.buyPowerUp('instaKill', 750);
    if (e.key === '3') ui.buyPowerUp('surge', 400);
  }

  if (ctx.upgradeMode) {
    if (e.key === '1') ui.buyUpgrade('windTurbine');
    if (e.key === '2') ui.buyUpgrade('solarPanel');
    if (e.key === '3') ui.buyUpgrade('powerPlant');
    if (e.key === '4') ui.buyUpgrade('turret');
    if (e.key === '5') ui.buyUpgrade('missileTurret');
    if (e.key === '6') ui.buyUpgrade('hydroElectric');
  }

  if (e.key === 'Escape') {
    if (ctx.buildMode)   ui.toggleBuildMode();
    if (ctx.powerUpMode) ui.togglePowerUpMode();
    if (ctx.upgradeMode) ui.toggleUpgradeMode();
  }
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onClick(event) {
  const ctx = gameContext;
  if (!ctx.buildMode || (!ctx.selectedBuilding && !ctx.destroyMode)) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, ctx.camera);
  const intersects = raycaster.intersectObject(ground);

  if (intersects.length > 0) {
    const gridPos = worldToGrid(intersects[0].point.x, intersects[0].point.z);

    if (ctx.destroyMode) {
      if (isValidGridPos(gridPos.x, gridPos.z) && !isCellEmpty(gridPos.x, gridPos.z)) {
        ctx.grid[gridPos.x][gridPos.z].destroy();
        SoundManager.play('explosion');
      }
    } else {
      if (isCellEmpty(gridPos.x, gridPos.z) && ctx.energy >= ctx.selectedBuildingCost) {
        ctx.energy -= ctx.selectedBuildingCost;
        placeBuildingOnGrid(ctx.selectedBuilding, gridPos.x, gridPos.z);
        SoundManager.play('build');
        updateGridRings();
      }
    }
  }
}

function onResize() {
  const { camera, renderer } = gameContext;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function attachInputHandlers() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
}

export function detachInputHandlers() {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('click', onClick);
  window.removeEventListener('resize', onResize);
}
