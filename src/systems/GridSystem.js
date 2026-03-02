import * as THREE from 'three';
import { gameContext } from '../game/gameContext.js';

export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

export let ground = null;
let hoverMaterial = null;
let hoverIndicator = null;
let gridRingsGroup = null;

export function initGrid() {
  const { scene, gridConfig } = gameContext;

  // Initialize 2D grid array
  gameContext.grid = [];
  for (let x = 0; x < gridConfig.gridWidth; x++) {
    gameContext.grid[x] = [];
    for (let z = 0; z < gridConfig.gridHeight; z++) {
      gameContext.grid[x][z] = null;
    }
  }

  // Ground plane for raycasting and visuals
  const groundGeometry = new THREE.PlaneGeometry(gridConfig.totalWidth, gridConfig.totalHeight);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a9a4a, roughness: 0.8, metalness: 0.1 });
  ground = new THREE.Mesh(groundGeometry, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid cell ring indicators
  gridRingsGroup = new THREE.Group();
  gridRingsGroup.visible = false;
  scene.add(gridRingsGroup);

  const ringOuterRadius = gridConfig.cellSize * 0.45;
  const ringInnerRadius = gridConfig.cellSize * 0.38;
  const ringGeometry = new THREE.RingGeometry(ringInnerRadius, ringOuterRadius, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });

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

  // Hover placement indicator
  const hoverGeometry = new THREE.BoxGeometry(gridConfig.cellSize * 0.9, 0.2, gridConfig.cellSize * 0.9);
  hoverMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.6,
    emissive: 0x00ff00,
    emissiveIntensity: 0.3,
    roughness: 0.5,
    metalness: 0.1,
  });
  hoverIndicator = new THREE.Mesh(hoverGeometry, hoverMaterial);
  hoverIndicator.visible = false;
  scene.add(hoverIndicator);
}

export function worldToGrid(worldX, worldZ) {
  const { gridConfig } = gameContext;
  const gridX = Math.floor((worldX - gridConfig.offsetX) / gridConfig.cellSize);
  const gridZ = Math.floor((worldZ - gridConfig.offsetZ) / gridConfig.cellSize);
  return { x: gridX, z: gridZ };
}

export function gridToWorld(gridX, gridZ) {
  const { gridConfig } = gameContext;
  const worldX = gridConfig.offsetX + (gridX + 0.5) * gridConfig.cellSize;
  const worldZ = gridConfig.offsetZ + (gridZ + 0.5) * gridConfig.cellSize;
  return { x: worldX, z: worldZ };
}

export function isValidGridPos(gridX, gridZ) {
  const { gridConfig } = gameContext;
  return gridX >= 0 && gridX < gridConfig.gridWidth &&
         gridZ >= 0 && gridZ < gridConfig.gridHeight;
}

export function isCellEmpty(gridX, gridZ) {
  return isValidGridPos(gridX, gridZ) && gameContext.grid[gridX][gridZ] === null;
}

export function updateGridRings() {
  if (!gridRingsGroup) return;
  gridRingsGroup.visible = gameContext.buildMode;

  if (gameContext.buildMode) {
    gridRingsGroup.children.forEach(ring => {
      const { gridX, gridZ } = ring.userData;
      const isEmpty = gameContext.grid[gridX][gridZ] === null;
      ring.material.color.setHex(isEmpty ? 0x00ffff : 0xff4444);
      ring.material.opacity = isEmpty ? 0.6 : 0.4;
    });
  }
}

export function updateHoverIndicator() {
  if (!hoverIndicator) return;
  const ctx = gameContext;

  if (!ctx.buildMode || (!ctx.selectedBuilding && !ctx.destroyMode)) {
    hoverIndicator.visible = false;
    return;
  }

  raycaster.setFromCamera(mouse, ctx.camera);
  const intersects = raycaster.intersectObject(ground);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const gridPos = worldToGrid(point.x, point.z);

    if (isValidGridPos(gridPos.x, gridPos.z)) {
      const worldPos = gridToWorld(gridPos.x, gridPos.z);
      hoverIndicator.position.set(worldPos.x, 0.05, worldPos.z);
      hoverIndicator.visible = true;

      if (ctx.destroyMode) {
        if (!isCellEmpty(gridPos.x, gridPos.z)) {
          hoverMaterial.color.setHex(0xff2200);
          hoverMaterial.emissive.setHex(0xff2200);
        } else {
          hoverMaterial.color.setHex(0x666666);
          hoverMaterial.emissive.setHex(0x000000);
        }
      } else {
        if (isCellEmpty(gridPos.x, gridPos.z) && ctx.energy >= ctx.selectedBuildingCost) {
          hoverMaterial.color.setHex(0x00ff00);
          hoverMaterial.emissive.setHex(0x00ff00);
        } else {
          hoverMaterial.color.setHex(0xff0000);
          hoverMaterial.emissive.setHex(0xff0000);
        }
      }
    } else {
      hoverIndicator.visible = false;
    }
  } else {
    hoverIndicator.visible = false;
  }
}
