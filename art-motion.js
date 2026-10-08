const artMotionToggle = document.querySelector('.art-motion-toggle');
artMotionToggle?.addEventListener('click', () => {
  const paused = document.documentElement.classList.toggle('art-motion-paused');
  artMotionToggle.setAttribute('aria-pressed', String(paused));
  artMotionToggle.textContent = paused ? 'Reprendre l’animation' : 'Mettre l’animation en pause';
});
