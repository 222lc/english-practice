/* BL 考试练习 —— 纯前端，进度存在本机 localStorage */
(function () {
  'use strict';
  const D = window.DATA;
  const $app = document.getElementById('app');

  // ---------- 存储 ----------
  const KEY = 'aviEn.v1';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  const store = Object.assign({ stats: {}, prefs: {}, exams: [], fav: {} }, load());
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  // ---------- 题库条目 ----------
  const items = {};           // id -> {id, kind:'word'|'sent', en, zh, src}
  const add = (it) => (items[it.id] = it);
  // 同一个词在不同页重复出现（如 lower 在第9页和第18页），后出现的加页码区分，各算各的
  D.vocab.forEach((w) => {
    let id = 'w:' + w.en;
    if (items[id]) id += '@' + w.page;
    add({ id, kind: 'word', en: w.en, zh: w.zh, page: w.page, src: '词汇表 第' + w.page + '页' });
  });
  D.sentences.shared.forEach((s) => add({ id: 'S:' + s.n, kind: 'sent', en: s.en, zh: s.zh, page: s.page, src: '通用句 ' + s.n }));
  ['AE', 'AV', 'AI'].forEach((b) => (D.sentences[b] || []).forEach((s) => {
    if (s.dupOf) return; // 重复句合并
    add({ id: b + ':' + s.n, kind: 'sent', en: s.en, zh: s.zh, page: s.page, book: b, src: b + ' 第' + s.n + '句' });
  }));
  Object.keys(D.beisong).forEach((k) => D.beisong[k].forEach((s) => add({ id: 'B' + k + ':' + s.n, kind: 'sent', en: s.en, zh: s.para ? s.en2 : s.zh, zhFirst: !!s.zhFirst, para: !!s.para, src: '背诵' + k + ' 第' + s.n + '句' })));

  // 周考：每次周考 5 张卷子。items 是单词/句子（自动出题），questions 是卷子上的原题
  const WEEKS = (D.weekly || []).map((w) => {
    const k = 'w' + w.id;
    const papers = w.papers.map((p) => {
      const pre = 'W' + w.id + '.' + p.n + ':';
      const src = w.title + ' ' + (p.title || '第' + p.n + '天');
      const words = [], sents = [], mcqs = [];
      (p.items || []).forEach((s, i) => {
        const n = s.n || i + 1;
        const kind = s.kind || (s.en.trim().split(/\s+/).length >= 4 ? 'sent' : 'word');
        add({ id: pre + n, kind, en: s.en, zh: s.zh, wk: w.id, src: src + ' 第' + n + '条' });
        (kind === 'word' ? words : sents).push(pre + n);
      });
      (p.questions || []).forEach((q, i) => {
        const n = q.n || i + 1, ans = q.options[q.answer];
        add({ id: pre + 'q' + n, kind: 'mcq', en: q.q, zh: '答案：' + ans + (q.explain ? '（' + q.explain + '）' : ''), options: q.options, answer: ans, wk: w.id, src: src + ' 第' + n + '题' });
        mcqs.push(pre + 'q' + n);
      });
      return { n: p.n, title: p.title || '第' + p.n + '天', words, sents, mcqs };
    });
    return { k, weekly: true, id: w.id, title: w.title, papers };
  });

  const vocabPages = new Set(D.vocab.map((w) => w.page));
  const allWords = Object.values(items).filter((i) => i.kind === 'word' && !i.wk);
  const unitOf = (k) => (typeof k === 'number' ? UNITS[k - 1] : WEEKS.find((w) => w.k === k));

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

  // 单元内容；opts: {mixVocab, books}；周考 opts.papers 是选中的卷子（不传就是全部）
  function unitContent(u, opts) {
    opts = opts || {};
    if (u.weekly) {
      const ps = u.papers.filter((p) => !opts.papers || opts.papers.includes(p.n));
      return { words: ps.flatMap((p) => p.words), sents: ps.flatMap((p) => p.sents), mcqs: ps.flatMap((p) => p.mcqs) };
    }
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
  const paperEmpty = (p) => !p.words.length && !p.sents.length && !p.mcqs.length;
  function unitMissing(u) {
    const m = [];
    if (u.weekly) { u.papers.forEach((p) => paperEmpty(p) && m.push(p.title + '的卷子')); return m; }
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
    s_par: { label: '句子 同义改写', kind: 'sent' },
    q_mcq: { label: '卷子原题', kind: 'mcq' },
  };
  function unitTypes(u) {
    if (u.weekly) {
      const c = unitContent(u), t = [];
      if (c.words.length) t.push('w_e2c', 'w_c2e');
      if (c.sents.length) t.push('s_e2c', 's_c2e');
      if (c.mcqs.length) t.push('q_mcq');
      return t;
    }
    return u.zh2enSent ? ['w_e2c', 'w_c2e', 's_e2c', 's_c2e'] : ['w_e2c', 'w_c2e', 's_e2c'];
  }
  // 原表中文在左、英文在右的背诵句（zhFirst）考试时给中文选英文，所以只出“句子 中→英”
  function keysFor(content, types) {
    const keys = [];
    // 背诵20 起每份第1–2句两栏都是英文（原句 + 同义改写，para），只出“同义改写”题
    const special = (id) => items[id] && (items[id].zhFirst || items[id].para);
    types.forEach((t) => {
      if (t === 's_par') return;
      if (t === 'q_mcq') return (content.mcqs || []).forEach((id) => keys.push(t + '|' + id));
      if (TYPES[t].kind === 'word') content.words.forEach((id) => keys.push(t + '|' + id));
      else content.sents.forEach((id) => { if (!special(id)) keys.push(t + '|' + id); });
    });
    if (types.some((t) => TYPES[t].kind === 'sent')) content.sents.forEach((id) => { const it = items[id]; if (it && it.para) keys.push('s_par|' + id); else if (it && it.zhFirst) keys.push('s_c2e|' + id); });
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
    // 中文相同的词（如 clear / clearance）不当干扰项，免得一题两个对的
    const other = field === 'zh' ? 'en' : 'zh';
    const cands = pool.filter((o) => o.id !== it.id && o[field] !== ans && o[other] !== it[other]);
    const sim = it.kind === 'word' ? (o) => wordSim(it.en, o.en) : (o) => sentSim(it.en, o.en);
    const ranked = cands.map((o) => [sim(o), o]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const picked = []; const seen = new Set([ans]);
    const take = (o) => { if (o && !seen.has(o[field])) { seen.add(o[field]); picked.push(o); } };
    shuffle(ranked.slice(0, 6)).forEach((o) => picked.length < 2 && take(o));
    shuffle(cands).forEach((o) => picked.length < 3 && take(o));
    return picked;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function makeQuestion(key) {
    const [t, id] = [key.slice(0, 5), key.slice(6)];
    const it = items[id]; if (!it) return null;
    // 卷子原题：选项照卷子，只打乱顺序
    if (t === 'q_mcq') { const o = shuffle(it.options); return { key, type: t, it, prompt: it.en, promptEn: false, options: o, gloss: null, answer: it.answer }; }
    // 句子干扰项来自同一组：背诵N 用同一份背诵，AE/AV/AI 用这三本里的句子，周考用同一次周考
    const grp = (x) => (x.wk ? 'W' + x.wk : x.id[0] === 'B' ? x.id.split(':')[0] : 'book');
    // 同义改写题：给原句，从所有改写句里选意思相同的那句
    const para = t === 's_par';
    let pool = it.kind === 'word' ? (it.wk ? Object.values(items).filter((i) => i.kind === 'word' && i.wk === it.wk) : allWords)
      : para ? Object.values(items).filter((i) => i.para) : Object.values(items).filter((i) => i.kind === 'sent' && !i.para && grp(i) === grp(it));
    // 周考内容少的时候，干扰项从月考题库里补
    if (it.wk && pool.length < 8) pool = pool.concat(it.kind === 'word' ? allWords : Object.values(items).filter((i) => i.kind === 'sent' && !i.para && !i.wk));
    const e2c = para || t.endsWith('e2c');
    const field = e2c ? 'zh' : 'en';
    const all = shuffle([it, ...distractors(it, field, pool)]);
    // gloss：每个选项对应的另一种语言（选项是中文就是英文，反之亦然），答题后显示
    return { key, type: t, it, prompt: e2c ? it.en : it.zh, promptEn: e2c, options: all.map((o) => o[field]), gloss: all.map((o) => o[e2c ? 'en' : 'zh']), answer: it[field] };
  }

  // ---------- 出题 ----------
  // 薄弱程度：错误率高、错得多、最近没连对的排前面；没练过的居中，已掌握的最后
  function weakness(k) { const s = stat(k), n = s.right + s.wrong; return n ? (s.wrong / n) * 4 + Math.min(s.wrong, 5) - s.streak * 1.5 : 0.5; }
  const byWeak = (keys) => keys.map((k) => [weakness(k) + Math.random() * 0.1, k]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  function buildSession(keys, count, weakFirst) {
    if (weakFirst) { const r = byWeak(keys); return count ? r.slice(0, count) : r; }
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
  const star = (id) => '<button class="star" data-fav="' + esc(id) + '" aria-label="收藏">' + (store.fav[id] ? '★' : '☆') + '</button>';
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const day = (t) => { const d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  const PHASES = { 1: '第一阶段 · 词汇表', 2: '第二阶段 · AE/AV 句子 + 整本词汇', 3: '第三阶段 · AI 句子 + 整本词汇（加考句子中译英）', 4: '总决赛' };

  function home() {
    const wrongN = Object.keys(store.stats).filter(isWrong).length;
    const favN = Object.keys(store.fav).filter((id) => items[id]).length;
    let html = '<header class="top"><h1>BL</h1><p class="sub">按考试场次练习 · 进度保存在本机</p></header>';
    html += '<div class="actions"><button class="btn ghost" data-go="wrong"' + (wrongN ? '' : ' disabled') + '>错题本 <b>' + wrongN + '</b></button><button class="btn ghost" data-go="mix">多单元混合复习</button>' +
      '<button class="btn ghost" data-go="fav"' + (favN ? '' : ' disabled') + '>收藏 <b>' + favN + '</b></button><button class="btn ghost" data-go="exams"' + (store.exams.length ? '' : ' disabled') + '>考试记录 <b>' + store.exams.length + '</b></button></div>';
    const tab = store.prefs.tab === 'week' ? 'week' : 'month';
    html += '<div class="tabs" role="tablist">' + [['month', '月考'], ['week', '周考']].map(([v, l]) => '<button role="tab" aria-selected="' + (tab === v) + '" class="tab' + (tab === v ? ' on' : '') + '" data-tab="' + v + '">' + l + '</button>').join('') + '</div>';
    const card = (u, desc) => {
      const pr = unitProgress(u); const miss = unitMissing(u); const ex = examStats(u.k);
      const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
      return '<button class="unit" data-unit="' + u.k + '"><div class="u-head"><span class="u-title">' + esc(u.title) + '</span><span class="u-pct">' + (pr.total ? pct + '%' : '') + '</span></div>' +
        '<div class="u-desc">' + desc + '</div>' +
        (ex.n ? '<div class="u-exam">模拟考 最高 ' + ex.best + ' 分 · 共 ' + ex.n + ' 次</div>' : '') +
        (pr.total ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
        (miss.length ? '<div class="u-miss">尚未录入：' + miss.join('、') + '</div>' : '') + '</button>';
    };
    if (tab === 'week') {
      html += '<p class="sub pad tab-sub">每天一张卷子，考试从本周卷子里出 ' + WEEK_EXAM_N + ' 题</p>';
      WEEKS.slice().reverse().forEach((w) => {
        const have = w.papers.filter((p) => !paperEmpty(p)).length;
        html += card(w, w.papers.length + ' 张卷子 · 已录入 ' + have + ' 张');
      });
      if (!WEEKS.length) html += '<p class="note">还没有周考题库。</p>';
    } else {
      let phase = 0;
      UNITS.forEach((u) => {
        if (u.phase !== phase) { phase = u.phase; html += '<h2 class="phase">' + PHASES[phase] + '</h2>'; }
        html += card(u, u.desc);
      });
    }
    html += '<footer class="foot">题库版本 ' + D.version + ' · <button class="link" data-go="reset">清空练习记录</button></footer>';
    render(html);
  }

  function unitSheet(k) {
    const u = UNITS[k - 1];
    const pref = Object.assign({ types: unitTypes(u), mixVocab: u.phase >= 2 && u.phase < 4, books: u.books || [], count: 20, weak: false }, store.prefs['u' + k] || {});
    const miss = unitMissing(u);
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>' + u.title + '</h1></header>';
    html += '<p class="sub pad">' + u.desc + '</p>';
    if (miss.length) html += '<p class="note pad">尚未录入：' + miss.join('、') + '。录入后会自动出现在练习里。</p>';
    html += '<form id="opt" class="card">';
    html += '<div class="field"><div class="label">题型</div><div class="chips">' + unitTypes(u).map((t) => chip('type', t, TYPES[t].label, pref.types.includes(t))).join('') + '</div></div>';
    if (u.phase === 2) html += '<div class="field"><div class="label">句子范围</div><div class="chips">' + ['AE', 'AV'].map((b) => chip('book', b, b, pref.books.includes(b))).join('') + '</div></div>';
    if (u.phase === 2 || u.phase === 3) html += '<label class="switch"><input type="checkbox" name="mix"' + (pref.mixVocab ? ' checked' : '') + '><span>混入整本词汇（优先出常错的词）</span></label>';
    html += '<div class="field"><div class="label">题数</div><div class="chips">' + [10, 20, 50, 0].map((n) => radio('count', n, n ? n + ' 题' : '全部', pref.count === n)).join('') + '</div></div>';
    html += '<label class="switch"><input type="checkbox" name="weak"' + (pref.weak ? ' checked' : '') + '><span>薄弱词优先（错得最多的先出）</span></label>';
    html += '<p class="count" id="cnt"></p>';
    html += '<button type="submit" class="btn primary">开始练习</button></form>';
    html += '<button class="btn ghost wide" data-browse="' + k + '">浏览本单元全部内容</button>';
    const ex = examStats(k);
    html += '<div class="card"><div class="label">模拟考试</div><p class="sub">限时（每题 ' + SEC_PER_Q + ' 秒），中途不显示对错，交卷后出分数。' + (ex.n ? '已考 ' + ex.n + ' 次，最高 ' + ex.best + ' 分。' : '') + '</p>' +
      '<div class="field"><div class="chips">' + [20, 50, 100].map((n) => radio('exn', n, n + ' 题', n === 50)).join('') + '</div></div>' +
      '<label class="switch"><input type="checkbox" id="exweak"><span>薄弱词优先（多抽常错的题）</span></label>' +
      '<button class="btn primary" id="exam">开始模拟考试</button></div>';
    render(html);
    document.getElementById('exam').onclick = (e) => {
      if (startExam(k, +document.querySelector('input[name="exn"]:checked').value, document.getElementById('exweak').checked) === false) e.currentTarget.textContent = '这个单元还没有录入题目';
    };
    const form = document.getElementById('opt');
    const read = () => {
      const fd = new FormData(form);
      return { types: fd.getAll('type'), books: u.phase === 2 ? fd.getAll('book') : u.books, mixVocab: !!fd.get('mix'), count: +fd.get('count'), weak: !!fd.get('weak') };
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
        const n1 = o.count ? Math.min(core.length, Math.ceil(o.count * 0.6)) : 0;
        session = buildSession(core, n1, o.weak).concat(buildSession(extra, o.count ? o.count - n1 : 0, o.weak));
        session = o.weak ? byWeak(session) : shuffle(session);
      } else session = buildSession(keys, o.count, o.weak);
      startQuiz(session, u.title, () => unitSheet(k));
    });
  }
  const openUnit = (k) => (typeof k === 'number' ? unitSheet(k) : weekSheet(k));

  function weekSheet(k) {
    const u = unitOf(k); if (!u) return home();
    const types = unitTypes(u);
    const ready = u.papers.filter((p) => !paperEmpty(p));
    const pref = Object.assign({ types, papers: ready.map((p) => p.n), count: 20, weak: false }, store.prefs[k] || {});
    pref.types = pref.types.filter((t) => types.includes(t)); if (!pref.types.length) pref.types = types;
    const miss = unitMissing(u);
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>' + esc(u.title) + '</h1></header>';
    html += '<p class="sub pad">' + u.papers.length + ' 张卷子，考试从里面出 ' + WEEK_EXAM_N + ' 题</p>';
    if (miss.length) html += '<p class="note pad">尚未录入：' + miss.join('、') + '。录入后会自动出现在练习里。</p>';
    if (!ready.length) { render(html); return; }
    html += '<form id="opt" class="card">';
    html += '<div class="field"><div class="label">卷子</div><div class="chips">' + ready.map((p) => {
      const pr = keysFor(unitContent(u, { papers: [p.n] }), types), done = pr.filter(mastered).length;
      return chip('paper', p.n, esc(p.title) + (pr.length ? ' · ' + Math.round((done / pr.length) * 100) + '%' : ''), pref.papers.includes(p.n));
    }).join('') + '</div></div>';
    html += '<div class="field"><div class="label">题型</div><div class="chips">' + types.map((t) => chip('type', t, TYPES[t].label, pref.types.includes(t))).join('') + '</div></div>';
    html += '<div class="field"><div class="label">题数</div><div class="chips">' + [10, 20, 50, 0].map((n) => radio('count', n, n ? n + ' 题' : '全部', pref.count === n)).join('') + '</div></div>';
    html += '<label class="switch"><input type="checkbox" name="weak"' + (pref.weak ? ' checked' : '') + '><span>薄弱词优先（错得最多的先出）</span></label>';
    html += '<p class="count" id="cnt"></p><button type="submit" class="btn primary">开始练习</button></form>';
    html += '<button class="btn ghost wide" data-browse="' + k + '">浏览全部卷子内容</button>';
    const ex = examStats(k);
    html += '<div class="card"><div class="label">模拟考试</div><p class="sub">从' + (ready.length < u.papers.length ? '已录入的 ' + ready.length + ' 张' : '全部 ' + u.papers.length + ' 张') + '卷子里抽题，限时（每题 ' + SEC_PER_Q + ' 秒），中途不显示对错，交卷后出分数。' + (ex.n ? '已考 ' + ex.n + ' 次，最高 ' + ex.best + ' 分。' : '') + '</p>' +
      '<div class="field"><div class="chips">' + [20, WEEK_EXAM_N, 50].map((n) => radio('exn', n, n + ' 题', n === WEEK_EXAM_N)).join('') + '</div></div>' +
      '<label class="switch"><input type="checkbox" id="exweak"><span>薄弱词优先（多抽常错的题）</span></label>' +
      '<button class="btn primary" id="exam">开始模拟考试</button></div>';
    render(html);
    document.getElementById('exam').onclick = () => startExam(k, +document.querySelector('input[name="exn"]:checked').value, document.getElementById('exweak').checked);
    const form = document.getElementById('opt');
    const read = () => { const fd = new FormData(form); return { papers: fd.getAll('paper').map(Number), types: fd.getAll('type'), count: +fd.get('count'), weak: !!fd.get('weak') }; };
    const upd = () => { const o = read(); document.getElementById('cnt').textContent = '本次可练 ' + keysFor(unitContent(u, o), o.types).length + ' 道题'; };
    form.addEventListener('change', upd); upd();
    form.addEventListener('submit', (e) => {
      e.preventDefault(); const o = read();
      store.prefs[k] = o; save();
      const keys = keysFor(unitContent(u, o), o.types);
      if (!keys.length) { document.getElementById('cnt').innerHTML = '<span class="warn">没有可练的题，请至少选一张卷子和一种题型</span>'; return; }
      startQuiz(buildSession(keys, o.count, o.weak), u.title, () => weekSheet(k));
    });
  }

  const chip = (name, v, label, on) => '<label class="chip"><input type="checkbox" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>';
  const radio = (name, v, label, on) => '<label class="chip"><input type="radio" name="' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '><span>' + label + '</span></label>';

  function mixSheet() {
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>混合复习</h1></header><form id="mix" class="card">';
    html += '<div class="field"><div class="label">选择单元</div><div class="chips">' + UNITS.slice(0, 24).map((u) => chip('unit', u.k, '第' + u.k + '次', false)).join('') + '</div></div>';
    html += '<div class="field"><div class="label">题型</div><div class="chips">' + Object.keys(TYPES).filter((t) => t !== 's_par').map((t) => chip('type', t, TYPES[t].label, t !== 's_c2e')).join('') + '</div></div>';
    html += '<div class="field"><div class="label">题数</div><div class="chips">' + [20, 50, 100].map((n) => radio('count', n, n + ' 题', n === 50)).join('') + '</div></div>';
    html += '<label class="switch"><input type="checkbox" name="weak"><span>薄弱词优先（错得最多的先出）</span></label>';
    html += '<p class="count" id="cnt"></p><button class="btn primary">开始</button></form>';
    render(html);
    const form = document.getElementById('mix');
    const keysNow = () => {
      const fd = new FormData(form); const types = fd.getAll('type'); const set = new Set();
      fd.getAll('unit').forEach((k) => { const u = UNITS[k - 1]; keysFor(unitContent(u, { books: u.books }), types.filter((t) => t !== 's_c2e' || u.zh2enSent)).forEach((x) => set.add(x)); });
      return { keys: [...set], count: +fd.get('count'), weak: !!fd.get('weak') };
    };
    form.addEventListener('change', () => { document.getElementById('cnt').textContent = '共 ' + keysNow().keys.length + ' 道题可选'; });
    form.addEventListener('submit', (e) => { e.preventDefault(); const r = keysNow(); if (!r.keys.length) { document.getElementById('cnt').innerHTML = '<span class="warn">请先选择单元和题型</span>'; return; } startQuiz(buildSession(r.keys, r.count, r.weak), '混合复习', mixSheet); });
  }

  function wrongBook() {
    const keys = Object.keys(store.stats).filter(isWrong).filter((k) => items[k.slice(6)]);
    if (!keys.length) return home();
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>错题本</h1></header>';
    html += '<p class="sub pad">共 ' + keys.length + ' 题。连续答对 2 次自动移出。</p><button class="btn primary wide" id="go">练习全部错题</button><div class="list">';
    keys.sort((a, b) => stat(b).wrong - stat(a).wrong).forEach((k) => {
      const it = items[k.slice(6)];
      html += '<div class="row"><div class="row-head"><div class="row-en">' + esc(it.en) + '</div>' + star(it.id) + '</div><div class="row-zh">' + esc(it.zh) + '</div><div class="row-meta">' + TYPES[k.slice(0, 5)].label + ' · 错 ' + stat(k).wrong + ' 次 · ' + it.src + '</div></div>';
    });
    render(html + '</div>');
    document.getElementById('go').onclick = () => startQuiz(buildSession(keys, 0), '错题本', wrongBook);
  }

  function browse(k) {
    const u = unitOf(k); if (!u) return home();
    const c = unitContent(u, { books: u.books, mixVocab: false });
    let html = '<header class="bar-top"><button class="back" data-unit="' + k + '">‹ 返回</button><h1>' + esc(u.title) + ' 内容</h1></header><div class="list">';
    const sec = (title, ids) => { if (!ids.length) return; html += '<h2 class="phase">' + title + '（' + ids.length + '）</h2>'; ids.forEach((id) => { const it = items[id]; const sp = canSpeak && it.kind !== 'mcq'; html += '<div class="row"><div class="row-head"><div class="row-en">' + (sp ? '<button class="say" data-say="' + esc(it.en) + '">🔊</button>' : '') + esc(it.en) + '</div>' + star(id) + '</div>' + (it.kind === 'mcq' ? '<div class="row-meta">' + it.options.map((o, j) => 'ABCD'[j] + '. ' + esc(o)).join('　') + '</div>' : '') + '<div class="row-zh">' + esc(it.zh) + '</div><div class="row-meta">' + it.src + '</div></div>'; }); };
    if (u.weekly) u.papers.forEach((p) => { sec(esc(p.title) + ' · 单词', p.words); sec(esc(p.title) + ' · 句子', p.sents); sec(esc(p.title) + ' · 原题', p.mcqs); });
    else { sec('单词', c.words); sec('句子', c.sents); }
    if (!c.words.length && !c.sents.length && !(c.mcqs || []).length) html += '<p class="note pad">这个单元的资料还没录入。</p>';
    render(html + '</div>');
  }

  function favBook() {
    const ids = Object.keys(store.fav).filter((id) => items[id]).sort((a, b) => store.fav[b] - store.fav[a]);
    if (!ids.length) return home();
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>收藏</h1></header>';
    html += '<p class="sub pad">共 ' + ids.length + ' 条。点 ★ 取消收藏。</p><button class="btn primary wide" id="go">练习全部收藏</button><div class="list">';
    ids.forEach((id) => {
      const it = items[id];
      html += '<div class="row"><div class="row-head"><div class="row-en">' + esc(it.en) + '</div>' + star(id) + '</div><div class="row-zh">' + esc(it.zh) + '</div><div class="row-meta">' + it.src + '</div></div>';
    });
    render(html + '</div>');
    document.getElementById('go').onclick = () => {
      const keys = ids.filter((id) => store.fav[id]).flatMap((id) => (items[id].kind === 'word' ? ['w_e2c|' + id, 'w_c2e|' + id] : items[id].kind === 'mcq' ? ['q_mcq|' + id] : ['s_e2c|' + id]));
      if (keys.length) startQuiz(buildSession(keys, 0), '收藏', favBook);
    };
  }

  // ---------- 模拟考试 ----------
  const SEC_PER_Q = 30;
  const WEEK_EXAM_N = 30; // 周考：从本周卷子里出 30 题
  function examStats(k) {
    const r = store.exams.filter((e) => e.k === k);
    return { n: r.length, best: r.length ? Math.max(...r.map((e) => e.score)) : 0 };
  }
  // 随机抽题（勾了薄弱词优先就先抽常错的），同一个词/句尽量只出一次
  function pick(keys, m, weak) {
    const out = [], rest = [], seen = new Set();
    (weak ? byWeak(keys) : shuffle(keys)).forEach((key) => { const id = key.slice(6); if (seen.has(id)) rest.push(key); else { seen.add(id); out.push(key); } });
    return out.concat(rest).slice(0, m);
  }
  function examKeys(u, n, weak) {
    const c = unitContent(u, { books: u.books, mixVocab: u.phase >= 2 && u.phase < 4 });
    const types = unitTypes(u);
    if (u.phase >= 2 && u.phase < 4 && c.words.length && c.sents.length) {
      // 和练习一样：本次新句子至少占六成，其余是整本词汇
      const core = keysFor({ words: [], sents: c.sents }, types), extra = keysFor({ words: c.words, sents: [] }, types);
      const n1 = Math.min(core.length, Math.ceil(n * 0.6));
      return shuffle(pick(core, n1, weak).concat(pick(extra, n - n1, weak)));
    }
    return shuffle(pick(keysFor(c, types), n, weak));
  }

  let X = null;
  function startExam(k, n, weak) {
    const u = unitOf(k); if (!u) return false;
    const qs = examKeys(u, n, weak).map(makeQuestion).filter(Boolean);
    if (!qs.length) return false;
    const now = Date.now();
    X = { k, weak, title: u.title + ' 模拟考' + (weak ? '（薄弱词）' : ''), qs, picks: qs.map(() => null), i: 0, start: now, end: now + qs.length * SEC_PER_Q * 1000 };
    X.timer = setInterval(tick, 1000);
    examQ();
  }
  function tick() {
    if (!X) return;
    const left = X.end - Date.now();
    const el = document.getElementById('timer');
    if (el) { el.textContent = fmt(left); el.classList.toggle('warn', left < 60000); }
    if (left <= 0) submitExam();
  }
  function examQ() {
    const q = X.qs[X.i], n = X.qs.length, done = X.picks.filter((p) => p !== null).length, left = X.end - Date.now();
    let html = '<header class="bar-top"><button class="back" id="xquit">‹ 退出</button><h1>' + esc(X.title) + '</h1><span class="prog timer' + (left < 60000 ? ' warn' : '') + '" id="timer">' + fmt(left) + '</span></header>';
    html += '<div class="bar thin"><i style="width:' + (done / n) * 100 + '%"></i></div>';
    html += '<div class="q card"><div class="q-type">第 ' + (X.i + 1) + ' / ' + n + ' 题 · ' + TYPES[q.type].label + star(q.it.id) + '</div><div class="q-prompt ' + (q.it.kind !== 'word' ? 'long' : '') + '">' + esc(q.prompt) +
      (q.promptEn && canSpeak ? ' <button class="say" data-say="' + esc(q.it.en) + '">🔊</button>' : '') + '</div></div><div class="opts">';
    q.options.forEach((o, j) => { html += '<button class="opt ' + (q.it.kind !== 'word' ? 'long' : '') + (X.picks[X.i] === j ? ' sel' : '') + '" data-xopt="' + j + '"><span class="k">' + 'ABCD'[j] + '</span><span>' + esc(o) + '</span></button>'; });
    html += '</div><div class="xnav"><button class="btn" data-xgo="' + (X.i - 1) + '"' + (X.i ? '' : ' disabled') + '>上一题</button>' +
      (X.i < n - 1 ? '<button class="btn" data-xgo="' + (X.i + 1) + '">下一题</button>' : '<button class="btn primary xsubmit">交卷</button>') + '</div>';
    html += '<div class="label pad">答题卡（已答 ' + done + ' / ' + n + '）</div><div class="sheet">' +
      X.qs.map((_, j) => '<button class="cell' + (X.picks[j] !== null ? ' done' : '') + (j === X.i ? ' cur' : '') + '" data-xgo="' + j + '">' + (j + 1) + '</button>').join('') + '</div>';
    html += '<button class="btn ghost wide xsubmit">交卷</button>';
    render(html);
    document.getElementById('xquit').onclick = (e) => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '再点一次退出（不计分）'; b.classList.add('warn'); return; }
      clearInterval(X.timer); const k = X.k; X = null; openUnit(k);
    };
    document.querySelectorAll('.xsubmit').forEach((b) => (b.onclick = () => {
      const miss = X.picks.filter((p) => p === null).length;
      if (miss && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '还有 ' + miss + ' 题没答，再点一次交卷'; b.classList.add('danger'); return; }
      submitExam();
    }));
  }
  function examPick(j) {
    X.picks[X.i] = j;
    const x = X;
    if (X.i < X.qs.length - 1) { examQ(); setTimeout(() => { if (X === x && x.picks[x.i] === j) { x.i++; examQ(); } }, 250); }
    else examQ();
  }
  function submitExam() {
    if (!X) return;
    clearInterval(X.timer);
    const x = X; X = null;
    const prev = examStats(x.k);
    let right = 0; const wrong = [];
    x.qs.forEach((q, j) => {
      const p = x.picks[j]; const ok = p !== null && q.options[p] === q.answer;
      const s = Object.assign({ right: 0, wrong: 0, streak: 0 }, store.stats[q.key]);
      if (ok) { right++; s.right++; s.streak++; } else { s.wrong++; s.streak = 0; wrong.push({ q, pick: p }); }
      s.t = Date.now(); store.stats[q.key] = s;
    });
    const rec = { k: x.k, weak: !!x.weak, title: x.title, t: Date.now(), n: x.qs.length, right, score: Math.round((right / x.qs.length) * 100), secs: Math.round((Math.min(Date.now(), x.end) - x.start) / 1000) };
    store.exams.push(rec);
    if (store.exams.length > 200) store.exams.splice(0, store.exams.length - 200);
    save();
    examResult(rec, wrong, prev);
  }
  function examResult(rec, wrong, prev) {
    let html = '<header class="bar-top"><button class="back" data-unit="' + rec.k + '">‹ 返回</button><h1>考试成绩</h1></header>';
    html += '<div class="card score"><div class="big">' + rec.score + '<small>分</small></div><div class="sub">答对 ' + rec.right + ' / ' + rec.n + ' · 用时 ' + fmt(rec.secs * 1000) + '</div>' +
      (prev.n ? '<div class="sub">' + (rec.score > prev.best ? '新纪录！之前最高 ' + prev.best + ' 分' : '历史最高 ' + prev.best + ' 分') + '</div>' : '') + '</div>';
    if (wrong.length) {
      html += '<button class="btn primary wide" id="redo">练习这 ' + wrong.length + ' 道错题</button><h2 class="phase">错题（' + wrong.length + '）· 已加入错题本</h2><div class="list">';
      wrong.forEach(({ q, pick: p }) => {
        html += '<div class="row"><div class="row-head"><div class="row-en">' + esc(q.prompt) + '</div>' + star(q.it.id) + '</div>' +
          '<div class="row-pick no">你的答案：' + (p === null ? '未作答' : esc(q.options[p])) + '</div><div class="row-pick ok">正确答案：' + esc(q.answer) + '</div>' +
          '<div class="row-meta">' + TYPES[q.type].label + ' · ' + q.it.src + '</div></div>';
      });
      html += '</div>';
    }
    html += '<button class="btn ghost wide" id="again">再考一次</button><button class="btn ghost wide" data-go="home">回到首页</button>';
    render(html);
    const r = document.getElementById('redo');
    if (r) r.onclick = () => startQuiz(shuffle(wrong.map((w) => w.q.key)), '考试错题', () => openUnit(rec.k));
    document.getElementById('again').onclick = () => startExam(rec.k, rec.n, rec.weak);
  }
  function examLog() {
    if (!store.exams.length) return home();
    let html = '<header class="bar-top"><button class="back" data-go="home">‹ 返回</button><h1>考试记录</h1></header>';
    // 周考排前面（新的在上），再是月考按场次
    const ks = [...new Set(store.exams.map((e) => e.k))].filter(unitOf).sort((a, b) => (typeof a === typeof b ? (typeof a === 'number' ? a - b : unitOf(b).id - unitOf(a).id) : typeof a === 'number' ? 1 : -1));
    html += '<h2 class="phase">各次考试</h2><div class="list">';
    ks.forEach((k) => {
      const r = store.exams.filter((e) => e.k === k), last = r[r.length - 1];
      html += '<button class="unit" data-unit="' + k + '"><div class="u-head"><span class="u-title">' + esc(unitOf(k).title) + '</span><span class="rec-score">最高 ' + Math.max(...r.map((e) => e.score)) + ' 分</span></div>' +
        '<div class="u-desc">考了 ' + r.length + ' 次 · 最近一次 ' + last.score + ' 分（' + r.slice(-5).map((e) => e.score).join(' → ') + '）</div></button>';
    });
    html += '</div><h2 class="phase">全部记录</h2><div class="list">';
    store.exams.slice().reverse().forEach((e) => {
      html += '<div class="row"><div class="u-head"><span class="u-title">' + esc(e.title) + '</span><span class="rec-score">' + e.score + ' 分</span></div><div class="row-meta">' + day(e.t) + ' · 答对 ' + e.right + ' / ' + e.n + ' · 用时 ' + fmt(e.secs * 1000) + '</div></div>';
    });
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
    html += '<div class="q card"><div class="q-type">' + TYPES[q.type].label + star(q.it.id) + '</div><div class="q-prompt ' + (q.it.kind !== 'word' ? 'long' : '') + '">' + esc(q.prompt) +
      (q.promptEn && canSpeak ? ' <button class="say" data-say="' + esc(q.it.en) + '">🔊</button>' : '') + '</div></div><div class="opts">';
    q.options.forEach((o, i) => { html += '<button class="opt ' + (q.it.kind !== 'word' ? 'long' : '') + '" data-opt="' + i + '"><span class="k">' + 'ABCD'[i] + '</span><span class="opt-t"><span>' + esc(o) + '</span></span></button>'; });
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
      // 答完后每个选项下面都显示它对应的意思，错的选项也能顺便认识
      if (q.gloss && q.gloss[j]) b.querySelector('.opt-t').insertAdjacentHTML('beforeend', '<span class="gloss">' + esc(q.gloss[j]) + '</span>');
    });
    const fb = document.getElementById('fb');
    fb.innerHTML = '<div class="fb ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ 答对了' : '✗ 答错了，这题稍后会再出一次') + '</div>' +
      '<div class="card ans"><div class="row-en">' + (canSpeak && q.it.kind !== 'mcq' ?'<button class="say" data-say="' + esc(q.it.en) + '">🔊</button>' : '') + esc(q.it.en) + '</div><div class="row-zh">' + esc(q.it.zh) + '</div><div class="row-meta">' + q.it.src + '</div></div>' +
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
    if (t.dataset.fav) {
      const id = t.dataset.fav;
      if (store.fav[id]) delete store.fav[id]; else store.fav[id] = Date.now();
      save();
      document.querySelectorAll('.star').forEach((b) => { if (b.dataset.fav === id) b.textContent = store.fav[id] ? '★' : '☆'; });
      return;
    }
    if (t.dataset.say) { e.stopPropagation(); return speak(t.dataset.say); }
    if (t.dataset.opt) return answer(+t.dataset.opt);
    if (t.dataset.xopt) return examPick(+t.dataset.xopt);
    if (t.dataset.xgo) { X.i = +t.dataset.xgo; return examQ(); }
    // 月考单元的 key 是数字（1–25），周考是 'w1' 这样的字符串
    const keyOf = (v) => (/^\d+$/.test(v) ? +v : v);
    if (t.dataset.unit) return openUnit(keyOf(t.dataset.unit));
    if (t.dataset.browse) return browse(keyOf(t.dataset.browse));
    if (t.dataset.tab) { store.prefs.tab = t.dataset.tab; save(); return home(); }
    const go = t.dataset.go;
    if (go === 'home') home();
    else if (go === 'wrong') wrongBook();
    else if (go === 'mix') mixSheet();
    else if (go === 'fav') favBook();
    else if (go === 'exams') examLog();
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
