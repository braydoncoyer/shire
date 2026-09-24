import { App } from './App.js';

const loader = document.getElementById('loader');
const status = document.getElementById('loader-status');

if (!navigator.gpu) {
  status.textContent = 'This walk needs WebGPU. Try a recent Chrome, Edge or Safari.';
} else {
  const app = new App();
  window.shire = app;
  app
    .init(document.getElementById('app'), (msg) => (status.textContent = msg))
    .then(() => {
      loader.classList.add('done');
      window.shireReady = true;
    })
    .catch((err) => {
      console.error(err);
      status.textContent = `Something went wrong: ${err.message}`;
    });
}
