import { App } from './App.js';

const loader = document.getElementById('loader');
// The picture fades in once it has arrived (it's usually there before the first frame).
{
  const art = loader.querySelector('.art');
  const img = new Image();
  img.onload = () => art.classList.add('in');
  img.src = matchMedia('(max-width: 900px)').matches ? './loader-sm.webp' : './loader.webp';
}
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
    .init(document.getElementById('app'), (msg, part = 0) => {
      // `part` (0..1) moves the bar along within a long stage.
      status.textContent = msg;
      setProgress((STAGES.indexOf(msg) + 1 + part) / (STAGES.length + 1));
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
