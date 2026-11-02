/* Original Luomu interface. Dataset: Word Atlas contributors, CC BY 4.0. */
(function(){
'use strict';
const index=/*__ATLAS_INDEX__*/null;
const KEY='wb_en_atlas_v1', BASE='https://raw.githubusercontent.com/designfuchen/word-atlas/19a9bd889d2f642fef1d8d0eef85a3f35e1a66ff/public/atlas/';
const words=index.words.map((w,i)=>({id:w[0],word:w[1],zh:w[2],ipa:w[3],level:index.cefr[w[4]],topic:index.topics[w[5]][0],topicName:index.topics[w[5]][1],i}));
const byId=new Map(words.map(w=>[w.id,w]));
const fsrs=window.AtlasFSRS.fsrs({request_retention:.9,enable_fuzz:false});
const chunks=new Map(), loading=new Map();
let filters={q:'',topic:'all',level:'all',page:0}, session=null, media=null, opener=null, activeTab='train';
const mark='<img src="luomu-logo.svg" alt="" width="40" height="40">';
const arrow='<span aria-hidden="true">↗</span>';
const icon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const atlasIcon=icon('<path d="M12 3v18M3 5c4-2 6-1 9 1 3-2 5-3 9-1v14c-4-2-6-1-9 1-3-2-5-3-9-1z"/>');
const state=()=>{const s=LS.get(KEY,null);return s&&s.version===1?s:{version:1,cards:{},log:[],goal:20};};
function persist(s){LS.set(KEY,s);renderStats();}
function validateState(s){
 if(!s||s.version!==1||!s.cards||typeof s.cards!=='object'||Array.isArray(s.cards)||!Array.isArray(s.log))return false;
 return Object.entries(s.cards).every(([id,c])=>byId.has(id)&&c&&Number.isFinite(c.reps)&&c.reps>=0&&Number.isFinite(c.state)&&c.state>=0&&c.state<=3&&Number.isFinite(c.stability)&&Number.isFinite(c.difficulty)&&Number.isFinite(Date.parse(c.due))&&(!c.last_review||Number.isFinite(Date.parse(c.last_review))));
}
window.LuomuAtlas={validateState,storageKey:KEY,count:words.length};
function metrics(){const s=state(),now=Date.now();return {studied:Object.keys(s.cards).length,due:Object.values(s.cards).filter(c=>Date.parse(c.due)<=now).length,today:new Set(s.log.filter(l=>l.day===TODAY()).map(l=>l.id)).size};}
function imageURL(id){return ['library','architecture','environment','sustainable','journey','culture','innovation'].includes(id)?'atlas/img/'+id+'.webp':BASE+'thumb/'+encodeURIComponent(id)+'.webp';}
function image(id,cls=''){return `<img class="${cls}" src="${imageURL(id)}" alt="${esc(byId.get(id)?.word||id)} 的词义插画" loading="lazy" width="512" height="512">`;}
function status(w){const c=state().cards[w.id];return !c?'未学习':Date.parse(c.due)<=Date.now()?'待复习':'下次 '+new Date(c.due).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});}
function stopAudio(){if(media){media.pause();media=null;}}
function pronunciation(id,kind){
 stopAudio(); const w=byId.get(id);if(!w)return;
 media=new Audio(BASE+'audio/'+kind+'/'+encodeURIComponent(id)+'.mp3');
 const a=media;a.onerror=()=>{if(a===media)toast('录音暂时无法加载，请检查网络后重试');};
 a.play().catch(()=>{if(a===media)toast('播放失败，请再次点击发音按钮');});
}
async function detail(w){
 const n=Math.floor(w.i/100);if(chunks.has(n))return chunks.get(n).find(x=>x.id===w.id);
 if(!loading.has(n)){loading.set(n,fetch('atlas/entries/'+n+'.json',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('词条加载失败');return r.json();}).then(rows=>{chunks.set(n,rows);loading.delete(n);return rows;}).catch(e=>{loading.delete(n);throw e;}));}
 return (await loading.get(n)).find(x=>x.id===w.id);
}
function credit(){return `<details class="atlas-notice"><summary>词库来源与说明</summary><p><a href="https://github.com/designfuchen/word-atlas" target="_blank" rel="noopener noreferrer">Word Atlas contributors（词光）</a> — <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>。本站调整了界面、数据分块与学习流程。词条、插画、录音由 AI 生成，未逐条人工审校，非官方雅思词表。<a href="licenses/WORD_ATLAS_CONTENT_LICENSE.md">完整内容许可</a> · <a href="licenses/WORD_ATLAS_LICENSE.txt">代码许可</a> · <a href="licenses/TS_FSRS_LICENSE.txt">复习引擎许可</a></p></details>`;}
function detailHTML(w,d,showAdd=true){return `<div class="word-detail"><div class="detail-visual">${image(w.id)}<div class="visual-caption">A word. A scene. A new connection.<br>看见画面，记住语境。</div></div><div class="detail-copy"><span class="studio-eyebrow">${esc(w.level)} / ${esc(w.topicName)}</span><h2>${esc(w.word)}</h2><div class="pronounce-row"><button data-audio="uk" data-id="${esc(w.id)}">英音 ${esc(d.uk||w.ipa)} ▷</button><button data-audio="us" data-id="${esc(w.id)}">美音 ${esc(d.us||w.ipa)} ▷</button></div><div class="definition">${d.senses.map(s=>`<p>${esc(s.pos)} ${esc(s.zh)}<small>${esc(s.en)}</small></p>`).join('')}</div>${d.ex.map((ex,i)=>`<div class="example-block"><span class="example-label">${i?'IELTS CONTEXT':'EVERYDAY ENGLISH'}</span><p>${esc(ex.en)}</p><small>${esc(ex.zh)}</small>${i===0?`<button class="text-action" data-audio="ex" data-id="${esc(w.id)}">听例句 ▷</button>`:''}</div>`).join('')}<div class="collocations">${(d.col||[]).map(c=>`<span>${esc(c)}</span>`).join('')}</div>${d.tip?`<p class="word-tip">${esc(d.tip)}</p>`:''}${showAdd?`<button class="btn" data-learn-word="${esc(w.id)}">练习这个词 ${arrow}</button>`:''}</div></div>`;}
const dialog=document.createElement('dialog');dialog.className='atlas-dialog';dialog.setAttribute('aria-label','单词详情');document.body.append(dialog);
dialog.addEventListener('close',()=>{stopAudio();if(opener?.isConnected)opener.focus();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
async function openWord(id){const w=byId.get(id);if(!w)return;opener=document.activeElement;dialog.dataset.word=id;dialog.innerHTML='<button class="dialog-close" aria-label="关闭词卡" data-close-dialog>×</button><div class="empty-atlas" role="status">正在打开词卡…</div>';dialog.showModal();try{const d=await detail(w);if(!dialog.open||dialog.dataset.word!==id)return;dialog.innerHTML='<button class="dialog-close" aria-label="关闭词卡" data-close-dialog>×</button>'+detailHTML(w,d);dialog.querySelector('[data-close-dialog]').focus();}catch(e){if(dialog.open&&dialog.dataset.word===id)dialog.innerHTML=`<button class="dialog-close" aria-label="关闭词卡" data-close-dialog>×</button><div class="empty-atlas">词条暂时加载失败。<br><button class="btn ghost" data-retry-word="${esc(id)}">重新加载</button></div>`;}}
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement&&e.target.closest('.atlas-card,.word-detail,.hero-book')){const el=e.target;el.hidden=true;const fallback=document.createElement('span');fallback.className='image-fallback';fallback.textContent=el.alt.replace(' 的词义插画','');el.parentElement.append(fallback);}},true);
document.addEventListener('click',e=>{const b=e.target.closest('[data-audio]');if(b)pronunciation(b.dataset.id,b.dataset.audio);if(e.target.closest('[data-close-dialog]'))dialog.close();const retry=e.target.closest('[data-retry-word]');if(retry){dialog.close();openWord(retry.dataset.retryWord);}const learn=e.target.closest('[data-learn-word]');if(learn){dialog.close();startSession('recall',[byId.get(learn.dataset.learnWord)]);}});
const sidebar=document.createElement('aside');sidebar.className='studio-sidebar';sidebar.innerHTML=`<a class="studio-brand" href="https://luomufaye.ccwu.cc/">${mark}<span><strong>Luomu.</strong><small>ENGLISH STUDIO</small></span></a><div class="sidebar-label">YOUR LEARNING SPACE</div>`;
document.body.prepend(sidebar);sidebar.append(document.querySelector('nav.tabs'));sidebar.insertAdjacentHTML('beforeend','<div class="sidebar-bottom"><span class="status-dot"></span>学习记录保存在本机<a href="https://luomufaye.ccwu.cc/">回到落木的主页 ↗</a></div>');
document.querySelector('.brand h1').textContent='英语跃迁工作台';document.querySelector('.brand p').textContent='LUOMU / ENGLISH STUDIO';
const atlasPanel=document.createElement('section');atlasPanel.id='tab-atlas';atlasPanel.className='panel';document.querySelector('main').append(atlasPanel);
const navs=[['train','今日学习',ICONS.train],['atlas','词汇图鉴',atlasIcon],['bank','专项训练',ICONS.bank],['speak','口语练习',ICONS.speak],['vocab','我的词汇',ICONS.vocab],['plan','学习计划',ICONS.plan],['ai','AI 陪练',ICONS.ai],['lib','资源收藏',ICONS.lib],['data','学习数据',ICONS.data]];
renderTabs=function(){
 $('#tabBar').innerHTML=navs.map(t=>`<button type="button" class="tab ${t[0]===activeTab?'active':''}" data-t="${t[0]}" aria-label="${t[1]}" ${t[0]===activeTab?'aria-current="page"':''}>${t[2]}<span class="nav-label">${t[1]}</span></button>`).join('');
 $('#bottomNav').innerHTML=[navs[0],navs[1],navs[2],navs[3],['mine','更多',ICONS.mine]].map(t=>`<button class="btab ${t[0]===activeTab?'active':''}" data-t="${t[0]}">${t[2]}<span>${t[1]}</span></button>`).join('');
 $$('#tabBar .tab,#bottomNav .btab').forEach(b=>b.onclick=()=>goTab(b.dataset.t));
};
const originalGo=goTab;
goTab=function(id){
 if(![...navs.map(x=>x[0]),'mine'].includes(id))id='train';
 stopAudio();activeTab=id;
 if(id==='atlas'){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-atlas'));renderAtlas();}
 else originalGo(id);
 renderTabs();history.replaceState(null,'','#'+id);window.scrollTo({top:0,behavior:'instant'});
};
const originalStats=renderStats;
renderStats=function(){originalStats();const m=metrics();$('#statStrip').innerHTML=`<div class="chip"><b>${streak()}<small> 天</small></b><span>连续学习</span></div><div class="chip"><b>${m.studied}</b><span>图鉴已学词</span></div><div class="chip"><b>${m.due}</b><span>到期复习</span></div>`;};
renderTrain=function(){
 const rec=getCheckin(TODAY())||{tasks:{},note:''},done=DEFAULT_TASKS.filter(t=>rec.tasks[t.id]).length,m=metrics();
 $('#tab-train').innerHTML=`<div class="studio-heading"><div><span class="studio-eyebrow">A LITTLE, EVERY DAY</span><h2>每天一点，走得更远。</h2><p>从六级到雅思，让英语成为日常。</p></div><span class="studio-date">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</span></div><div class="study-hero"><div class="hero-copy"><span class="studio-eyebrow">YOUR NEXT CHAPTER</span><h2>让每一个词，<br>都有一个 <em>画面。</em></h2><p>把词汇放进真实语境。<br>看一幅画，听一句话，记住一个新的世界。</p><button class="btn" id="hero-start">${m.due?'开始今日复习':'开始词汇学习'} <span>↗</span></button></div><div class="hero-art" aria-hidden="true"><i class="orbit"></i><i class="orbit"></i><i class="orbit"></i><div class="hero-book">${image('library')}<div class="book-label">THE WORD COLLECTION</div><strong>Open your world.</strong></div><div class="art-note"><b>7298 words</b>一词一画 · 连接更大的世界</div></div></div><div class="dashboard-grid"><div class="card"><div class="section-head"><h3>今日学习清单</h3><span class="mini-progress">${done} / ${DEFAULT_TASKS.length} 已完成</span></div>${DEFAULT_TASKS.map((t,i)=>`<div class="daily-task ${rec.tasks[t.id]?'done':''}"><button class="task-check" data-toggle-task="${t.id}" aria-label="${rec.tasks[t.id]?'取消完成':'标记完成'}：${t.name}" aria-pressed="${!!rec.tasks[t.id]}">${rec.tasks[t.id]?'✓':''}</button><div class="task-copy"><strong>${t.name==='词汇'?'图鉴词汇 · 20 个新词':t.name==='题库'?'专项训练':t.name}</strong><small>${t.desc}</small></div><button class="task-jump" data-task-go="${{vocab:'atlas',listen:'bank',speak:'speak',read:'bank',bank:'bank'}[t.id]}" aria-label="进入${t.name}">↗</button></div>`).join('')}<div class="prog"><i style="width:${done/DEFAULT_TASKS.length*100}%"></i></div></div><div class="card"><div class="section-head"><h3>记忆正在生长</h3><button class="text-action" data-dashboard-go="atlas">打开图鉴 ↗</button></div><div class="atlas-overview"><div class="atlas-metric"><b>${m.today}<small style="font-size:13px;color:var(--muted)"> / 20</small></b><span>今日练习词数</span></div><div class="atlas-metric"><b>${m.due}</b><span>待复习单词</span></div></div><p class="study-caption">复习跟着你的记忆节奏。先回忆，再揭晓答案，让记住的词真正留下来。</p><button class="btn ghost" id="dash-review">${m.due?'复习到期词汇':'学习一组新词'} →</button></div></div><div class="skill-links">${[['bank','专项训练','六级 / 雅思 · 按题型练习'],['speak','开口表达','话题 · 跟读 · 自我复盘'],['plan','安排这一周','把学习放进你的节奏']].map(t=>`<button class="skill-link" data-dashboard-go="${t[0]}">${ICONS[t[0]]}<strong>${t[1]} ↗</strong><small>${t[2]}</small></button>`).join('')}</div><div class="card"><div class="section-head"><h3>留下一句今天</h3><span class="studio-eyebrow">DAILY REFLECTION</span></div><label class="fld" for="trainNote">今日复盘 / 一句英文</label><textarea id="trainNote" placeholder="今天印象最深的一个词，或一句想记住的话…">${esc(rec.note||'')}</textarea><div class="row" style="margin-top:14px"><span class="study-caption">记录只保存在当前浏览器，可在学习数据中备份。</span><div class="spacer"></div><button class="btn" data-checkin>保存今日记录</button></div></div><div class="studio-footnote">Designed for a little progress, every day. / Luomu</div>`;
 const saveNote=()=>{const r=getCheckin(TODAY())||{tasks:{},note:''};r.note=$('#trainNote').value;setCheckin(TODAY(),r);};
 $('#trainNote').onchange=saveNote;
 $$('[data-toggle-task]').forEach(b=>b.onclick=()=>{saveNote();const r=getCheckin(TODAY());r.tasks[b.dataset.toggleTask]=!r.tasks[b.dataset.toggleTask];setCheckin(TODAY(),r);renderTrain();renderStats();});
 $$('[data-task-go],[data-dashboard-go]').forEach(b=>b.onclick=()=>{saveNote();if(b.dataset.taskGo==='bank'){const label=b.getAttribute('aria-label')||'';bankF.type=label.includes('听力')?'听力':label.includes('阅读')?'阅读':'全部';}goTab(b.dataset.taskGo||b.dataset.dashboardGo);});
 $('[data-checkin]').onclick=()=>{saveNote();renderStats();toast('今日记录已保存');};
 $('#hero-start').onclick=$('#dash-review').onclick=()=>{saveNote();startSession('recall');};
};
const originalMine=renderMine;
renderMine=function(){originalMine();const g=$('#tab-mine .mine-grid');g.insertAdjacentHTML('afterbegin',`<button class="mcell" data-extra-go="vocab"><span class="mi">${ICONS.vocab}</span><span class="mt">我的词汇</span><span class="md">保留的旧词库与自建生词</span></button><button class="mcell" data-extra-go="atlas"><span class="mi">${atlasIcon}</span><span class="mt">词汇图鉴</span><span class="md">插画 · 发音 · 间隔复习</span></button>`);g.querySelectorAll('[data-extra-go]').forEach(b=>b.onclick=()=>goTab(b.dataset.extraGo));};
function filtered(){const q=filters.q.trim().toLowerCase();return words.filter(w=>(filters.topic==='all'||w.topic===filters.topic)&&(filters.level==='all'||w.level===filters.level)&&(!q||w.word.toLowerCase().includes(q)||w.zh.includes(q)));}
function cardsHTML(list){return list.map(w=>`<button class="atlas-card" data-word="${esc(w.id)}" aria-label="打开 ${esc(w.word)} 词卡"><div class="atlas-image">${image(w.id)}</div><div class="word-content"><div class="word-top"><strong>${esc(w.word)}</strong><span class="level-tag">${esc(w.level)}</span></div><div class="phonetic">${esc(w.ipa)}</div><div class="meaning">${esc(w.zh)}</div><span class="word-status">${esc(w.topicName)} · ${status(w)}</span></div></button>`).join('');}
function updateResults(){
 const list=filtered(),pages=Math.max(1,Math.ceil(list.length/24));filters.page=Math.min(filters.page,pages-1);
 $('#atlas-count').textContent=list.length.toLocaleString()+' 个词条';
 $('#atlas-grid').innerHTML=list.length?cardsHTML(list.slice(filters.page*24,(filters.page+1)*24)):'<div class="empty-atlas">没有找到匹配的词条，试试其他单词或筛选条件。</div>';
 $('#atlas-pagination').innerHTML=`<button class="btn ghost sm" id="atlas-prev" ${filters.page===0?'disabled':''}>上一页</button><span>${filters.page+1} / ${pages}</span><button class="btn ghost sm" id="atlas-next" ${filters.page===pages-1?'disabled':''}>下一页</button>`;
 $('#atlas-prev').onclick=()=>{filters.page--;updateResults();$('#atlas-grid').scrollIntoView({block:'start'});};$('#atlas-next').onclick=()=>{filters.page++;updateResults();$('#atlas-grid').scrollIntoView({block:'start'});};
 $$('[data-word]').forEach(b=>b.onclick=()=>openWord(b.dataset.word));
}
function renderAtlas(){
 const m=metrics();
 atlasPanel.innerHTML=`<div class="studio-heading"><div><span class="studio-eyebrow">THE WORD COLLECTION</span><h2>词汇图鉴</h2><p>7,298 个词，19 个话题。用画面和语境建立记忆。</p></div><button class="text-action" id="atlas-legacy">我的旧词汇本 ↗</button></div><div class="atlas-banner"><div><h3>${m.due?m.due+' 个词，等你再次想起。':'从一个新词，打开一个世界。'}</h3><p>已学习 ${m.studied} 个 · 今日练习 ${m.today} 个 · 优先复习到期词汇</p></div><div><button class="btn" id="atlas-learn">开始记忆 →</button> <button class="btn ghost" id="atlas-spelling">拼写训练</button></div></div><div class="atlas-controls"><label for="atlas-search">搜索词汇<input id="atlas-search" type="search" autocomplete="off" placeholder="搜索英文单词或中文释义…" value="${esc(filters.q)}"></label><label for="atlas-topic">话题<select id="atlas-topic"><option value="all">全部话题</option>${index.topics.map(t=>`<option value="${t[0]}" ${filters.topic===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></label><label for="atlas-level">语言等级<select id="atlas-level"><option value="all">全部等级</option>${index.cefr.map(l=>`<option ${filters.level===l?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="atlas-results"><span id="atlas-count" role="status" aria-live="polite"></span><button class="text-action" id="atlas-reset">重置筛选</button></div><div class="atlas-grid" id="atlas-grid"></div><div class="atlas-pagination" id="atlas-pagination"></div>${credit()}`;
 $('#atlas-search').oninput=e=>{filters.q=e.target.value;filters.page=0;updateResults();};
 $('#atlas-topic').onchange=e=>{filters.topic=e.target.value;filters.page=0;updateResults();};
 $('#atlas-level').onchange=e=>{filters.level=e.target.value;filters.page=0;updateResults();};
 $('#atlas-reset').onclick=()=>{filters={q:'',topic:'all',level:'all',page:0};renderAtlas();};
 $('#atlas-learn').onclick=()=>startSession('recall');$('#atlas-spelling').onclick=()=>startSession('typing');$('#atlas-legacy').onclick=()=>goTab('vocab');updateResults();
}
function chooseQueue(){const s=state(),list=activeTab==='atlas'?filtered():words;const due=list.filter(w=>s.cards[w.id]&&Date.parse(s.cards[w.id].due)<=Date.now()).sort((a,b)=>Date.parse(s.cards[a.id].due)-Date.parse(s.cards[b.id].due));const fresh=list.filter(w=>!s.cards[w.id]);return [...due,...fresh].slice(0,20);}
function startSession(mode,explicit){const queue=explicit||chooseQueue();goTab('atlas');session={mode,queue,pos:0,revealed:false,first:null,token:0};renderReview();}
function intervalText(due){const mins=Math.max(1,Math.round((new Date(due)-Date.now())/60000));return mins<60?mins+' 分钟':mins<1440?Math.round(mins/60)+' 小时':Math.round(mins/1440)+' 天';}
function saveRating(rating){
 if(!session||!session.revealed)return;
 const w=session.queue[session.pos],s=state(),old=s.cards[w.id]||window.AtlasFSRS.createEmptyCard();
 const result=fsrs.next(old,new Date(),rating);
 s.cards[w.id]=result.card;s.log.push({id:w.id,day:TODAY(),at:new Date().toISOString(),rating,mode:session.mode,correct:session.first});
 // Keep history bounded while preserving every card's scheduling state.
 if(s.log.length>20000)s.log=s.log.slice(-20000);
 try{persist(s);}catch(e){toast('保存失败：浏览器存储空间不足，请先导出备份');return;}
 session.pos++;session.revealed=false;session.first=null;renderReview();
}
async function reveal(){
 if(!session||session.revealed)return;session.revealed=true;const current=session,token=++session.token,w=session.queue[session.pos];
 const host=$('#review-answer');host.innerHTML='<p class="study-caption" role="status">正在加载语境…</p>';
 const revealBtn=$('#reveal-word');if(revealBtn)revealBtn.disabled=true;
 try{const d=await detail(w);if(session!==current||session.token!==token||!$('#review-answer'))return;
 host.innerHTML=detailHTML(w,d,false);const old=state().cards[w.id]||window.AtlasFSRS.createEmptyCard(),options=fsrs.repeat(old,new Date());
 $('#review-ratings').innerHTML=[['再学一次',1],['有点吃力',2],['记住了',3],['很轻松',4]].map(([label,r])=>`<button data-rating="${r}" ${session.mode==='typing'&&session.first===false&&r!==1?'disabled':''}>${label}<small>${intervalText(options[r].card.due)}后</small></button>`).join('');
 $$('[data-rating]').forEach(b=>b.onclick=()=>saveRating(Number(b.dataset.rating)));
 }catch(e){if(session!==current||!$('#review-answer'))return;host.innerHTML='<p>词条例句暂时加载失败。</p><button class="btn ghost" id="retry-reveal">重试</button>';session.revealed=false;if(revealBtn)revealBtn.disabled=false;$('#retry-reveal').onclick=reveal;}
}
function renderReview(){
 stopAudio();window.scrollTo({top:0,behavior:'instant'});const s=session;
 if(!s.queue.length||s.pos>=s.queue.length){atlasPanel.innerHTML=`<div class="review-panel"><div class="review-card"><span class="studio-eyebrow">${s.pos?'SESSION COMPLETE':'ALL CAUGHT UP'}</span><h2 class="review-word">${s.pos?'Well done.':'Take a breath.'}</h2><p class="review-prompt">${s.pos?'这一组完成了，你练习了 '+s.pos+' 个词。':'当前筛选下没有新词或到期词汇，可以调整筛选继续探索。'}<br>下一次复习时间，已经为你安排好。</p><button class="btn" id="back-atlas">回到词汇图鉴 →</button></div></div>`;$('#back-atlas').onclick=()=>{session=null;renderAtlas();};return;}
 const w=s.queue[s.pos];
 atlasPanel.innerHTML=`<div class="review-panel"><div class="review-toolbar"><button class="text-action" id="exit-review">← 返回图鉴</button><span>${s.mode==='typing'?'拼写训练':'主动回忆'} · ${s.pos+1} / ${s.queue.length}</span></div><div class="prog"><i style="width:${s.pos/s.queue.length*100}%"></i></div><div class="review-card"><span class="studio-eyebrow">${esc(w.topicName)} / ${w.level}</span>${s.mode==='typing'?`<div class="review-word" style="font-family:inherit;font-size:28px">${esc(w.zh)}</div><p class="review-prompt">根据释义拼出单词。第一次作答会计入本次复习。</p><form class="typing-form" id="typing-form"><label class="fld" for="typing-answer">英文单词</label><input id="typing-answer" autocapitalize="off" autocomplete="off" spellcheck="false" required><button class="btn" type="submit">检查拼写</button></form><div id="typing-feedback" class="answer-feedback" role="status" aria-live="polite"></div>`:`<h2 class="review-word">${esc(w.word)}</h2><p class="review-prompt">${esc(w.ipa)}<br>先想一想它的意思，再试着用它说一句话。</p><button class="btn" id="reveal-word">揭晓词义与语境</button>`}<div class="review-answer" id="review-answer"></div></div><div class="review-ratings" id="review-ratings"></div></div>`;
 $('#exit-review').onclick=()=>{session=null;renderAtlas();stopAudio();};
 if(s.mode==='typing'){$('#typing-form').onsubmit=e=>{e.preventDefault();if(session.first!==null)return;const answer=$('#typing-answer').value.trim().toLowerCase();if(!answer)return;s.first=answer===w.word.toLowerCase();const feedback=$('#typing-feedback');feedback.className='answer-feedback '+(s.first?'success':'error');feedback.textContent=s.first?'拼写正确，查看语境后确认记忆程度。':'正确拼写：'+w.word+'。本次按“再学一次”安排复习。';$('#typing-answer').disabled=true;$('#typing-form button').disabled=true;reveal();};$('#typing-answer').focus();}
 else $('#reveal-word').onclick=reveal;
}
window.addEventListener('hashchange',()=>goTab(location.hash.slice(1)));
renderTabs();renderStats();goTab(location.hash.slice(1)||'train');
})();
