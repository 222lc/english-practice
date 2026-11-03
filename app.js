/* 航空技术英语考试练习 —— 纯前端，进度存在本机 localStorage */
(function () {
  'use strict';
  const D = window.DATA;
  const $app = document.getElementById('app');

  // ---------- 存储 ----------
  const KEY = 'aviEn.v1';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  const store = Object.assign({ stats: {}, prefs: {} }, load());
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  // ---------- 题库条目 ----------
  const items = {};           // id -> {id, kind:'word'|'sent', en, zh, src}
  const add = (it) => (items[it.id] = it);
  D.vocab.forEach((w) => add({ id: 'w:' + w.en, kind: 'word', en: w.en, zh: w.zh, page: w.page, src: '词汇表 第' + w.page + '页' }));
  D.sentences.shared.forEach((s) => add({ id: 'S:' + s.n, kind: 'sent', en: s.en, zh: s.zh, page: s.page, src: '通用句 ' + s.n }));
  ['AE', 'AV', 'AI'].forEach((b) => (D.sentences[b] || []).forEach((s) => {
    if (s.dupOf) return; // 重复句合并
    add({ id: b + ':' + s.n, kind: 'sent', en: s.en, zh: s.zh, page: s.page, book: b, src: b + ' 第' + s.n + '句' });
  }));
  Object.keys(D.beisong).forEach((k) => D.beisong[k].forEach((s) => add({ id: 'B' + k + ':' + s.n, kind: 'sent', en: s.en, zh: s.zh, src: '背诵' + k + ' 第' + s.n + '句' })));

  const vocabPages = new Set(D.vocab.map((w) => w.page));
  const allWords = Object.values(items).filter((i) => i.kind === 'word');

  function bookSentences(book, pages) {
    const out = D.sentences.shared.filter((s) => pages.includes(s.page)).map((s) => 'S:' + s.n);
    (D.sentences[book] || []).forEach((s) => { if (!s.dupOf && pages.includes(s.page)) out.push(book + ':' + s.n); });
    return out;
  }

  // ---------- 25 次考试的单元定义 ----------
  const ALL = [1, 2, 3, 4, 5, 6];
  function sentPages(k, base) {
    const i = k - base; // 0..8
    if (i <= 5) return [i + 1];
    return [[1, 2, 3], [4, 5, 6], ALL][i - 6];
  }
  const UNITS = [];
  for (let k = 1; k <= 25; k++) {
    const u = { k, title: '第' + k + '次考试' };
    if (k <= 6) {
      u.phase = 1; u.vocabPages = [3 * k - 2, 3 * k - 1, 3 * k];
      u.desc = '词汇表 ' + u.vocabPages[0] + '–' + u.vocabPages[2] + ' 页';
    } else if (k <= 15) {
      u.phase = 2; u.books = ['AE', 'AV']; u.pages = sentPages(k, 7);
      u.desc = 'AE/AV 句子' + pageLabel(u.pages);
    } else if (k <= 24) {
      u.phase = 3; u.books = ['AI']; u.pages = sentPages(k, 16);
      u.desc = 'AI 句子' + pageLabel(u.pages);
    } else {
      u.phase = 4; u.title = '第25次 总决赛'; u.books = ['AE', 'AV', 'AI']; u.pages = ALL; u.allVocab = true;
      u.desc = '全部内容';
    }
    u.desc += ' + 背诵' + k;
    u.zh2enSent = k >= 16;
    UNITS.push(u);
  }
  function pageLabel(p) { return p.length === 6 ? ' 全部' : p.length === 1 ? ' 第' + p[0] + '页' : ' ' + p[0] + '–' + p[p.length - 1] + ' 页'; }

  // 单元内容；opts: {mixVocab, books}
  function unitContent(u, opts) {
    opts = opts || {};
    let words = [], sents = [];
    if (u.vocabPages) words = allWords.filter((w) => u.vocabPages.includes(w.page)).map((w) => w.id);
    if (u.allVocab || (u.phase >= 2 && opts.mixVocab)) words = allWords.map((w) => w.id);
    if (u.books) {
      const books = u.phase === 2 && opts.books ? opts.books : u.books;
      const set = new Set();
      books.forEach((b) => bookSentences(b, u.pages).forEach((id) => set.add(id)));
      sents = [...set];
    }
    if (u.phase === 4) Object.keys(D.beisong).forEach((k) => D.beisong[k].forEach((s) => sents.push('B' + k + ':' + s.n)));
    else if (D.beisong[u.k]) D.beisong[u.k].forEach((s) => sents.push('B' + u.k + ':' + s.n));
    return { words, sents };
  }
  function unitMissing(u) {
    const m = [];
    if (u.vocabPages && !u.vocabPages.every((p) => vocabPages.has(p))) m.push('词汇表第' + u.vocabPages.join('、') + '页');
    if (u.phase < 4 && !D.beisong[u.k]) m.push('背诵' + u.k);
    return m;
  }

  // ---------- 题型 ----------
  const TYPES = {
    w_e2c: { label: '单词 英→中', kind: 'word' },
    w_c2e: { label: '单词 中→英', kind: 'word' },
    s_e2c: { label: '句子 英→中', kind: 'sent' },
    s_c2e: { label: '句子 中→英', kind: 'sent' },
  };
  function unitTypes(u) { return u.zh2enSent ? ['w_e2c', 'w_c2e', 's_e2c', 's_c2e'] : ['w_e2c', 'w_c2e', 's_e2c']; }
  function keysFor(content, types) {
    const keys = [];
    types.forEach((t) => (TYPES[t].kind === 'word' ? content.words : content.sents).forEach((id) => keys.push(t + '|' + id)));
    return keys;
  }
  const stat = (key) => store.stats[key] || { right: 0, wrong: 0, streak: 0 };
  const mastered = (key) => stat(key).streak >= 2;
  const isWrong = (key) => { const s = store.stats[key]; return s && s.wrong > 0 && s.streak < 2; };

  function unitProgress(u) {
    const keys = keysFor(unitContent(u, { books: u.books }), unitTypes(u));
    const done = keys.filter(mastered).length;
    return { done, total: keys.length };
  }

  // ---------- 干扰项 ----------
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]; dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }
  function wordSim(a, b) {
    let pre = 0; const x = a.toLowerCase(), y = b.toLowerCase();
    while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
    return pre * 2 - lev(x, y) + (Math.random() * 1.5);
  }
  const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
  function sentSim(a, b) {
    const A = tokens(a), B = tokens(b); let c = 0;
    A.forEach((w) => B.has(w) && c++);
    return c / Math.sqrt(A.size * B.size + 1) + Math.random() * 0.3;
  }
  function distractors(it, field, pool) {
    const ans = it[field];
    const cands = pool.filter((o) => o.id !== it.id && o[field] !== ans);
    const sim = it.kind === 'word' ? (o) => wordSim(it.en, o.en) : (o) => sentSim(it.en, o.en);
    const ranked = cands.map((o) => [sim(o), o]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const picked = []; const seen = new Set([ans]);
    const take = (o) => { if (o && !seen.has(o[field])) { seen.add(o[field]); picked.push(o[field]); } };
    shuffle(ranked.slice(0, 6)).forEach((o) => picked.length < 2 && take(o));
    shuffle(cands).forEach((o) => picked.length < 3 && take(o));
    return picked;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function makeQuestion(key) {
    const [t, id] = [key.slice(0, 5), key.slice(6)];
    const it = items[id]; if (!it) return null;
    // 句子干扰项来自同一组：背诵N 用同一份背诵，AE/AV/AI 用这三本里的句子
    const grp = (x) => (x.id[0] === 'B' ? x.id.split(':')[0] : 'book');
    const pool = it.kind === 'word' ? allWords : Object.values(items).filter((i) => i.kind === 'sent' && grp(i) === grp(it));
    const e2c = t.endsWith('e2c');
    const field = e2c ? 'zh' : 'en';
    const opts = shuffle([it[field], ...distractors(it, field, pool)]);
    return { key, type: t, it, prompt: e2c ? it.en : it.zh, promptEn: e2c, options: opts, answer: it[field] };
  }

  // ---------- 出题 ----------
  function buildSession(keys, count) {
    const scored = keys.map((k) => {
      const s = stat(k);
      let p = Math.random();
      if (!mastered(k)) p += 2;
      if (isWrong(k)) p += 2 + Math.min(s.wrong, 5) * 0.5;
      if (s.right + s.wrong === 0) p += 1;
      return [p, k];
    }).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    return shuffle(count ? scored.slice(0, count) : scored);
  }

  // ---------- 界面 ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text.toLowerCase() === text ? text : text.replace(/\b[A-Z]{4,}\b/g, (w) => w.toLowerCase()));
      u.lang = 'en-US'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }
  const canSpeak = 'speechSynthesis' in window;
  function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }

  const PHASES = { 1: '第一阶段 · 词汇表', 2: '第二阶段 · AE/AV 句子 + 整本词汇', 3: '第三阶段 · AI 句子 + 整本词汇（加考句子中译英）', 4: '总决赛' };

  function home() {
    const wrongN = Object.keys(store.stats).filter(isWrong).length;
    let html = '<header class="top"><h1>航空技术英语</h1><p class="sub">按考试场次练习 · 进度保存在本机</p></header>';
    html += '<div class="actions"><button class="btn ghost" data-go="wrong"' + (wrongN ? '' : ' disabled') + '>错题本 <b>' + wrongN + '</b></button><button class="btn ghost" data-go="mix">多单元混合复习</button></div>';
    let phase = 0;
    UNITS.forEach((u) => {
      if (u.phase !== phase) { phase = u.phase; html += '<h2 class="phase">' + PHASES[phase] + '</h2>'; }
      const pr = unitProgress(u); const miss = unitMissing(u);
      const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
      html += '<button class="unit" data-unit="' + u.k + '"><div class="u-head"><span class="u-title">' + u.title + '</span><span class="u-pct">' + (pr.total ? pct + '%' : '') + '</span></div>' +
        '<div class="u-desc">' + u.desc + '</div>' +
        (pr.total ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
        (miss.length ? '<div class="u-miss">尚未录入：' + miss.join('、') + '</div>' : '') + '</button>';
    });
    html += '<footer class="foot">题库版本 ' + D.version + ' · <button class="link" data-go="reset">清空练习记录</button></footer>';
    render(html);
  }

  function unitSheet(k) {
    const u = UNITS[k - 1];
    const pref = Object.assign({ types: unitTypes(u), mixVocab: u.phase >= 2 && u.phase < 4, books: u.books || [], count: 20 }, store.prefs['u' + k] || {});
    const miss = unitMissing(u);
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>' + u.title + '</h1></header>';
    html += '<p class="sub pad">' + u.desc + '</p>';
    if (miss.length) html += '<p class="note pad">尚未录入：' + miss.join('、') + '。录入后会自动出现在练习里。</p>';
    html += '<form id="opt" class="card">';
    html += '<div class="field"><div class="label">题型</div><div class="chips">' + unitTypes(u).map((t) => chip('type', t, TYPES[t].label, pref.types.includes(t))).join('') + '</div></div>';
    if (u.phase === 2) html += '<div class="field"><div class="label">句子范围</div><div class="chips">' + ['AE', 'AV'].map((b) => chip('book', b, b, pref.books.includes(b))).join('') + '</div></div>';
    if (u.phase === 2 || u.phase === 3) html += '<label class="switch"><input type="checkbox" name="mix"' + (pref.mixVocab ? ' checked' : '') + '><span>混入整本词汇（优先出常错的词）</span></label>';
    html += '<div class="field"><div class="label">题数</div><div class="chips">' + [10, 20, 50, 0].map((n) => radio('count', n, n ? n + ' 题' : '全部', pref.count === n)).join('') + '</div></div>';
    html += '<p class="count" id="cnt"></p>';
    html += '<button type="submit" class="btn primary">开始练习</button></form>';
    html += '<button class="btn ghost wide" data-browse="' + k + '">浏览本单元全部内容</button>';
    render(html);
    const form = document.getElementById('opt');
    const read = () => {
      const fd = new FormData(form);
      return { types: fd.getAll('type'), books: u.phase === 2 ? fd.getAll('book') : u.books, mixVocab: !!fd.get('mix'), count: +fd.get('count') };
    };
    const upd = () => {
      const o = read(); const n = keysFor(unitContent(u, o), o.types).length;
      document.getElementById('cnt').textContent = '本次可练 ' + n + ' 道题';
    };
    form.addEventListener('change', upd); upd();
    form.addEventListener('submit', (e) => {
      e.preventDefault(); const o = read();
      store.prefs['u' + k] = o; save();
      const c = unitContent(u, o);
      const keys = keysFor(c, o.types);
      if (!keys.length) { document.getElementById('cnt').innerHTML = '<span class="warn">没有可练的题，请至少选一种题型</span>'; return; }
      let session;
      if (u.phase >= 2 && c.words.length && c.sents.length) {
        // 整本词汇是复习，本次新句子至少占六成
        const core = keysFor({ words: [], sents: c.sents }, o.types);
        const extra = keysFor({ words: c.words, sents: [] }, o.types);
        if (!o.count) session = shuffle(buildSession(core, 0).concat(buildSession(extra, 0)));
        else {
          const n1 = Math.min(core.length, Math.ceil(o.count * 0.6));
          session = shuffle(buildSession(core, n1).concat(buildSession(extra, o.count - n1)));
        }
      } else session = buildSession(keys, o.count);
      startQuiz(session, u.title, () => unitSheet(k));
    });
  }
  const chip = (name, v, label, on) => '<label class="chip"><input type="checkbox" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>';
  const radio = (name, v, label, on) => '<label class="chip"><input type="radio" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>';

  function mixSheet() {
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>混合复习</h1></header><form id="mix" class="card">';
    html += '<div class="field"><div class="label">选择单元</div><div class="chips">' + UNITS.slice(0, 24).map((u) => chip('unit', u.k, '第' + u.k + '次', false)).join('') + '</div></div>';
    html += '<div class="field"><div class="label">题型</div><div class="chips">' + Object.keys(TYPES).map((t) => chip('type', t, TYPES[t].label, t !== 's_c2e')).join('') + '</div></div>';
    html += '<div class="field"><div class="label">题数</div><div class="chips">' + [20, 50, 100].map((n) => radio('count', n, n + ' 题', n === 50)).join('') + '</div></div>';
    html += '<p class="count" id="cnt"></p><button class="btn primary">开始</button></form>';
    render(html);
    const form = document.getElementById('mix');
    const keysNow = () => {
      const fd = new FormData(form); const types = fd.getAll('type'); const set = new Set();
      fd.getAll('unit').forEach((k) => { const u = UNITS[k - 1]; keysFor(unitContent(u, { books: u.books }), types.filter((t) => t !== 's_c2e' || u.zh2enSent)).forEach((x) => set.add(x)); });
      return { keys: [...set], count: +fd.get('count') };
    };
    form.addEventListener('change', () => { document.getElementById('cnt').textContent = '共 ' + keysNow().keys.length + ' 道题可选'; });
    form.addEventListener('submit', (e) => { e.preventDefault(); const r = keysNow(); if (!r.keys.length) { document.getElementById('cnt').innerHTML = '<span class="warn">请先选择单元和题型</span>'; return; } startQuiz(buildSession(r.keys, r.count), '混合复习', mixSheet); });
  }

  function wrongBook() {
    const keys = Object.keys(store.stats).filter(isWrong).filter((k) => items[k.slice(6)]);
    if (!keys.length) return home();
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>错题本</h1></header>';
    html += '<p class="sub pad">共 ' + keys.length + ' 题。连续答对 2 次自动移出。</p><button class="btn primary wide" id="go">练习全部错题</button><div class="list">';
    keys.sort((a, b) => stat(b).wrong - stat(a).wrong).forEach((k) => {
      const it = items[k.slice(6)];
      html += '<div class="row"><div class="row-en">' + esc(it.en) + '</div><div class="row-zh">' + esc(it.zh) + '</div><div class="row-meta">' + TYPES[k.slice(0, 5)].label + ' · 错 ' + stat(k).wrong + ' 次 · ' + it.src + '</div></div>';
    });
    render(html + '</div>');
    document.getElementById('go').onclick = () => startQuiz(buildSession(keys, 0), '错题本', wrongBook);
  }

  function browse(k) {
    const u = UNITS[k - 1]; const c = unitContent(u, { books: u.books, mixVocab: false });
    let html = '<header class="bar-top"><button class="back" data-unit="' + k + '">‹ 返回</button><h1>' + u.title + ' 内容</h1></header><div class="list">';
    const sec = (title, ids) => { if (!ids.length) return; html += '<h2 class="phase">' + title + '（' + ids.length + '）</h2>'; ids.forEach((id) => { const it = items[id]; html += '<div class="row"><div class="row-en">' + (canSpeak ? '<button class="say" data-say="' + esc(it.en) + '">🔊</button>' : '') + esc(it.en) + '</div><div class="row-zh">' + esc(it.zh) + '</div><div class="row-meta">' + it.src + '</div></div>'; }); };
    sec('单词', c.words); sec('句子', c.sents);
    if (!c.words.length && !c.sents.length) html += '<p class="note pad">这个单元的资料还没录入。</p>';
    render(html + '</div>');
  }

  // ---------- 答题 ----------
  let Q = null;
  function startQuiz(keys, title, back) {
    Q = { queue: keys.slice(), i: 0, total: keys.length, right: 0, wrongs: [], retried: new Set(), title, back };
    nextQ();
  }
  function nextQ() {
    if (Q.i >= Q.queue.length) return result();
    const q = makeQuestion(Q.queue[Q.i]); if (!q) { Q.i++; return nextQ(); }
    Q.cur = q;
    const done = Math.min(Q.i, Q.total);
    let html = '<header class="bar-top"><button class="back" id="quit">‹ 结束</button><h1>' + esc(Q.title) + '</h1><span class="prog">' + (Q.i + 1) + '/' + Q.queue.length + '</span></header>';
    html += '<div class="bar thin"><i style="width:' + (done / Q.queue.length) * 100 + '%"></i></div>';
    html += '<div class="q card"><div class="q-type">' + TYPES[q.type].label + '</div><div class="q-prompt ' + (q.it.kind === 'sent' ? 'long' : '') + '">' + esc(q.prompt) +
      (q.promptEn && canSpeak ? ' <button class="say" data-say="' + esc(q.it.en) + '">🔊</button>' : '') + '</div></div><div class="opts">';
    q.options.forEach((o, i) => { html += '<button class="opt ' + (q.it.kind === 'sent' ? 'long' : '') + '" data-opt="' + i + '"><span class="k">' + 'ABCD'[i] + '</span><span>' + esc(o) + '</span></button>'; });
    html += '</div><div id="fb"></div>';
    render(html);
    document.getElementById('quit').onclick = () => (Q.i > 0 ? result() : Q.back());
  }
  function answer(i) {
    const q = Q.cur; if (q.answered) return; q.answered = true;
    const ok = q.options[i] === q.answer;
    const s = Object.assign({ right: 0, wrong: 0, streak: 0 }, store.stats[q.key]);
    if (ok) { s.right++; s.streak++; Q.right++; } else { s.wrong++; s.streak = 0; Q.wrongs.push(q.key); if (!Q.retried.has(q.key)) { Q.retried.add(q.key); const pos = Math.min(Q.queue.length, Q.i + 4 + Math.floor(Math.random() * 3)); Q.queue.splice(pos, 0, q.key); } }
    s.t = Date.now(); store.stats[q.key] = s; save();
    document.querySelectorAll('.opt').forEach((b, j) => {
      b.disabled = true;
      if (q.options[j] === q.answer) b.classList.add('right'); else if (j === i) b.classList.add('wrong');
    });
    const fb = document.getElementById('fb');
    fb.innerHTML = '<div class="fb ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 答对了' : '✗ 答错了，这题稍后会再出一次') + '</div>' +
      '<div class="card ans"><div class="row-en">' + (canSpeak ? '<button class="say" data-say="' + esc(q.it.en) + '">🔊</button>' : '') + esc(q.it.en) + '</div><div class="row-zh">' + esc(q.it.zh) + '</div><div class="row-meta">' + q.it.src + '</div></div>' +
      '<button class="btn primary wide" id="next">下一题</button>';
    document.getElementById('next').onclick = () => { Q.i++; nextQ(); };
    document.getElementById('next').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function result() {
    const answered = Q.right + Q.wrongs.length;
    const uniq = [...new Set(Q.wrongs)];
    let html = '<header class="bar-top"><button class="back" id="bk">‹ 返回</button><h1>本轮结果</h1></header>';
    html += '<div class="card score"><div class="big">' + (answered ? Math.round((Q.right / answered) * 100) : 0) + '<small>%</small></div><div class="sub">答对 ' + Q.right + ' / ' + answered + ' 次</div></div>';
    if (uniq.length) {
      html += '<button class="btn primary wide" id="redo">再练这 ' + uniq.length + ' 道错题</button><div class="list">';
      uniq.forEach((k) => { const it = items[k.slice(6)]; html += '<div class="row"><div class="row-en">' + esc(it.en) + '</div><div class="row-zh">' + esc(it.zh) + '</div><div class="row-meta">' + TYPES[k.slice(0, 5)].label + '</div></div>'; });
      html += '</div>';
    }
    html += '<button class="btn ghost wide" data-go="home">回到首页</button>';
    render(html);
    const back = Q.back;
    document.getElementById('bk').onclick = back;
    const r = document.getElementById('redo'); if (r) r.onclick = () => startQuiz(shuffle(uniq), '错题重练', back);
  }

  // ---------- 事件 ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.say) { e.stopPropagation(); return speak(t.dataset.say); }
    if (t.dataset.opt) return answer(+t.dataset.opt);
    if (t.dataset.unit) return unitSheet(+t.dataset.unit);
    if (t.dataset.browse) return browse(+t.dataset.browse);
    const go = t.dataset.go;
    if (go === 'home') home();
    else if (go === 'wrong') wrongBook();
    else if (go === 'mix') mixSheet();
    else if (go === 'reset') {
      if (t.dataset.armed) { store.stats = {}; save(); home(); }
      else { t.dataset.armed = '1'; t.textContent = '再点一次，清空全部记录和错题（不能撤销）'; t.classList.add('danger'); }
    }
  });

  home();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
