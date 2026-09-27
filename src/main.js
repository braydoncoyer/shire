import { App } from './App.js';

const loader = document.getElementById('loader');
const status = document.getElementById('loader-status');
const bar = document.getElementById('loader-bar');
const pct = document.getElementById('loader-pct');
const progressEl = document.getElementById('loader-progress');
const setProgress = (f) => {
  const p = Math.round(f * 100);
  bar.style.width = `${p}%`;
  pct.textContent = `${p}%`;
  progressEl.setAttribute('aria-valuenow', String(p));
};

// The loading stages App reports, in order, for the progress bar.
const STAGES = ['Painting the sky', 'Raising the Hill', 'Growing the grass', 'Planting the trees', 'Digging the hobbit holes', 'Compiling shaders', 'Lighting the lamps'];

if (!navigator.gpu) {
  loader.classList.add('failed');
  pct.textContent = '';
  status.textContent = 'This walk needs WebGPU. Try a recent Chrome, Edge or Safari.';
} else {
  const app = new App();
  window.shire = app;
  app
    .init(document.getElementById('app'), (msg) => {
      status.textContent = msg;
      setProgress((STAGES.indexOf(msg) + 1) / (STAGES.length + 1));
    })
    .then(() => {
      setProgress(1);
      loader.classList.add('done');
      window.shireReady = true;
    })
    .catch((err) => {
      console.error(err);
      loader.classList.add('failed');
      pct.textContent = '';
      status.textContent = `Something went wrong: ${err.message}`;
    });
}
