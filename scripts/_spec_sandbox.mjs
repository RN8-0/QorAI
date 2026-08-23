// Admin'in TARAYICI scriptlerini Node icinde kosturan kum havuzu.
// scraper.js + spec_i18n.js klasik <script> dosyalari; burada ayni sirayla
// ayni global baglamda calistirilir -> admin panelindeki DAVRANISIN AYNISI.
import fs from 'fs';
import vm from 'vm';

export function loadAdminSandbox(files = ['admin/js/spec_i18n.js', 'admin/js/scraper.js']) {
  const stubEl = new Proxy({}, { get: () => () => stubEl, set: () => true });
  const doc = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => stubEl, addEventListener: () => {}, body: stubEl, head: stubEl,
  };
  const ctx = {
    document: doc, console: { log(){}, warn(){}, error(){}, info(){} },
    fetch: () => Promise.reject(new Error('sandbox: net kapali')),
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    navigator: { userAgent: 'node' }, location: { href: 'http://localhost/' },
    alert: () => {}, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    CustomEvent: class {}, Event: class {}, Blob: class {},
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  }
  return ctx;
}
