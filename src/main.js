import './style.css'
import * as THREE from 'three';

let energy = 0;
let health = 100;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

const gridHeper = new THREE.GridHelper(30, 30);
scene.add(gridHeper);

camera.position.z = 5;
camera.position.y = 1;

const cubeGeometry = new THREE.BoxGeometry( 1, 1, 1 );
const cubeMaterial = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true } );

let zombies = [];

function spawnZombie() {
  const zombie = new Zombie(-5, 0);

  zombie.vX = 0.1;
  zombies.push(zombie);
}

const renderRate = 20;

let currentTime = 0; // in miliseconds
function gameLoop() {
  if(currentTime % 1000 == 0){
    spawnZombie();
  }
  
  for(let i = 0; i < zombies.length; i++){
    zombies[i].update();
  }

  currentTime += renderRate;
  
  renderer.render( scene, camera );
}

window.setInterval(gameLoop, renderRate);

window.addEventListener("resize", ()=>{
  camera.aspect= window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (e)=>{
  if(e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
    cube.position.x += 0.5;
  }
  if(e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
    cube.position.x -= 0.5;
  }
  if(e.key === "w" || e.key === "w" || e.key === "ArrowUp") {
    cube.position.y += 0.5;
  }
  if(e.key === "s" || e.key === "s" || e.key === "ArrowDown") {
    cube.position.y -= 0.5;
  }
});

function Zombie(x, y){
  this.mesh = new THREE.Mesh( cubeGeometry, cubeMaterial );
  
  this.mesh.position.x = x;
  this.mesh.position.y = y;

  this.vX = 0;
  this.vY = 0;

  scene.add( this.mesh );

  this.update = function update() {
    this.mesh.position.x += this.vX;
    this.mesh.position.y += this.vY;
  }
}