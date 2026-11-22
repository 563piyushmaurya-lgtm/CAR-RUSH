// =============================================================
// CAR RUSH - entry point.
// The Milestone 1 scene code (renderer, camera, lights, resize,
// game loop) now lives in organised modules:
//   core/SceneSetup.js  -> renderer, scene, camera, lights
//   core/Game.js        -> game loop + state machine
// =============================================================

import './style.css';
import { Game } from './core/Game.js';

function showFatalError(message) {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.querySelector('.loader-text').textContent = message;
    loader.classList.add('error');
  }
}

async function boot() {
  // Wait (briefly) for the fonts so billboard text uses them
  try {
    await Promise.race([
      document.fonts.load('900 40px Orbitron'),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // fonts are optional
  }

  try {
    const game = new Game(document.getElementById('game-canvas'));
    game.start();
    window.carRush = game; // handy for poking around in the browser console
  } catch (err) {
    console.error(err);
    showFatalError('Sorry - your browser could not start WebGL. Try an up-to-date Chrome, Edge or Firefox.');
  }
}

boot();
