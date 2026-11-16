(() => {
  'use strict';
  const form = document.querySelector('#order-form');
  const submitButton = document.querySelector('#submit-button');
  const refreshButton = document.querySelector('#refresh-button');
  const formMessage = document.querySelector('#form-message');
  const listMessage = document.querySelector('#list-message');
  const cupTotal = document.querySelector('#cup-total');
  const list = document.querySelector('#order-list');
  const filterButtons = document.querySelectorAll('[data-status-filter]');
  const SUBMIT_LABEL = '送出訂單 ↗';
  // 金額（每杯）與數量由點餐人依實際價目輸入；範圍須與 supabase/schema.sql 的 CHECK 一致。
  const AMOUNT_MAX = 9999;
  const QUANTITY_MAX = 50;
  const subtotal = document.querySelector('#subtotal');
  const money = value => `NT$${Number(value).toLocaleString('zh-TW')}`;
  const wholeNumber = (value, max) => {
    const raw = String(value || '').trim();
    const number = Number(raw);
    return raw !== '' && Number.isInteger(number) && number >= 1 && number <= max ? number : null;
  };
  const updateSubtotal = () => {
    const amount = wholeNumber(form.elements.amount.value, AMOUNT_MAX);
    const quantity = wholeNumber(form.elements.quantity.value, QUANTITY_MAX);
    subtotal.textContent = amount && quantity ? `小計：${money(amount)} × ${quantity} 杯 = ${money(amount * quantity)}` : '小計：請輸入金額與數量';
  };
  form.addEventListener('input', updateSubtotal);
  let orders = [];
  let selectedStatus = '全部';
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
  const statusClass = status => status === '已完成' ? 'done' : status === '製作中' ? 'making' : '';
  function renderOrders() {
    const visibleOrders = selectedStatus === '全部' ? orders
      : orders.filter(order => order.status === selectedStatus);
    const cards = visibleOrders.map(order => {
      const card = element('li', 'order-card', '');
      const top = element('div', 'order-top', '');
      top.append(element('h3', '', `${order.drink} × ${order.quantity}`),
        element('span', 'badge amount', money(order.amount * order.quantity)),
        element('span', 'badge', order.sugar),
        element('span', 'badge', order.ice),
        element('span', `badge status ${statusClass(order.status)}`, order.status));
      card.append(top);
      if (order.note) card.append(element('p', 'order-note', `備註：${order.note}`));
      card.append(element('div', 'order-meta', `${order.customer_name} · 每杯 ${money(order.amount)} · ${formatTime(order.created_at)}`));
      return card;
    });
    list.replaceChildren(...cards);
    const cups = visibleOrders.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0);
    const total = visibleOrders.reduce((sum, order) => sum + (Number(order.amount) || 0) * (Number(order.quantity) || 0), 0);
    cupTotal.textContent = `${selectedStatus === '全部' ? '' : `「${selectedStatus}」`}共 ${cards.length} 筆、${cups} 杯，合計 ${money(total)}`;
    cupTotal.hidden = !cards.length;
    showMessage(listMessage, !navigator.onLine ? '目前離線，無法取得最新訂單。已顯示的紀錄僅保留於本次開啟的頁面。'
      : loading ? '正在載入訂單…'
      : loadError ? loadError
      : !hasLoaded ? '訂單尚未載入，請確認網路後重新載入頁面。'
      : cards.length ? '' : orders.length
      ? `目前沒有狀態為「${selectedStatus}」的訂單。`
      : '目前沒有訂單，歡迎點第一杯飲料。',
      navigator.onLine && loadError && !loading ? 'error' : '');
  }
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectedStatus = button.dataset.statusFilter;
      filterButtons.forEach(filter => {
        filter.setAttribute('aria-pressed', String(filter === button));
      });
      renderOrders();
    });
  });
  async function loadOrders() {
    if (loading || !client) return;
    if (!navigator.onLine) { renderOrders(); return; }
    loading = true;
    refreshButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    showMessage(listMessage, '正在載入訂單…');
    try {
      const { data, error } = await client.from('drink_orders')
        .select('id,customer_name,drink,sugar,ice,amount,quantity,note,status,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
      if (error) throw error;
      orders = data || [];
      hasLoaded = true;
      loadError = '';
    } catch (error) {
      loadError = `無法載入訂單，請按「重新整理」重試。${orders.length ? '下方保留上次載入的紀錄。' : ''} 錯誤：${error.message || '連線失敗'}`;
    } finally {
      loading = false;
      refreshButton.disabled = !navigator.onLine;
      renderOrders();
      list.setAttribute('aria-busy', 'false');
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!navigator.onLine) {
      showMessage(formMessage, '目前離線，訂單尚未送出。請恢復連線後再送出；不會自動補送。', 'error');
      return;
    }
    if (submitting || !client || !form.reportValidity()) return;
    const values = new FormData(form);
    const text = key => String(values.get(key) || '').trim();
    const payload = Object.fromEntries(['customer_name', 'drink', 'sugar', 'ice']
      .map(key => [key, text(key)]));
    if (Object.values(payload).some(value => !value)) {
      showMessage(formMessage, '請完整填寫所有欄位，內容不可只有空白。', 'error');
      return;
    }
    const amount = wholeNumber(values.get('amount'), AMOUNT_MAX);
    if (!amount) {
      showMessage(formMessage, `金額須為 1 到 ${AMOUNT_MAX} 元的整數（每杯價格）。`, 'error');
      return;
    }
    const quantity = wholeNumber(values.get('quantity'), QUANTITY_MAX);
    if (!quantity) {
      showMessage(formMessage, `數量須為 1 到 ${QUANTITY_MAX} 杯的整數。`, 'error');
      return;
    }
    Object.assign(payload, { amount, quantity });
    const note = text('note');
    if (note) payload.note = note;
    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = '正在送出…';
    showMessage(formMessage, '正在送出訂單…');
    try {
      const { error } = await client.from('drink_orders').insert(payload);
      if (error) throw error;
      form.reset();
      updateSubtotal();
      showMessage(formMessage, '訂單已成功送出！飲料準備中，請留意清單狀態。', 'success');
      await loadOrders();
    } catch (error) {
      showMessage(formMessage, `送出失敗，已保留填寫內容。請確認連線後重試；若連線中斷，請先重新整理清單確認是否已下單。錯誤：${error.message || '連線失敗'}`, 'error');
    } finally {
      submitting = false;
      submitButton.disabled = !navigator.onLine;
      submitButton.textContent = SUBMIT_LABEL;
    }
  });
  refreshButton.addEventListener('click', loadOrders);
  const updateConnection = () => {
    submitButton.disabled = submitting || !client || !navigator.onLine;
    refreshButton.disabled = loading || !client || !navigator.onLine;
    renderOrders();
  };
  window.addEventListener('offline', updateConnection);
  window.addEventListener('online', updateConnection);
  try {
    const config = window.ORDER_CONFIG;
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) }
    });
    updateSubtotal();
    updateConnection();
    loadOrders();
  } catch {
    submitButton.disabled = true;
    refreshButton.disabled = true;
    showMessage(formMessage, '服務初始化失敗，請確認網路及設定後重新載入頁面。', 'error');
    loadError = '無法連線至點餐服務，請恢復連線後重新載入頁面。';
    renderOrders();
  }
})();
