/**
 * Build the HTML resource for the MCP Apps terminal panel.
 *
 * The JavaScript bundle is built by `scripts/build-mcp-app.mjs`; it carries
 * xterm.js, the xterm stylesheet, and the MCP Apps browser bridge, so the
 * iframe makes no external requests.
 *
 * @module agent-interactive-terminal/panel/app-html
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let cached;
/**
 * Load the panel HTML, caching it for the lifetime of the MCP server.
 *
 * @returns a complete HTML document with the app bundle inlined.
 */
export async function loadPanelAppHtml() {
    if (cached !== undefined)
        return cached;
    const script = await readFile(join(here, 'app.bundle.js'), 'utf8');
    cached = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interactive Terminal</title>
</head>
<body>
<div id="app"><p style="padding:24px;color:#8a8f98;font:13px ui-sans-serif,system-ui,sans-serif">Loading terminal…</p></div>
<script>
(function () {
  function show(message) {
    var host = document.getElementById('app');
    if (host) host.textContent = 'Terminal panel error: ' + message;
  }
  window.addEventListener('error', function (event) {
    show(event.message || 'script error');
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    show(reason && reason.message ? reason.message : String(reason));
  });
})();
</script>
<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
    return cached;
}
//# sourceMappingURL=app-html.js.map