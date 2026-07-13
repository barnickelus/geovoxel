// Owns the three.js scene, camera, and render loop.

import * as THREE from 'three';
import { createVoxelMaterial } from './Materials.js';
import { GreedyMesher } from './GreedyMesher.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
    this.camera.position.set(0, 80, 160);
    this.camera.lookAt(0, 0, 0);

    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.material = createVoxelMaterial();

    this._addLights();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _addLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(100, 200, 100);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.6));
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // Builds a mesh for a chunk's voxel grid via greedy meshing and adds it to the scene.
  addChunkMesh(grid, size, worldOrigin) {
    const { positions, normals, colors, indices } = GreedyMesher.mesh(grid, size);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(worldOrigin.x, worldOrigin.y, worldOrigin.z);
    this.scene.add(mesh);
    return mesh;
  }

  removeMesh(mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
  }

  start() {
    this.webgl.setAnimationLoop(() => this.render());
  }

  stop() {
    this.webgl.setAnimationLoop(null);
  }

  render() {
    this.webgl.render(this.scene, this.camera);
  }
}
