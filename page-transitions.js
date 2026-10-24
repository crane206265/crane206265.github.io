(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  window.runPageTransition = update => {
    if (!reducedMotion.matches && typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(update);
      // A navigation or a newer transition can skip the animation while its update still runs.
      transition.ready.catch(() => {});
      transition.finished.catch(() => {});
      return transition.updateCallbackDone;
    }

    update();
    if (!reducedMotion.matches) {
      document.querySelector('.content-background')?.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 260, easing: 'ease-out' }
      );
    }
    return Promise.resolve();
  };
})();
