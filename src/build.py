import json, os, re

base = os.path.dirname(os.path.abspath(__file__))

def load(name):
    p = os.path.join(base, name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []

# ---------- 词汇 ----------
vocab  = load("vocab.json")
vocab += load("vocab-cet6-add.json")
vocab += load("vocab-ielts-add.json")
# 按单词去重（保留首个）
seen, vocab_dedup = set(), []
for v in vocab:
    w = (v.get("word") or "").strip().lower()
    if w and w not in seen:
        seen.add(w)
        vocab_dedup.append(v)
vocab = vocab_dedup

# ---------- 题库 ----------
parts = ["cet6.json", "ielts.json", "cet6x.json", "ieltsx.json", "cet6y.json", "ieltsy.json"]
questions = []
for p in parts:
    questions += load(p)
# 按“归一化题干 + 答案”去重（解决 c6/x6、多批次间的近似重复）
def norm_stem(q):
    s = re.sub(r"\s+", " ", str(q.get("stem") or "")).strip().lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return s
seen_q, q_dedup = set(), []
for q in questions:
    key = norm_stem(q)[:120] + "|" + str(q.get("answer"))
    if key not in seen_q:
        seen_q.add(key)
        q_dedup.append(q)
questions = q_dedup

data = {"vocab": vocab, "questions": questions}
from collections import Counter
print(f"vocab={len(vocab)} ({Counter(v['level'] for v in vocab)})")
print(f"questions={len(questions)} ({Counter(q['level'] for q in questions)})")
print("types:", dict(Counter(q['type'] for q in questions)))
ids = [q['id'] for q in questions]
assert len(ids) == len(set(ids)), "duplicate question ids!"
# 每题自检：选择题 answer 必须是合法字母；非选择题（翻译/写作/听力简答）必须有参考答案文本
letters = ('A','B','C','D','i','ii','iii','iv','v','vi','vii','viii')
for q in questions:
    opts = q.get('options') or []
    ans = str(q.get('answer') or '').strip()
    assert ans, f"empty answer {q['id']}"
    assert str(q.get('analysis') or '').strip(), f"empty analysis {q['id']}"
    if opts:
        valid = [str(o).split('.')[0].strip() for o in opts]
        assert ans in valid, f"answer '{ans}' not among option letters {valid} for {q['id']}"
    else:
        assert len(ans) >= 2, f"suspicious short free-form answer {q['id']}"

js = json.dumps(data, ensure_ascii=False)
# prevent </script> breakout
js = js.replace("<", "\\u003c")

tpl = open(os.path.join(base, "template.html"), encoding="utf-8").read()
out = tpl.replace("/*__EN_DATA__*/null", js)
assert "/*__EN_DATA__*/null" not in out, "placeholder not replaced!"

# Public builds never contain a private AI credential.
out = out.replace("const AI_DEFAULT_KEY='__AI_DEFAULT_KEY__';", "const AI_DEFAULT_KEY='';")

# Word Atlas text is hosted locally in small chunks; the index loads with the app.
from pathlib import Path
root = Path(base).parent
atlas_index = json.loads((root / 'atlas/index.json').read_text(encoding='utf-8'))
atlas_words = json.loads((root / 'atlas/words.json').read_text(encoding='utf-8'))
assert len(atlas_words) == atlas_index['count'] == 7298
word_by_id = {w['id']: w for w in atlas_words}
ordered = [word_by_id[w[0]] for w in atlas_index['words']]
entries = root / 'atlas/entries'
entries.mkdir(exist_ok=True)
for i in range(0, len(ordered), 100):
    (entries / f'{i//100}.json').write_text(json.dumps(ordered[i:i+100], ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
studio_css = (root / 'src/atlas-studio.css').read_text(encoding='utf-8')
studio_js = (root / 'src/atlas-studio.js').read_text(encoding='utf-8').replace('/*__ATLAS_INDEX__*/null', json.dumps(atlas_index,ensure_ascii=False,separators=(',', ':')).replace('<','\\u003c'))
fsrs_js = (root / 'src/fsrs-browser.js').read_text(encoding='utf-8')
out = out.replace('</head>', '<style>'+studio_css+'</style>\n</head>', 1)
out = out.rsplit('</body>',1)[0]+'<script>'+fsrs_js+'</script>\n<script>'+studio_js+'</script>\n</body>\n</html>'

target = os.path.join(os.path.dirname(base), "index.html")
open(target, "w", encoding="utf-8", newline="\n").write(out)
print("written", target, os.path.getsize(target), "bytes")
