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
  const nextButton = document.querySelector('#next-button');
  const cartBox = document.querySelector('#cart');
  const cartList = document.querySelector('#cart-list');
  const cartTotal = document.querySelector('#cart-total');
  const itemEditor = document.querySelector('#item-editor');
  const itemTitle = document.querySelector('#item-title');
  const dialog = document.querySelector('#summary-dialog');
  const summaryCustomer = document.querySelector('#summary-customer');
  const summaryList = document.querySelector('#summary-list');
  const summaryTotal = document.querySelector('#summary-total');
  const summaryCount = document.querySelector('#summary-count');
  const summaryNo = document.querySelector('#summary-no');
  // 訂單編號（台北日期 YYMMDD-4 碼流水號，例如 261116-0001）由資料庫 place_order 函式產生。
  const ORDER_NO_PENDING = '送出後產生';
  const LIST_LIMIT = 50;
  const summaryMessage = document.querySelector('#summary-message');
  const summaryBack = document.querySelector('#summary-back');
  const summaryConfirm = document.querySelector('#summary-confirm');
  const SUBMIT_LABEL = '完成訂單 ↗';
  // 一次訂單最多幾項飲品（每項可再指定數量）。
  const CART_MAX = 20;
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
  // 依訂單編號分組；沒有編號的舊資料各自成為一張訂單。資料已依時間由新到舊排序。
  function groupOrders(rows) {
    const groups = [];
    const byKey = new Map();
    rows.forEach(row => {
      const key = row.order_no ? `no:${row.order_no}` : `id:${row.id}`;
      let group = byKey.get(key);
      if (!group) {
        group = { orderNo: row.order_no, customerName: row.customer_name, createdAt: row.created_at, items: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push(row);
    });
    return groups;
  }
  const rowTotal = row => (Number(row.amount) || 0) * (Number(row.quantity) || 0);
  function renderOrders() {
    const visibleOrders = selectedStatus === '全部' ? orders
      : orders.filter(order => order.status === selectedStatus);
    const groups = groupOrders(visibleOrders);
    const cards = groups.map(group => {
      const card = element('li', 'order-card', '');
      const top = element('div', 'order-top', '');
      top.append(element('h3', 'order-no', group.orderNo ? `訂單 ${group.orderNo}` : '訂單（無編號）'),
        element('span', 'badge amount', `合計 ${money(group.items.reduce((sum, row) => sum + rowTotal(row), 0))}`));
      const items = element('ul', 'order-items', '');
      items.append(...group.items.map(row => {
        const item = element('li', 'order-item', '');
        const line = element('div', 'order-item-line', '');
        line.append(element('strong', 'order-item-name', `${row.drink} × ${row.quantity}`),
          element('span', 'order-item-price', money(rowTotal(row))));
        const tags = element('div', 'order-item-tags', '');
        tags.append(element('span', 'badge', row.sugar),
          element('span', 'badge', row.ice),
          element('span', `badge status ${statusClass(row.status)}`, row.status),
          element('span', 'order-item-meta', `每杯 ${money(row.amount)}`));
        item.append(line, tags);
        if (row.note) item.append(element('p', 'order-note', `備註：${row.note}`));
        return item;
      }));
      card.append(top, items, element('div', 'order-meta', `${group.customerName} · ${formatTime(group.createdAt)}`));
      return card;
    });
    list.replaceChildren(...cards);
    const cups = visibleOrders.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0);
    const total = visibleOrders.reduce((sum, order) => sum + rowTotal(order), 0);
    cupTotal.textContent = `${selectedStatus === '全部' ? '' : `「${selectedStatus}」`}共 ${groups.length} 張訂單、${cups} 杯，合計 ${money(total)}`;
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
        .select('id,order_no,customer_name,drink,sugar,ice,amount,quantity,note,status,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LIST_LIMIT);
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
  // ---- 多杯點餐：已點飲品暫存於本頁記憶體，不寫入瀏覽器儲存空間 ----
  let cart = [];
  let pendingItems = [];
  let pendingCustomer = '';
  const ITEM_FIELDS = ['drink', 'amount', 'quantity', 'note'];
  const lineTotal = item => item.amount * item.quantity;
  const sumOf = items => items.reduce((sum, item) => sum + lineTotal(item), 0);
  const cupsOf = items => items.reduce((sum, item) => sum + item.quantity, 0);
  const describe = item => `${item.sugar}・${item.ice}・每杯 ${money(item.amount)}${item.note ? `・備註：${item.note}` : ''}`;
  const itemIsEmpty = () => ['drink', 'amount', 'note'].every(name => !String(form.elements[name].value || '').trim());
  // 讀取目前這一杯；有誤時顯示訊息並回傳 null。
  function readItem() {
    for (const name of ITEM_FIELDS) {
      if (!form.elements[name].reportValidity()) return null;
    }
    const values = new FormData(form);
    const text = key => String(values.get(key) || '').trim();
    const item = { drink: text('drink'), sugar: text('sugar'), ice: text('ice') };
    if (!item.drink || !item.sugar || !item.ice) {
      showMessage(formMessage, '請填寫飲品並選擇糖份與冰量，內容不可只有空白。', 'error');
      form.elements.drink.focus();
      return null;
    }
    item.amount = wholeNumber(values.get('amount'), AMOUNT_MAX);
    if (!item.amount) {
      showMessage(formMessage, `金額須為 1 到 ${AMOUNT_MAX} 元的整數（每杯價格）。`, 'error');
      return null;
    }
    item.quantity = wholeNumber(values.get('quantity'), QUANTITY_MAX);
    if (!item.quantity) {
      showMessage(formMessage, `數量須為 1 到 ${QUANTITY_MAX} 杯的整數。`, 'error');
      return null;
    }
    item.note = text('note') || null;
    return item;
  }
  // 清空目前這一杯，保留點餐人；糖份與冰量回到預設值。
  function resetItem() {
    ITEM_FIELDS.forEach(name => {
      const field = form.elements[name];
      field.value = field.defaultValue;
    });
    form.querySelectorAll('#item-editor input[type=radio]').forEach(radio => { radio.checked = radio.defaultChecked; });
    updateSubtotal();
  }
  function renderCart() {
    form.dataset.cartCount = String(cart.length);
    itemTitle.textContent = `第 ${cart.length + 1} 杯`;
    nextButton.disabled = submitting || cart.length >= CART_MAX - 1;
    cartBox.hidden = !cart.length;
    cartTotal.textContent = cart.length ? `${cart.length} 項、${cupsOf(cart)} 杯，小計 ${money(sumOf(cart))}` : '';
    cartList.replaceChildren(...cart.map((item, index) => {
      const row = element('li', 'cart-item', '');
      const label = element('div', 'cart-item-text', `${index + 1}. ${item.drink} × ${item.quantity}`);
      label.append(element('small', '', describe(item)));
      const end = element('div', 'cart-item-end', '');
      const remove = element('button', 'cart-remove', '移除');
      remove.type = 'button';
      remove.setAttribute('aria-label', `移除第 ${index + 1} 項 ${item.drink}`);
      remove.addEventListener('click', () => {
        cart.splice(index, 1);
        renderCart();
        showMessage(formMessage, `已移除「${item.drink}」。`);
      });
      end.append(element('span', 'cart-item-price', money(lineTotal(item))), remove);
      row.append(label, end);
      return row;
    }));
  }
  // 「新增下一筆飲品」：把目前這一杯加入已點清單，換成新的一頁點下一杯。
  nextButton.addEventListener('click', () => {
    if (submitting) return;
    if (cart.length >= CART_MAX - 1) {
      showMessage(formMessage, `一次最多點 ${CART_MAX} 項，請先按「完成訂單」。`, 'error');
      return;
    }
    const item = readItem();
    if (!item) return;
    cart.push(item);
    resetItem();
    renderCart();
    itemEditor.classList.remove('page-in');
    void itemEditor.offsetWidth;
    itemEditor.classList.add('page-in');
    showMessage(formMessage, `已加入第 ${cart.length} 項「${item.drink}」，請點選下一杯飲品。`, 'success');
    itemTitle.scrollIntoView({ block: 'start', behavior: 'smooth' });
    form.elements.drink.focus({ preventScroll: true });
  });
  // 「完成訂單」：合併已點清單與目前這一杯，跳出確認頁並自動加總金額。
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (submitting) return;
    if (!navigator.onLine) {
      showMessage(formMessage, '目前離線，訂單尚未送出。請恢復連線後再送出；不會自動補送。', 'error');
      return;
    }
    if (!client) return;
    const nameField = form.elements.customer_name;
    if (!nameField.reportValidity()) return;
    const customerName = nameField.value.trim();
    if (!customerName) {
      showMessage(formMessage, '請填寫點餐人，內容不可只有空白。', 'error');
      nameField.focus();
      return;
    }
    let items = cart.slice();
    if (!itemIsEmpty() || !cart.length) {
      const item = readItem();
      if (!item) return;
      items.push(item);
    }
    pendingCustomer = customerName;
    pendingItems = items;
    summaryNo.textContent = ORDER_NO_PENDING;
    summaryNo.classList.add('pending');
    summaryCustomer.textContent = `點餐人：${customerName}`;
    summaryList.replaceChildren(...pendingItems.map((item, index) => {
      const row = element('li', 'summary-item', '');
      const label = element('div', 'summary-item-text', `${index + 1}. ${item.drink} × ${item.quantity}`);
      label.append(element('small', '', describe(item)));
      row.append(label, element('span', 'summary-item-price', money(lineTotal(item))));
      return row;
    }));
    summaryTotal.textContent = money(sumOf(pendingItems));
    summaryCount.textContent = `${pendingItems.length} 項、${cupsOf(pendingItems)} 杯`;
    showMessage(summaryMessage, '');
    summaryConfirm.disabled = false;
    summaryConfirm.textContent = '確認送出';
    summaryBack.disabled = false;
    dialog.showModal();
  });
  summaryBack.addEventListener('click', () => { if (!submitting) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
  summaryConfirm.addEventListener('click', async () => {
    if (submitting || !pendingItems.length) return;
    if (!navigator.onLine) {
      showMessage(summaryMessage, '目前離線，訂單尚未送出。請恢復連線後再按「確認送出」。', 'error');
      return;
    }
    submitting = true;
    summaryConfirm.disabled = true;
    summaryBack.disabled = true;
    submitButton.disabled = true;
    nextButton.disabled = true;
    summaryConfirm.textContent = '正在送出…';
    showMessage(summaryMessage, '正在送出訂單…');
    const items = pendingItems;
    try {
      // 由資料庫 place_order 在同一交易內取得當日流水號並新增整張訂單，全部成功或全部失敗。
      const { data: orderNo, error } = await client.rpc('place_order', {
        p_customer_name: pendingCustomer,
        p_items: items.map(({ drink, sugar, ice, amount, quantity, note }) => ({ drink, sugar, ice, amount, quantity, note }))
      });
      if (error) throw error;
      if (typeof orderNo !== 'string' || !orderNo) throw new Error('未取得訂單編號，請重新整理清單確認是否已下單。');
      summaryNo.textContent = orderNo;
      summaryNo.classList.remove('pending');
      dialog.close();
      cart = [];
      pendingItems = [];
      form.reset();
      updateSubtotal();
      showMessage(formMessage, `訂單已成功送出！訂單編號 ${orderNo}，共 ${items.length} 項、${cupsOf(items)} 杯，合計 ${money(sumOf(items))}。`, 'success');
      await loadOrders();
    } catch (error) {
      showMessage(summaryMessage, `送出失敗，已點內容都保留。請確認連線後重試；若連線中斷，請先關閉此視窗並重新整理清單確認是否已下單。錯誤：${error.message || '連線失敗'}`, 'error');
      summaryConfirm.disabled = false;
      summaryBack.disabled = false;
      summaryConfirm.textContent = '重新送出';
    } finally {
      submitting = false;
      submitButton.disabled = !navigator.onLine;
      submitButton.textContent = SUBMIT_LABEL;
      renderCart();
    }
  });
  renderCart();
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
