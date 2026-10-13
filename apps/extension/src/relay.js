/**
 * Isolated-world content script: forwards captures from capture-main.js to the
 * service worker. Only messages from this same window with our tag are relayed.
 */
const TAG = 'sports-better/kambi-history';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== TAG) return;
  const { url, body } = event.data;
  if (typeof url !== 'string' || typeof body !== 'object' || body === null) return;
  chrome.runtime.sendMessage({ type: 'history-captured', url, body }).catch(() => {
    // Service worker may be restarting; the page will reload history again later.
  });
});
