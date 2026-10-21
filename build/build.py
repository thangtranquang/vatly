# Builds public/index.html (online version with accounts) from build/source.html (the offline page)
# plus build/online.js. Every patch asserts it matched exactly once, so a changed source fails loudly.
# Usage: python build/build.py
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'build' / 'source.html').read_text(encoding='utf-8')
online = (ROOT / 'build' / 'online.js').read_text(encoding='utf-8')


def rep(s, old, new, count=1):
    n = s.count(old)
    if n != count:
        raise SystemExit(f'patch failed ({n} matches): {old[:80]!r}')
    return s.replace(old, new)


s = src
# 1. user menu in the top bar
s = rep(s, '<nav class="tnav" id="tnav" aria-label="Điều hướng"></nav>', '<nav class="tnav" id="tnav" aria-label="Điều hướng"></nav><div class="usr" id="usr"></div>')
# 2. progress now comes from the server
s = rep(s, "const KEY='vl12-banchat-v1';let PROG={};try{PROG=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){PROG={};}\nfunction saveProg(){try{localStorage.setItem(KEY,JSON.stringify(PROG));}catch(e){}}",
        "let PROG={};\nfunction saveProg(){}")
# 3. renderQuiz records every answer
s = rep(s, "function renderQuiz(host,items,key,onDone){\n  host.innerHTML='';", "function renderQuiz(host,items,key,onDone,mk){\n  const rec=mk?mk():null;host.innerHTML='';")
s = rep(s, "res[qi]=ok?.25:0;check();});});}", "res[qi]=ok?.25:0;rec&&rec.answer([recRow(q,{pick:oi},ok,ok?.25:0,.25)]);check();});});}")
s = rep(s, "else if(q.t==='ds'){const picks=new Array(q.s.length).fill(null);", "else if(q.t==='ds'){const picks=new Array(q.s.length).fill(null),sv=new Array(q.s.length).fill(null);")
s = rep(s, "fb.hidden=false;picks[si]=ok;", "fb.hidden=false;picks[si]=ok;sv[si]=said;")
s = rep(s, "const n=picks.filter(Boolean).length;res[qi]=DSP[n];", "const n=picks.filter(Boolean).length;res[qi]=DSP[n];rec&&rec.answer([recRow(q,{picks:sv},n===4,DSP[n],1)]);")
s = rep(s, "fb.hidden=false;res[qi]=ok?.25:0;check();};", "fb.hidden=false;res[qi]=ok?.25:0;rec&&rec.answer([recRow(q,{value:inp.value.trim()},ok,ok?.25:0,.25)]);check();};")
s = rep(s, "renderQuiz(host,items,key+'r',onDone);", "renderQuiz(host,items,key+'r',onDone,mk);")
s = rep(s, "onDone&&onDone(tot,max);}", "rec&&rec.finish(tot,max);onDone&&onDone(tot,max);}")
# 4. callers create a recorder
s = rep(s, "renderQuiz($('#quiz'),l.quiz,l.id,(t)=>{if(PROG[l.id]==null||t>PROG[l.id]){PROG[l.id]=t;saveProg();}});}",
        "renderQuiz($('#quiz'),l.quiz,l.id,(t)=>{if(PROG[l.id]==null||t>PROG[l.id]){PROG[l.id]=t;saveProg();}},()=>new Recorder('lesson',l.id,'Bài '+l.no+' · '+l.title));}")
s = rep(s, "if(PROG['test-'+c]==null||s10>PROG['test-'+c]){PROG['test-'+c]=s10;saveProg();}});}",
        "if(PROG['test-'+c]==null||s10>PROG['test-'+c]){PROG['test-'+c]=s10;saveProg();}},()=>new Recorder('test','test-'+c,'Kiểm tra chương '+c+' · '+CH[c].name));}")
s = rep(s, "renderQuiz($('#q-'+s.key),s.items,s.key,(t,m)=>{const pct=t/m*100;if(PROG[s.key]==null||pct>PROG[s.key]){PROG[s.key]=pct;saveProg();}});",
        "renderQuiz($('#q-'+s.key),s.items,s.key,(t,m)=>{const pct=t/m*100;if(PROG[s.key]==null||pct>PROG[s.key]){PROG[s.key]=pct;saveProg();}},()=>new Recorder('practice',s.key,'Luyện tập chương '+c+' · '+s.title));")
# 5. mock exams save all answers on submit
s = rep(s, "function submit(auto){if(done)return;done=true;clearInterval(EXTIMER);let P={mc:0,ds:0,sa:0};const lost={};",
        "function submit(auto){if(done)return;done=true;clearInterval(EXTIMER);let P={mc:0,ds:0,sa:0};const lost={},rows=[];")
s = rep(s, "P[q.t]+=got;card.classList.add(", "P[q.t]+=got;rows.push(recRow(q,q.t==='mc'?{pick:ans[qi]}:q.t==='ds'?{picks:ans[qi]}:{value:ans[qi]==null?'':String(ans[qi])},got>=max-1e-9,got,max));card.classList.add(")
s = rep(s, "{const k='exam-'+id;if(PROG[k]==null||tot>PROG[k]){PROG[k]=tot;saveProg();}}",
        "{const k='exam-'+id;if(PROG[k]==null||tot>PROG[k]){PROG[k]=tot;saveProg();}const r=new Recorder('exam','exam-'+id,name);r.t0=start;r.answer(rows);r.finish(tot,10);}")
s = rep(s, "Tiến độ được lưu trên trình duyệt của bạn.", "Mọi lượt làm bài được lưu vào tài khoản của em.")
# 6. online module, routes, boot
s = rep(s, "function route(){const h=(location.hash||'#home').slice(1);active=null;clearInterval(EXTIMER);",
        online + "\nfunction route(){const h=(location.hash||'#home').slice(1);active=null;clearInterval(EXTIMER);if(!USER){showAuth();return;}window.scrollTo(0,0);"
        "if(h==='me')return mePage();if(h==='history')return historyPage();if(h==='wrong')return wrongPage();if(h==='review')return reviewPage();if(h==='account')return accountPage();"
        "{const m=h.match(/^attempt-(\\d{1,12})$/);if(m)return attemptPage(m[1]);}")
s = rep(s, "readColors();route();",
        "readColors();assignIds();API.get('/api/me').then(r=>{USER=r.user;return loadSummary();}).then(()=>{renderUser();route();}).catch(e=>{USER=null;showAuth(e.status&&e.status!==401?e.message:'');});")
css = (ROOT / 'build' / 'online.css').read_text(encoding='utf-8')
s = rep(s, "footer{color:var(--muted);font-size:.85rem;padding-block:30px}", css + "footer{color:var(--muted);font-size:.85rem;padding-block:30px}")
# 7. full document wrapper
i = s.index('<header class="top">')
head, body = s[:i], s[i:]
head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
out = '<!doctype html>\n<html lang="vi">\n<head>\n' + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n'
(ROOT / 'public').mkdir(exist_ok=True)
(ROOT / 'public' / 'index.html').write_text(out, encoding='utf-8')
print('built public/index.html', len(out), 'bytes')
