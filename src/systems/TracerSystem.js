import * as THREE from 'three';
import { gameContext } from '../game/gameContext.js';

const tracers = [];

export function createTracer(startX, startZ, endX, endZ, type = 'bullet') {
  const scene = gameContext.scene;
  const startY = 2;
  const endY = 1;

  if (type === 'bullet') {
    const points = [
      new THREE.Vector3(startX, startY, startZ),
      new THREE.Vector3(endX, endY, endZ),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 1.0 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
    tracers.push({ mesh: line, lifetime: 100, createdAt: Date.now(), type: 'line' });

  } else if (type === 'missile') {
    const points = [
      new THREE.Vector3(startX, startY, startZ),
      new THREE.Vector3(endX, endY, endZ),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 1.0, linewidth: 3 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    const explosionGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const explosionMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.set(endX, endY, endZ);
    scene.add(explosion);

    tracers.push({ mesh: line,      lifetime: 150, createdAt: Date.now(), type: 'line' });
    tracers.push({ mesh: explosion, lifetime: 300, createdAt: Date.now(), type: 'explosion', maxScale: 3 });
  }
}

export function updateTracers() {
  const scene = gameContext.scene;
  const now = Date.now();

  for (let i = tracers.length - 1; i >= 0; i--) {
    const tracer = tracers[i];
    const age = now - tracer.createdAt;
    const progress = age / tracer.lifetime;

    if (progress >= 1) {
      scene.remove(tracer.mesh);
      if (tracer.mesh.geometry) tracer.mesh.geometry.dispose();
      if (tracer.mesh.material) tracer.mesh.material.dispose();
      tracers.splice(i, 1);
    } else {
      if (tracer.mesh.material) {
        tracer.mesh.material.opacity = 1 - progress;
      }
      if (tracer.type === 'explosion') {
        const scale = 1 + progress * (tracer.maxScale - 1);
        tracer.mesh.scale.setScalar(scale);
      }
    }
  }
}
