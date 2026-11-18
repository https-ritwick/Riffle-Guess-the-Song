// Runs before the app bundle so a saved light theme is applied before first paint.
// Keep in sync with src/client/lib/theme.ts.
try {
  if (localStorage.getItem('encore:theme') === 'light') {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.colorScheme = 'light'
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', '#fbf5ee')
  }
} catch (e) {}
