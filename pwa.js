(() => {
  'use strict';
  const message = document.querySelector('#connection-message');
  const installButton = document.querySelector('#install-button');
  const showConnection = () => {
    message.hidden = navigator.onLine;
    message.textContent = '目前離線：可開啟已快取的操作介面；送出訂單與更新清單需要連線。輸入內容不會儲存或自動補送，請勿關閉或重新載入尚未送出的表單。';
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
  // 新版更新提示：新版 Service Worker 安裝完成後只顯示提示，不自動重新載入，
  // 由使用者按「立即更新」才啟用新版並重新載入，避免清除填到一半的表單。
  const updateBanner = document.querySelector('#update-banner');
  const updateText = document.querySelector('#update-text');
  const updateButton = document.querySelector('#update-button');
  let waitingWorker = null;
  let updateRequested = false;
  let reloading = false;
  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };
  const showUpdate = (worker, text = '有新版本可以使用。') => {
    waitingWorker = worker;
    updateText.textContent = text;
    updateBanner.hidden = false;
  };
  const watchInstalling = worker => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      // 第一次安裝時頁面尚未受控，不需要提示更新。
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
    });
  };
  const formHasInput = () => {
    const form = document.querySelector('#order-form');
    if (!form) return false;
    return ['customer_name', 'drink', 'amount', 'note'].some(name => {
      const field = form.elements[name];
      return field && String(field.value || '').trim() !== '';
    });
  };
  updateButton.addEventListener('click', () => {
    if (formHasInput() && !window.confirm('表單中尚未送出的內容會在更新後清除，確定要立即更新嗎？')) return;
    updateButton.disabled = true;
    updateText.textContent = '正在更新…';
    if (waitingWorker && waitingWorker.state === 'installed') {
      updateRequested = true;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // 新版已由其他分頁啟用，直接重新載入即可取得新介面。
      reloadOnce();
    }
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateRequested) {
        reloadOnce();
      } else if (!updateBanner.hidden || waitingWorker) {
        // 其他分頁已啟用新版；本頁仍是舊介面，提示使用者自行重新載入。
        showUpdate(null, '新版本已在其他分頁啟用。');
      }
    });
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
        watchInstalling(registration.installing);
        registration.addEventListener('updatefound', () => watchInstalling(registration.installing));
        // 回到頁面時順便檢查是否有新版，讓長時間開啟的分頁也能收到提示。
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
        });
      } catch {
        message.hidden = false;
        message.textContent = '離線介面尚未準備完成，請保持連線使用，並於稍後重新載入頁面重試。';
      }
    });
  }
})();
