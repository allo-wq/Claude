/* Applies the saved theme before first paint to avoid a flash of the wrong palette. */
(function () {
  try {
    var t = localStorage.getItem('atlas.theme');
    if (t) {
      t = JSON.parse(t);
      if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    }
  } catch (_) { /* storage unavailable — fall back to system preference */ }
})();
