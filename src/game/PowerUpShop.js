import * as THREE from 'three';
import { gameContext } from './gameContext.js';

function makeTextTexture(text, fontSize, fgColor, bgColor, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w || 512;
  canvas.height = h || 128;
  const ctx = canvas.getContext('2d');

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = fgColor || '#ffffff';
  ctx.font = `bold ${fontSize || 64}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function createPowerUpShop() {
  const { scene, gridConfig } = gameContext;
  const shopGroup = new THREE.Group();

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 });

  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 0.12), plankMat);
    plank.position.set(-1.3 + i * 0.87, 1.4, -0.85);
    plank.castShadow = true;
    shopGroup.add(plank);
  }

  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.18, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.7 })
  );
  counter.position.set(0, 1.05, 0); counter.castShadow = true;
  shopGroup.add(counter);

  const edgeTrim = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.08, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.5, metalness: 0.2 })
  );
  edgeTrim.position.set(0, 1.16, 0.65);
  shopGroup.add(edgeTrim);

  const postGeo = new THREE.BoxGeometry(0.22, 3.2, 0.22);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.9 });
  [[-1.75, 0], [1.75, 0]].forEach(([px]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(px, 1.6, 0); post.castShadow = true;
    shopGroup.add(post);
  });

  const awning1 = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 0.1, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.6 })
  );
  awning1.position.set(0, 3.2, 0.2); awning1.rotation.x = -0.15; awning1.castShadow = true;
  shopGroup.add(awning1);

  const awning2 = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.06, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x44cc66, roughness: 0.5 })
  );
  awning2.position.set(0, 3.22, 0.9); shopGroup.add(awning2);

  const drape = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 0.25, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x44cc66, roughness: 0.5 })
  );
  drape.position.set(0, 3.08, 1.25); shopGroup.add(drape);

  const signTex = makeTextTexture('POWER UPS', 72, '#ffffff', '#228833', 512, 128);
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: signTex }));
  signMesh.position.set(0, 3.65, 0.3); shopGroup.add(signMesh);

  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.6 });
  [[-1.75, 0], [1.75, 0]].forEach(([lx]) => {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lanternMat);
    lantern.position.set(lx, 2.9, 0.15); shopGroup.add(lantern);
    const lLight = new THREE.PointLight(0xffaa44, 0.6, 5);
    lLight.position.set(lx, 2.9, 0.15); shopGroup.add(lLight);
  });

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.85 });
  const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), crateMat);
  crate1.position.set(-1.1, 1.32, 0.15); crate1.rotation.y = 0.4; shopGroup.add(crate1);
  const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), crateMat);
  crate2.position.set(-0.75, 1.27, 0.3); crate2.rotation.y = -0.3; shopGroup.add(crate2);

  const potionColors = [0xff4466, 0x44bbff, 0xaaff44];
  potionColors.forEach((col, i) => {
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.25, 8),
      new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.8, roughness: 0.2 })
    );
    bottle.position.set(0.7 + i * 0.22, 1.27, 0.2); shopGroup.add(bottle);
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0xaa8855 }));
    cork.position.set(0.7 + i * 0.22, 1.42, 0.2); shopGroup.add(cork);
  });

  shopGroup.position.set(0, 0, -(gridConfig.totalHeight / 2 + 1.5));
  scene.add(shopGroup);
}

export function createUpgradeShop() {
  const { scene, gridConfig } = gameContext;
  const shopGroup = new THREE.Group();

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.8, 0.12), plankMat);
    plank.position.set(-1.3 + i * 0.87, 1.4, -0.85); plank.castShadow = true;
    shopGroup.add(plank);
  }

  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.18, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.7 })
  );
  counter.position.set(0, 1.05, 0); counter.castShadow = true; shopGroup.add(counter);

  const edgeTrim = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.08, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.4, metalness: 0.4 })
  );
  edgeTrim.position.set(0, 1.16, 0.65); shopGroup.add(edgeTrim);

  const postGeo = new THREE.BoxGeometry(0.22, 3.2, 0.22);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.9 });
  [[-1.75, 0], [1.75, 0]].forEach(([px]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(px, 1.6, 0); post.castShadow = true; shopGroup.add(post);
  });

  const awning1 = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 0.1, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.6 })
  );
  awning1.position.set(0, 3.2, 0.2); awning1.rotation.x = -0.15; awning1.castShadow = true;
  shopGroup.add(awning1);

  const awning2 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.5 }));
  awning2.position.set(0, 3.22, 0.9); shopGroup.add(awning2);

  const drape = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.25, 0.06), new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.5 }));
  drape.position.set(0, 3.08, 1.25); shopGroup.add(drape);

  const signTex = makeTextTexture('UPGRADES', 72, '#ffffff', '#b8860b', 512, 128);
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: signTex }));
  signMesh.position.set(0, 3.65, 0.3); shopGroup.add(signMesh);

  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 0.6 });
  [[-1.75, 0], [1.75, 0]].forEach(([lx]) => {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lanternMat);
    lantern.position.set(lx, 2.9, 0.15); shopGroup.add(lantern);
    const lLight = new THREE.PointLight(0xffaa22, 0.6, 5);
    lLight.position.set(lx, 2.9, 0.15); shopGroup.add(lLight);
  });

  const gearMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.7 });
  const gear1 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 8, 16), gearMat);
  gear1.position.set(-0.8, 1.2, 0.2); gear1.rotation.x = Math.PI / 2; shopGroup.add(gear1);
  const gear2 = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), gearMat);
  gear2.position.set(-0.5, 1.2, 0.3); gear2.rotation.x = Math.PI / 2; shopGroup.add(gear2);
  const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.04), gearMat);
  wrench.position.set(0.6, 1.2, 0.15); wrench.rotation.z = 0.3; shopGroup.add(wrench);

  const crystalColors = [0xff6600, 0xffcc00, 0xff4400];
  crystalColors.forEach((col, i) => {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, roughness: 0.2 })
    );
    crystal.position.set(0.9 + i * 0.25, 1.32, 0.2); crystal.rotation.y = i * 0.5;
    shopGroup.add(crystal);
  });

  shopGroup.position.set(5, 0, -(gridConfig.totalHeight / 2 + 1.5));
  scene.add(shopGroup);
}
