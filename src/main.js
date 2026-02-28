import './style.css'
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const geometry = new THREE.BoxGeometry( 1, 1, 1 );
const material = new THREE.MeshBasicMaterial( { color: 0x00ff00, wireframe: true } );
const cube = new THREE.Mesh( geometry, material );
scene.add( cube );

const gridHeper = new THREE.GridHelper(30, 30);
scene.add(gridHeper);

camera.position.z = 5;
camera.position.y = 1;

function animate( time ) {

  cube.rotation.x = time / 2000;
  cube.rotation.y = time / 1000;

  renderer.render( scene, camera );

}

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