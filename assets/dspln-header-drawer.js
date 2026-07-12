(() => {
  function closeDrawer(details) {
    const header = document.querySelector('.section-header');
    const summary = details.querySelector('summary.header__icon--menu');

    details.classList.remove('menu-opening');
    details.querySelectorAll('details').forEach((nestedDetails) => {
      nestedDetails.removeAttribute('open');
      nestedDetails.classList.remove('menu-opening');
    });
    details.querySelectorAll('.submenu-open').forEach((submenu) => submenu.classList.remove('submenu-open'));
    details.removeAttribute('open');
    summary?.setAttribute('aria-expanded', 'false');
    header?.classList.remove('menu-open');
    document.body.classList.remove('overflow-hidden-desktop', 'overflow-hidden-tablet');
  }

  document.addEventListener(
    'click',
    (event) => {
      const details = document.getElementById('Details-menu-drawer-container');

      if (!details?.hasAttribute('open')) return;
      if (!event.target.closest('.header-wrapper')) return;
      if (event.target.closest('header-drawer')) return;

      closeDrawer(details);
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
})();
