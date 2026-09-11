(function () {
  function decodeReversed(value) {
    return String(value || '').split('').reverse().join('');
  }

  function guardModelContainer(container) {
    if (!container || container.dataset.dsplnModelGuarded === 'true') return;

    var viewer = container.querySelector('model-viewer');
    var encodedUrl = container.getAttribute('data-model-url');
    var modelUrl = decodeReversed(encodedUrl);

    if (viewer && modelUrl && !viewer.getAttribute('src')) {
      viewer.setAttribute('src', modelUrl);
    }

    container.dataset.dsplnModelGuarded = 'true';
    container.removeAttribute('data-model-url');

    ['contextmenu', 'dragstart'].forEach(function (eventName) {
      container.addEventListener(eventName, function (event) {
        event.preventDefault();
      });
    });
  }

  function initProtectedModels() {
    document.querySelectorAll('[data-dspln-protected-model]').forEach(guardModelContainer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProtectedModels);
  } else {
    initProtectedModels();
  }

  document.addEventListener('shopify:section:load', initProtectedModels);
})();
