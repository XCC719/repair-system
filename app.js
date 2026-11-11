(() => {
  'use strict';
  const form = document.querySelector('#repair-form');
  const submitButton = document.querySelector('#submit-button');
  const refreshButton = document.querySelector('#refresh-button');
  const formMessage = document.querySelector('#form-message');
  const listMessage = document.querySelector('#list-message');
  const list = document.querySelector('#request-list');
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
  async function loadRequests() {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    showMessage(listMessage, '正在載入報修紀錄…');
    try {
      const { data, error } = await client.from('repair_requests')
        .select('id,reporter_name,location,category,description,urgency,status,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
      if (error) throw error;
      const cards = (data || []).map(request => {
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
      showMessage(listMessage, cards.length ? '' : '目前沒有報修紀錄，歡迎登記第一筆報修。');
    } catch (error) {
      showMessage(listMessage, `無法載入清單，請按「重新整理」重試。${list.children.length ? '下方保留上次載入的紀錄。' : ''} 錯誤：${error.message || '連線失敗'}`, 'error');
    } finally {
      loading = false;
      refreshButton.disabled = false;
      list.setAttribute('aria-busy', 'false');
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
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
      submitButton.disabled = false;
      submitButton.textContent = '送出報修 ↗';
    }
  });
  refreshButton.addEventListener('click', loadRequests);
  try {
    const config = window.REPAIR_CONFIG;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }
    });
    loadRequests();
  } catch {
    submitButton.disabled = true;
    refreshButton.disabled = true;
    showMessage(formMessage, '服務初始化失敗，請確認網路及設定後重新載入頁面。', 'error');
    showMessage(listMessage, '無法連線至報修服務。', 'error');
  }
})();
