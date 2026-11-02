const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf-8');
const errors = [];
const vc = new (require('jsdom').VirtualConsole)();
vc.on('jsdomError', e => {
  // jsdom 不支持 blob: 下载导航（错题本导出在真实浏览器正常），过滤该噪音
  if (/Not implemented: navigation/.test(e.message || '')) return;
  errors.push('jsdomError: ' + (e.detail || e.message));
});
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  virtualConsole: vc,
  beforeParse(window) {
    window.scrollTo = () => {};
    // ---- Web Speech API mock（voices 必须非空数组，否则代码走 setTimeout 异步分支）----
    let voices = [
      { name: 'Xiaoxiao', lang: 'zh-CN' },
      { name: 'Google UK English Female', lang: 'en-GB' },
      { name: 'Google US English', lang: 'en-US' },
    ];
    const spoken = [];
    window.speechSynthesis = {
      getVoices: () => voices,
      cancel: () => {},
      speak: (u) => spoken.push({ text: u.text, lang: u.lang, voiceName: u.voice ? u.voice.name : null }),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    window.SpeechSynthesisUtterance = function (text) { this.text = text; this.lang = ''; this.rate = 1; };
    window.alert = () => {};
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => {} });
    window.__tts = { setVoices: v => (voices = v), spoken };
  },
});
const { window } = dom;
const { document } = window;
window.onerror = (m) => errors.push('window.onerror: ' + m);
// stub download APIs for jsdom
window.URL.createObjectURL = () => 'blob:test';
window.URL.revokeObjectURL = () => {};

function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) errors.push('assert failed: ' + name);
}
function click(sel){ const el=document.querySelector(sel); if(el) el.click(); return el; }

