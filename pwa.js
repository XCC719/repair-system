(() => {
  'use strict';
  const message = document.querySelector('#connection-message');
  const installButton = document.querySelector('#install-button');
  const showConnection = () => {
    message.hidden = navigator.onLine;
    message.textContent = '目前離線：可開啟已快取的操作介面；送出報修與更新清單需要連線。輸入內容不會儲存或自動補送，請勿關閉或重新載入尚未送出的表單。';
  };
  showConnection();
  window.addEventListener('online', showConnection);
  window.addEventListener('offline', showConnection);

  let installPrompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    installButton.hidden = true;
    await prompt.prompt();
    await prompt.userChoice;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        message.hidden = false;
        message.textContent = '離線介面尚未準備完成，請保持連線使用，並於稍後重新載入頁面重試。';
      });
    });
  }
})();
