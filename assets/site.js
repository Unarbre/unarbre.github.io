// The page below the night: elements rise into view as they are reached, project cards tilt toward the pointer with
// a glint of firelight, and the top bar settles once the night is behind.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rise = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        rise.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  document.querySelectorAll('[data-reveal]').forEach((element) => rise.observe(element));

  if (!reduced && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    for (const card of document.querySelectorAll('.project')) {
      card.addEventListener('pointermove', (event) => {
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width;
        const y = (event.clientY - box.top) / box.height;
        card.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
        card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    }
  }

  const night = document.querySelector('.night');
  const bar = document.querySelector('.topbar');
  // Solid as soon as the night starts scrolling away, before its text slides under the bar.
  const settle = () => bar.classList.toggle('solid', !night || night.getBoundingClientRect().bottom <= innerHeight + 1);
  addEventListener('scroll', settle, { passive: true });
  settle();
})();