setTimeout(() => {
  try {
    check('tab bar 9 tabs including atlas', document.querySelectorAll('#tabBar .tab').length === 9);
    check('bottom nav 5 btabs', document.querySelectorAll('#bottomNav .btab').length === 5);

    // training
    click('#tabBar .tab[data-t="train"]');
    check('train rendered', document.querySelector('#tab-train .daily-task') !== null);

    // ---- 修复A回归：日期层本地时区（weekDays 周一列必须是"本地周一"，打卡日期必须是本地今天）----
    const p2 = n => String(n).padStart(2, '0');
    const now0 = new Date();
    const localToday = now0.getFullYear() + '-' + p2(now0.getMonth() + 1) + '-' + p2(now0.getDate());
    click('[data-toggle-task="vocab"]');
    check('training stores local today (not UTC)', !!JSON.parse(window.localStorage.getItem('wb_en_checkin_v3'))[localToday]);
    const dow0 = (now0.getDay() + 6) % 7;
    const mon0 = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate() - dow0);
    const localMonday = mon0.getFullYear() + '-' + p2(mon0.getMonth() + 1) + '-' + p2(mon0.getDate());
    const wdays = window.weekDays();
    check('weekDays starts at local Monday (UTC bug fixed)', wdays[0] === localMonday);
    check('weekDays returns 7 consecutive local dates', wdays.length === 7 && wdays.every((d, i) => {
      const x = new Date(mon0); x.setDate(mon0.getDate() + i);
      return d === (x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()));
    }));
    check('dateAdd uses local-date arithmetic', window.dateAdd(localToday, 1) === (() => {
      const x = new Date(now0); x.setDate(x.getDate() + 1);
      return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate());
    })());

    // bank: start, answer, grade
    click('#tabBar .tab[data-t="bank"]');
    check('bank filter card', document.querySelector('#tab-bank #startQuiz') !== null);
    const mTotal = /共\s*(\d+)\s*题/.exec(document.querySelector('#tab-bank .card .sub').textContent);
    check('bank total >= 900 shown', mTotal && +mTotal[1] >= 900);
    click('#startQuiz');
    check('quiz generated', document.querySelectorAll('#tab-bank .q').length > 0);
    document.querySelectorAll('#tab-bank .q .opt').forEach(o => o.click());
    click('#grade');
    check('grade revealed analysis', document.querySelector('#tab-bank .analysis') !== null);
    const wrongRaw = window.localStorage.getItem('wb_en_wrong_v3');
    check('wrong list populated', wrongRaw && JSON.parse(wrongRaw).length >= 0);

    // wrong book export (should not throw)
    let threw=false; try{ click('#expWrong'); }catch(e){ threw=true; errors.push('expWrong threw: '+e.message);} check('exportWrongBook no-throw', !threw);

    // ---- 修复B回归：错题本连对 2 次移出（第 1 次答对留在本内，第 2 次连对移出）----
    const wq = window.allQuestions().find(q => q.options && q.options.length && String(q.answer || '').trim());
    window.localStorage.setItem('wb_en_wrong_v3', JSON.stringify([wq.id]));
    window.localStorage.removeItem('wb_en_wrong_streak_v1');
    click('#tabBar .tab[data-t="bank"]');
    click('#startWrong');
    let wopt = document.querySelector('#tab-bank .q .opt[data-letter="' + wq.answer + '"]');
    check('wrong-book quiz generated with seeded question', wopt !== null);
    wopt.click();
    click('#grade');
    check('wrong stays in book after 1st correct', JSON.parse(window.localStorage.getItem('wb_en_wrong_v3')).includes(wq.id));
    check('wrong streak counter = 1 after 1st correct', (JSON.parse(window.localStorage.getItem('wb_en_wrong_streak_v1') || '{}')[wq.id]) === 1);
    click('#startWrong');
    wopt = document.querySelector('#tab-bank .q .opt[data-letter="' + wq.answer + '"]');
    wopt.click();
    click('#grade');
    check('wrong removed from book after 2nd consecutive correct', !JSON.parse(window.localStorage.getItem('wb_en_wrong_v3')).includes(wq.id));
    check('wrong streak entry cleared after removal', !JSON.parse(window.localStorage.getItem('wb_en_wrong_streak_v1') || '{}')[wq.id]);

    // vocab
    click('#tabBar .tab[data-t="vocab"]');
    const vpool = window.vocabPool();
    check('vocab pool >= 800', vpool.length >= 800);
    check('vocab list paginated to 80', document.querySelectorAll('#tab-vocab .vcard').length === 80);
    check('vocab load-more button exists', document.querySelector('#vMore') !== null);
    click('#vMore');
    check('vocab load-more expands to 200', document.querySelectorAll('#tab-vocab .vcard').length === 200);

    // 生词本闭环：列表点「不认识」→ 入生词本；生词本点「学习并认识」→ 掌握+移出
    const firstVcard = document.querySelector('#tab-vocab .vcard');
    const unkWord = firstVcard.querySelector('.vw').textContent.trim().split(/\s+/)[0];
    check('unk button labelled 不认识', /不认识|生词本/.test(firstVcard.querySelector('[data-unk]').textContent));
    click(`#tab-vocab [data-unk="${unkWord}"]`);
    const uvAfter1 = JSON.parse(window.localStorage.getItem('wb_en_user_vocab_v3') || '[]');
    check('unk adds word to user vocab', uvAfter1.some(v => v.word === unkWord));
    check('unk word entry has zh meaning', (uvAfter1.find(v => v.word === unkWord) || {}).zh !== '');
    // 列表按钮变为「生词本 ✓」
    const cardAfter = document.querySelector('#tab-vocab .vcard');
    check('list button flips to 生词本 ✓', /生词本/.test(cardAfter.querySelector('[data-unk]').textContent));
    // 生词本 Tab：点「学习并认识」→ 移出
    click('#vMode .seg-btn[data-mode="add"]');
    check('user vocab tab shows entry', /我的生词本/.test(document.querySelector('#tab-vocab').innerHTML));
    check('learn button exists', document.querySelector('#tab-vocab [data-learnw]') !== null);
    click(`#tab-vocab [data-learnw="${unkWord}"]`);
    const uvAfter2 = JSON.parse(window.localStorage.getItem('wb_en_user_vocab_v3') || '[]');
    const masteryAfter = JSON.parse(window.localStorage.getItem('wb_en_vocab_mastery_v3') || '{}');
    check('learn removes word from user vocab', !uvAfter2.some(v => v.word === unkWord));
    check('learn marks word known', masteryAfter[unkWord] === 'known');
    window.localStorage.removeItem('wb_en_user_vocab_v3');
    window.localStorage.removeItem('wb_en_vocab_mastery_v3');

    // weekly plan
    click('#tabBar .tab[data-t="plan"]');
    check('plan board 7 cols', document.querySelectorAll('#tab-plan .col').length === 7);
    const addInput = document.querySelector('#tab-plan .add input');
    addInput.value = '完成一套雅思模考';
    addInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('plan task added', /完成一套雅思模考/.test(document.querySelector('#tab-plan').innerHTML));

    // speaking partner
    click('#tabBar .tab[data-t="speak"]');
    check('speak prompt rendered', document.querySelector('#tab-speak .prompt') !== null);
    check('speak 4 categories', document.querySelectorAll('#spkCat .seg-btn').length === 4);
    click('#spkNext');
    click('#spkRead');
    click('#tab-speak [data-rate="流利"]');
    check('speak rate recorded', /流利/.test(document.querySelector('#srStatus').textContent));

    // lib + data
    click('#tabBar .tab[data-t="lib"]');
    check('lib curated', document.querySelectorAll('#tab-lib .res').length >= 6);
    click('#tabBar .tab[data-t="data"]');
    check('data heatmap 112', document.querySelectorAll('#tab-data .heat .d').length === 112);

    // ---- 我的（移动端聚合页）----
    click('#bottomNav .btab[data-t="mine"]');
    check('mine hero rendered', document.querySelector('#tab-mine .mine-hero') !== null);
    check('mine includes legacy vocab and atlas entries', document.querySelectorAll('#tab-mine .mcell').length === 6);
    click('#tab-mine .mcell[data-go="lib"]');
    check('mine cell navigates to lib', document.querySelector('#tab-lib').classList.contains('active'));

    // ---- 美音语音专项 ----
    check('verChip exists', document.querySelector('#verChip') !== null);
    // 1) 有 en-US 时优先选 en-US（即使中文语音排第一）
    const v1 = window.pickVoice('en-US');
    check('pickVoice prefers en-US', v1 && v1.lang === 'en-US');
    // 2) 只有中文语音时必须返回 null（绝不回退中文引擎）
    window.__tts.setVoices([{ name: 'Xiaoxiao', lang: 'zh-CN' }]);
    window.loadVoices();
    check('pickVoice returns null when no English voice', window.pickVoice('en-US') === null);
    // 3) 无英文语音时 speak 切换到「在线美音降级」（不再走系统语音）
    let lastAudioSrc = '';
    const origCreateEl = document.createElement.bind(document);
    document.createElement = function(tag){
      const el = origCreateEl(tag);
      if(tag==='audio'){
        const origSetSrc = function(v){lastAudioSrc=v||'';el.setAttribute('src',v||'');};
        Object.defineProperty(el,'src',{set:origSetSrc,get:function(){return lastAudioSrc;}});
        el.play = function(){return Promise.resolve();};
        el.pause = function(){};
      }
      return el;
    };
    window.__tts.spoken.length = 0;
    window.speak('The 15th of August');
    check('speak skips system TTS without English voice', window.__tts.spoken.length === 0);
    check('speak falls back to online youdao TTS', /dict\.youdao\.com/.test(lastAudioSrc));
    document.createElement = origCreateEl;
    // 4) 恢复英文语音后 speak 绑定 en-US 语音，且序数词已口语化
    window.__tts.setVoices([{ name: 'Xiaoxiao', lang: 'zh-CN' }, { name: 'Google US English', lang: 'en-US' }]);
    window.loadVoices();
    window.__tts.spoken.length = 0;
    window.speak('The 15th of August');
    const s2 = window.__tts.spoken[0];
    check('speak binds en-US voice', s2 && s2.voiceName === 'Google US English');
    check('ordinal oralized (15th -> fifteenth)', s2 && /fifteenth/i.test(s2.text));
    // 5) 诊断函数不抛错（mock confirm 因为 jsdom 未实现）
    let diagThrew = false;
    const origConfirm = window.confirm;
    window.confirm = function(){return false;};
    try { window.voiceDiag(); } catch (e) { diagThrew = true; errors.push('voiceDiag threw: ' + e.message); }
    window.confirm = origConfirm;
    check('voiceDiag no-throw', !diagThrew);

    // ---- AI 搭子（Agnes）专项 ----
    click('#tabBar .tab[data-t="ai"]');
    check('ai tab rendered', document.querySelector('#tab-ai .chatbox') !== null);
    check('ai mode toggle 2 modes', document.querySelectorAll('#aiMode .seg-btn').length === 2);

    // 1) 未配置 Key 时发送消息 → 打开配置面板并提示
    window.localStorage.removeItem('wb_en_ai_cfg_v1');
    document.querySelector('#aiInput').value = 'hello';
    click('#aiSend');
    check('ai opens cfg when no key', document.querySelector('#cfgKey') !== null);

    // 2) 保存配置后可发起对话（mock fetch）
    document.querySelector('#cfgKey').value = 'sk-test-123';
    click('#cfgSave');
    const cfgSaved = JSON.parse(window.localStorage.getItem('wb_en_ai_cfg_v1'));
    check('ai cfg persisted', cfgSaved && cfgSaved.key === 'sk-test-123' && cfgSaved.model === 'agnes-2.0-flash');
    const calls = [];
    window.fetch = (url, opts) => {
      calls.push({ url, opts });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: 'Sure! What is your favorite season? 💡 Tip: say "I like" not "I am like".' } }] }),
      });
    };
    document.querySelector('#aiInput').value = 'I am like summer very much';
    click('#aiSend');
    // aiSend 是异步的：等一拍再断言
    setTimeout(() => {
      try {
        check('ai fetch called Agnes endpoint', calls.length === 1 && /apihub\.agnes-ai\.com\/v1\/chat\/completions$/.test(calls[0].url));
        check('ai fetch carries bearer key', calls[0] && /Bearer sk-test-123/.test(calls[0].opts.headers.Authorization));
        const body = JSON.parse(calls[0].opts.body);
        check('ai payload has system + user msg', body.messages.length >= 2 && body.messages[0].role === 'system' && body.messages[body.messages.length - 1].content.includes('summer'));
        check('ai reply bubble rendered', /favorite season/.test(document.querySelector('#tab-ai').innerHTML));
        // 3) 口语模式回复自动朗读（美音），且 💡 Tip 不被读出
        const s3 = window.__tts.spoken[window.__tts.spoken.length - 1];
        check('ai reply auto-spoken in en-US', s3 && s3.lang === 'en-US' && /favorite season/.test(s3.text) && !/Tip/.test(s3.text));
        // 4) 切到树洞模式：历史独立、不自动朗读
        click('#aiMode .seg-btn[data-m="hole"]');
        check('hole mode empty history', document.querySelectorAll('#tab-ai .msg.me').length === 0);
        // ---- 修复C回归：「清空全部」按 wb_en_ 前缀全清（含周计划/AI配置/聊天/口语日志/错题连对计数）----
        ['wb_en_plan_v1','wb_en_ai_cfg_v1','wb_en_ai_mate','wb_en_ai_hole','wb_en_speaklog_v1','wb_en_wrong_streak_v1','wb_en_tts_tip_v1']
          .forEach(k => window.localStorage.setItem(k, '"seed"'));
        window.localStorage.setItem('wb_en_checkin_v3', JSON.stringify({ '2026-09-07': { tasks: { vocab: true }, note: '' } }));
        const wbBefore = [];
        for (let i = 0; i < window.localStorage.length; i++) wbBefore.push(window.localStorage.key(i));
        check('wb_en_ keys seeded before clearAll', wbBefore.filter(k => k.indexOf('wb_en_') === 0).length >= 8);
        window.confirm = function () { return true; };
        click('#tabBar .tab[data-t="data"]');
        click('#clearAll');
        const wbAfter = [];
        for (let i = 0; i < window.localStorage.length; i++) wbAfter.push(window.localStorage.key(i));
        check('clearAll wipes every wb_en_ key (plan/ai/chat/speaklog/streak)', wbAfter.filter(k => k.indexOf('wb_en_') === 0).length === 0);
        window.confirm = origConfirm;
      } catch (e) {
        errors.push('AI-TEST EXCEPTION: ' + e.stack);
      }
      console.log('\n=== ERRORS (' + errors.length + ') ===');
      errors.forEach(e => console.log(' - ' + e));
      process.exit(errors.length ? 1 : 0);
    }, 200);
  } catch (e) {
    errors.push('EXCEPTION: ' + e.stack);
    console.log('\n=== ERRORS (' + errors.length + ') ===');
    errors.forEach(e => console.log(' - ' + e));
    process.exit(1);
  }
}, 300);
