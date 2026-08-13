const SCAN_API_PATH = '/api/scan';
const money = value => `$${Number(value).toFixed(1)}`;
const statusClass = status => status === '核心首選' ? 'good' : status?.includes('等待') ? 'warn' : '';

function card(stock) {
  return `<article class="card"><div class="card-top"><span class="code">#${stock.code}</span><span class="score">${stock.total}</span></div><div class="name">${stock.name}</div><div class="sector">${stock.sector} · ${stock.status}</div><div class="metrics"><div class="metric"><span>現價／合理價</span><b>${money(stock.price)} / ${money(stock.valuation.fairValue)}</b></div><div class="metric"><span>Forward PE</span><b>${stock.valuation.forwardPe} 倍</b></div><div class="metric"><span>支撐／停損</span><b>${money(stock.support)} / ${money(stock.stop)}</b></div><div class="metric"><span>風報比</span><b class="${stock.rr >= 1.5 ? 'good' : 'warn'}">1 : ${stock.rr.toFixed(1)}</b></div></div></article>`;
}

function render(data) {
  const ranked = Array.isArray(data.ranked) ? data.ranked : [];
  const top3 = Array.isArray(data.top3) ? data.top3 : (data.recommendations?.top3 ?? []);
  const top12 = Array.isArray(data.top12) ? data.top12 : (data.recommendations?.top12 ?? []);
  const watch = Array.isArray(data.watch) ? data.watch : (data.recommendations?.watch ?? []);
  const coverage = data.coverage ?? {};
  document.querySelector('#asof').textContent = data.asOf ?? '未提供';
  document.querySelector('#count').textContent = `${data.candidateCount ?? coverage.total ?? ranked.length} 檔`;
  document.querySelector('#top3count').textContent = `${top3.length} 檔`;
  document.querySelector('#market-mode').textContent = data.marketMode === 'bull' ? '多頭模式' : data.marketMode === 'bear' ? '空頭模式' : '震盪模式';
  document.querySelector('#provider').textContent = data.dataSource ?? data.provider ?? 'missing';
  document.querySelector('#freshness').textContent = data.freshness?.fresh === false ? '已過期' : '有效';
  document.querySelector('#bars-coverage').textContent = `${data.dailyCoverageCount ?? coverage.dailyBars ?? 0}／${data.weeklyCoverageCount ?? coverage.weeklyBars ?? 0} 檔`;
  document.querySelector('#release-status').textContent = data.release?.publish ? '允許發布' : '暫停發布';
  document.querySelector('#top3').innerHTML = top3.length ? top3.map(card).join('') : '<div class="card">目前沒有同時符合完整進場條件的標的。</div>';
  document.querySelector('#top12').innerHTML = '<div class="row head"><span>排名</span><span>股票</span><span>估值</span><span>分數</span><span>狀態</span><span>風報比</span></div>' + top12.map((stock, index) => `<div class="row"><span>${index + 1}</span><span class="stock"><strong>${stock.name}</strong><span>${stock.code}</span></span><span>${stock.valuation.label}</span><span class="score">${stock.total}</span><span class="${statusClass(stock.status)}">${stock.status}</span><span>1:${stock.rr.toFixed(1)}</span></div>`).join('');
  document.querySelector('#watch').innerHTML = watch.map(stock => `<div class="watch-item"><b>${stock.code} ${stock.name}</b><span class="${statusClass(stock.status)}">${stock.status} · ${stock.total}分</span></div>`).join('') || '<span class="muted">目前沒有觀察標的</span>';
  const insufficient = data.insufficientData?.length ?? coverage.insufficient ?? 0;
  document.querySelector('#source-note').textContent = `資料日期：${data.asOf} · 官方資料來源：${data.dataSource ?? data.provider} · 資料不足：${insufficient} 檔 · ${data.release?.failures?.join('、') || '發布條件通過'}`;
}

function showError(reason, pending = false) {
  const existing = document.querySelector('#load-error');
  const html = `<p id="load-error" class="warn">${pending ? '正式掃描進行中' : '資料載入失敗'}：${reason}</p>`;
  if (existing) existing.outerHTML = html;
  else document.querySelector('main').insertAdjacentHTML('beforeend', html);
}

async function loadDashboard() {
  try {
    const response = await fetch(SCAN_API_PATH, { headers:{ accept:'application/json' }, cache:'no-store' });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new Error(`API 回傳非 JSON（HTTP ${response.status}）`);
    const payload = await response.json();
    if (!response.ok) {
      const reason = payload.error?.reason ?? `HTTP ${response.status}`;
      showError(reason, response.status === 202);
      if (response.status === 202) setTimeout(loadDashboard, 15000);
      return;
    }
    document.querySelector('#load-error')?.remove();
    render(payload);
  } catch (error) {
    showError(error.message);
  }
}

loadDashboard();
