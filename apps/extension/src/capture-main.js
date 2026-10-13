/**
 * Runs in the Island Luck page's own JS world (MAIN) at document_start.
 *
 * Wraps fetch and XMLHttpRequest so that when the page's Kambi client loads
 * coupon/history.json, a copy of the response body is handed to the extension.
 * Nothing about the request (headers, cookies, tokens) is read or copied, and
 * the page's own request and response are left untouched.
 */
(() => {
  const TAG = 'sports-better/kambi-history';
  const HISTORY_PATH = /\/player\/api\/v\d+\/[^/]+\/coupon\/history\.json/;

  if (window[TAG]) return;
  window[TAG] = true;

  const post = (url, text) => {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return;
    }
    window.postMessage({ source: TAG, url: String(url), body }, window.location.origin);
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = res.url || (args[0] instanceof Request ? args[0].url : String(args[0]));
      if (HISTORY_PATH.test(url) && res.ok) {
        res.clone().text().then((t) => post(url, t), () => {});
      }
    } catch {
      // Never let capture break the page.
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (HISTORY_PATH.test(String(url))) {
        this.addEventListener('load', () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            const text =
              this.responseType === '' || this.responseType === 'text'
                ? this.responseText
                : this.responseType === 'json'
                  ? JSON.stringify(this.response)
                  : null;
            if (text) post(this.responseURL || url, text);
          } catch {
            // ignore
          }
        });
      }
    } catch {
      // ignore
    }
    return origOpen.call(this, method, url, ...rest);
  };
})();
