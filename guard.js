// Second line of blocking. The declarativeNetRequest rules normally stop a blocked
// site before it loads, but some Chromium browsers (Comet, for one) let pages through
// anyway. This asks the worker on every page load and leaves for the block page if so.
(() => {
  if (window.top !== window) return;
  const check = () => chrome.runtime.sendMessage({ type: 'checkBlocked', url: location.href })
    .then((r) => { if (r && r.redirect) location.replace(r.redirect); })
    .catch(() => {});
  check();
  // A page restored from the back/forward cache never makes a new request.
  addEventListener('pageshow', (e) => { if (e.persisted) check(); });
})();
