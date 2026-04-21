// Runs inside every web page — kills JS-level popups, ads, and redirect tricks

// ─── Block JS popup APIs ──────────────────────────────────────────────────────
window.open = () => null;
window.alert = () => {};
window.confirm = () => false;
window.prompt = () => null;

// ─── Block beacon / tracking APIs ────────────────────────────────────────────
navigator.sendBeacon = () => false;

// ─── Intercept document.createElement to block injected ad iframes ────────────
const _createElement = document.createElement.bind(document);
document.createElement = function (tag, ...args) {
  const el = _createElement(tag, ...args);
  if (tag.toLowerCase() === 'iframe') {
    const _setSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    if (_setSrc && _setSrc.set) {
      const origSet = _setSrc.set;
      Object.defineProperty(el, 'src', {
        set(val) {
          const AD_PATTERNS = ['ads','doubleclick','adnxs','googlesyndication','taboola','outbrain'];
          if (val && AD_PATTERNS.some(p => val.includes(p))) return;
          origSet.call(this, val);
        },
        get() { return _setSrc.get ? _setSrc.get.call(this) : ''; },
        configurable: true,
      });
    }
  }
  return el;
};

// ─── CSS: hide common ad containers ──────────────────────────────────────────
const AD_CSS = `
  /* Generic ad selectors */
  [id*="google_ads"], [id*="ad-container"], [id*="ad_container"],
  [id*="advert"], [id*="advertisement"], [id*="adsense"],
  [class*="adsbygoogle"], [class*="ad-banner"], [class*="ad-slot"],
  [class*="ad-wrapper"], [class*="ad-unit"], [class*="ad-block"],
  [class*="advertisement"], [class*="sponsored-content"],
  [class*="taboola"], [class*="outbrain"], [class*="mgid"],
  [class*="revcontent"], [class*="zergnet"], [class*="content-ad"],
  ins.adsbygoogle, .adsbygoogle, #adsbygoogle,
  /* Common popup overlays */
  [class*="popup-overlay"], [class*="modal-overlay"][style*="z-index: 9"],
  [id*="popup-container"], [class*="cookie-consent"],
  /* Sticky ad bars */
  [class*="sticky-ad"], [class*="fixed-ad"], [id*="sticky-ad"],
  [class*="bottom-ad-bar"], [class*="top-ad-bar"],
  /* Video ad overlays */
  [class*="video-ad-overlay"], [class*="preroll-ad"],
  /* Taboola / Outbrain widget wrappers */
  .trc_related_container, .OUTBRAIN, #taboola-below-article-thumbnails
  { display: none !important; visibility: hidden !important; }
`;

function injectCSS() {
  if (!document.head) return;
  const style = document.createElement('style');
  style.id = '__mybrowser_adblock_css__';
  style.textContent = AD_CSS;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectCSS);
} else {
  injectCSS();
}

// ─── MutationObserver: hide ad nodes added dynamically ───────────────────────
const AD_HOSTNAMES = new Set([
  'doubleclick.net','googlesyndication.com','adnxs.com','taboola.com',
  'outbrain.com','revcontent.com','mgid.com','media.net',
]);

function hideAdNode(node) {
  if (node.nodeType !== 1) return;
  // Hide iframes pointing to ad domains
  if (node.tagName === 'IFRAME') {
    try {
      const host = new URL(node.src || '').hostname;
      if (AD_HOSTNAMES.has(host) || [...AD_HOSTNAMES].some(d => host.endsWith('.' + d))) {
        node.style.setProperty('display', 'none', 'important');
      }
    } catch (e) {}
  }
  // Hide script-injected ad divs
  const cl = (node.className || '').toString() + (node.id || '');
  if (/ad[-_]|ads[-_]|advert|adsense|taboola|outbrain|sponsored/i.test(cl)) {
    node.style.setProperty('display', 'none', 'important');
  }
}

const observer = new MutationObserver(mutations => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      hideAdNode(node);
    }
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
