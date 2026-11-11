(() => {
  'use strict';
  const form = document.querySelector('#repair-form');
  const submitButton = document.querySelector('#submit-button');
  const refreshButton = document.querySelector('#refresh-button');
  const formMessage = document.querySelector('#form-message');
  const listMessage = document.querySelector('#list-message');
  const list = document.querySelector('#request-list');
  const filterButtons = document.querySelectorAll('[data-urgency-filter]');
  let requests = [];
  let selectedUrgency = '全部';
  let hasLoaded = false;
  let loadError = '';
  let client;
  let submitting = false;
  let loading = false;
  const showMessage = (element, text, type = '') => {
    element.textContent = text;
    element.className = `message ${type}`;
    element.hidden = !text;
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const formatTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '時間未提供' : new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date) + '（台北時間）';
  };
  function renderRequests() {
    const visibleRequests = selectedUrgency === '全部' ? requests
      : requests.filter(request => request.urgency === selectedUrgency);
    const cards = visibleRequests.map(request => {
      const card = element('li', 'request-card', '');
      const top = element('div', 'request-top', '');
      top.append(element('h3', '', request.location), element('span', 'badge', request.category),
        element('span', `badge ${request.urgency === '高' ? 'high' : ''}`, `緊急：${request.urgency}`),
        element('span', 'badge', request.status));
      card.append(top, element('p', 'request-description', request.description),
        element('div', 'request-meta', `${request.reporter_name} · ${formatTime(request.created_at)}`));
      return card;
    });
    list.replaceChildren(...cards);
    showMessage(listMessage, !navigator.onLine ? '目前離線，無法取得最新清單。已顯示的紀錄僅保留於本次開啟的頁面。'
      : loading ? '正在載入報修紀錄…'
      : loadError ? loadError
      : !hasLoaded ? '清單尚未載入，請確認網路後重新載入頁面。'
      : cards.length ? '' : requests.length
      ? `目前沒有緊急程度為「${selectedUrgency}」的報修紀錄。`
      : '目前沒有報修紀錄，歡迎登記第一筆報修。',
      navigator.onLine && loadError && !loading ? 'error' : '');
  }
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectedUrgency = button.dataset.urgencyFilter;
      filterButtons.forEach(filter => {
        filter.setAttribute('aria-pressed', String(filter === button));
      });
      renderRequests();
    });
  });
  async function loadRequests() {
    if (loading || !client) return;
    if (!navigator.onLine) { renderRequests(); return; }
    loading = true;
    refreshButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    showMessage(listMessage, '正在載入報修紀錄…');
    try {
      const { data, error } = await client.from('repair_requests')
        .select('id,reporter_name,location,category,description,urgency,status,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
      if (error) throw error;
      requests = data || [];
      hasLoaded = true;
      loadError = '';
    } catch (error) {
      loadError = `無法載入清單，請按「重新整理」重試。${requests.length ? '下方保留上次載入的紀錄。' : ''} 錯誤：${error.message || '連線失敗'}`;
    } finally {
      loading = false;
      refreshButton.disabled = !navigator.onLine;
      renderRequests();
      list.setAttribute('aria-busy', 'false');
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!navigator.onLine) {
      showMessage(formMessage, '目前離線，報修尚未送出。請恢復連線後再送出；不會自動補送。', 'error');
      return;
    }
    if (submitting || !client || !form.reportValidity()) return;
    const values = new FormData(form);
    const payload = Object.fromEntries(['reporter_name', 'location', 'category', 'description', 'urgency']
      .map(key => [key, String(values.get(key) || '').trim()]));
    if (Object.values(payload).some(value => !value)) {
      showMessage(formMessage, '請完整填寫所有欄位，內容不可只有空白。', 'error');
      return;
    }
    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = '正在送出…';
    showMessage(formMessage, '正在送出報修…');
    try {
      const { error } = await client.from('repair_requests').insert(payload);
      if (error) throw error;
      form.reset();
      showMessage(formMessage, '報修已成功登記！感謝你協助改善環境。', 'success');
      await loadRequests();
    } catch (error) {
      showMessage(formMessage, `送出失敗，已保留填寫內容。請確認連線後重試；若連線中斷，請先重新整理清單確認是否已登記。錯誤：${error.message || '連線失敗'}`, 'error');
    } finally {
      submitting = false;
      submitButton.disabled = !navigator.onLine;
      submitButton.textContent = '送出報修 ↗';
    }
  });
  refreshButton.addEventListener('click', loadRequests);
  const updateConnection = () => {
    submitButton.disabled = submitting || !client || !navigator.onLine;
    refreshButton.disabled = loading || !client || !navigator.onLine;
    renderRequests();
  };
  window.addEventListener('offline', updateConnection);
  window.addEventListener('online', updateConnection);
  try {
    const config = window.REPAIR_CONFIG;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }
    });
    updateConnection();
    loadRequests();
  } catch {
    submitButton.disabled = true;
    refreshButton.disabled = true;
    showMessage(formMessage, '服務初始化失敗，請確認網路及設定後重新載入頁面。', 'error');
    loadError = '無法連線至報修服務，請恢復連線後重新載入頁面。';
    renderRequests();
  }
})();
