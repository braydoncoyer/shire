import { App } from './App.js';

const loader = document.getElementById('loader');
const status = document.getElementById('loader-status');
const bar = document.getElementById('loader-bar');

// The loading stages App reports, in order, for the progress bar.
const STAGES = ['Painting the sky', 'Raising the Hill', 'Growing the grass', 'Planting the trees', 'Digging the hobbit holes', 'Compiling shaders'];

if (!navigator.gpu) {
  status.textContent = 'This walk needs WebGPU. Try a recent Chrome, Edge or Safari.';
} else {
  const app = new App();
  window.shire = app;
  app
    .init(document.getElementById('app'), (msg) => {
      status.textContent = msg;
      bar.style.width = `${((STAGES.indexOf(msg) + 1) / (STAGES.length + 1)) * 100}%`;
    })
    .then(() => {
      bar.style.width = '100%';
      loader.classList.add('done');
      window.shireReady = true;
    })
    .catch((err) => {
      console.error(err);
      status.textContent = `Something went wrong: ${err.message}`;
    });
}
