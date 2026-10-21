/* ================================================================ online: tài khoản, ghi kết quả, lịch sử, câu sai */
const API={async req(method,url,body){let r;try{r=await fetch(url,{method,credentials:'same-origin',headers:body!==undefined?{'Content-Type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined});}catch(e){const er=new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');er.status=0;throw er;}
  let d=null;try{d=await r.json();}catch(e){}if(!r.ok){const er=new Error((d&&d.error)||'Có lỗi xảy ra, hãy thử lại.');er.status=r.status;throw er;}return d;},
  get(u){return API.req('GET',u);},post(u,b){return API.req('POST',u,b||{});}};
let USER=null;const QBANK={};
function assignIds(){L.forEach(l=>l.quiz.forEach((q,i)=>{q.id=l.id+'.'+(i+1);q.ls=q.ls||l.id;QBANK[q.id]=q;}));
  [LT1,LT2].forEach(sets=>sets.forEach(s=>s.items.forEach((q,i)=>{q.id=s.key+'.'+(i+1);QBANK[q.id]=q;})));
  Object.keys(EXAMS).forEach(k=>EXAMS[k].items.forEach((q,i)=>{q.id='ex'+k+'.'+(i+1);QBANK[q.id]=q;}));}
function toast(msg,bad){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.setAttribute('role','status');document.body.appendChild(t);}t.textContent=msg;t.className=bad?'bad':'';t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>{t.hidden=true;},4500);}
function Recorder(kind,ref,title){this.kind=kind;this.ref=ref;this.title=title;this.id=null;this.q=Promise.resolve();this.t0=Date.now();}
Recorder.prototype.ensure=function(){if(!this.idp)this.idp=API.post('/api/attempts',{kind:this.kind,ref:this.ref,title:this.title}).then(r=>{this.id=r.id;});return this.idp;};
Recorder.prototype.err=function(e){if(e.status===401){USER=null;showAuth('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại; kết quả lượt này chưa được lưu.');}else toast('Chưa lưu được kết quả: '+e.message,true);};
Recorder.prototype.answer=function(list){this.q=this.q.then(()=>this.ensure()).then(()=>API.post('/api/attempts/'+this.id+'/answers',{answers:list})).catch(e=>this.err(e));return this.q;};
Recorder.prototype.finish=function(score,max){this.q=this.q.then(()=>this.ensure()).then(()=>API.post('/api/attempts/'+this.id+'/finish',{score:Math.round(score*1000)/1000,max,duration:Math.round((Date.now()-this.t0)/1000)})).then(()=>toast('Đã lưu kết quả vào lịch sử.')).catch(e=>this.err(e));return this.q;};
const recRow=(q,answer,correct,points,max)=>({qid:q.id,ls:q.ls,type:q.t,answer,correct,points:Math.round(points*1000)/1000,max});
function lessonName(ls){const l=BYID[ls];return l?'Bài '+l.no+' · '+l.title:ls;}
async function loadSummary(){const s=await API.get('/api/me/summary');PROG={};
  Object.entries(s.best).forEach(([ref,b])=>{if(BYID[ref])PROG[ref]=b.score;else if(/^test-/.test(ref))PROG[ref]=b.score/b.max*10;else if(/^exam-/.test(ref))PROG[ref]=b.score/b.max*10;else PROG[ref]=b.score/b.max*100;});return s;}
function renderUser(){const box=$('#usr');if(!box)return;if(!USER){box.innerHTML='';return;}
  box.innerHTML='<details class="umenu"><summary aria-label="Tài khoản"><span class="uav">'+esc(USER.name.trim().split(/\s+/).pop().slice(0,1).toUpperCase())+'</span><span class="unm">'+esc(USER.name)+'</span></summary><div class="udrop"><p class="uem">'+esc(USER.email)+'</p><a href="#me">Tiến bộ của em</a><a href="#wrong">Câu đang sai</a><a href="#history">Lịch sử làm bài</a><a href="#account">Đổi mật khẩu</a><button type="button" id="logout">Đăng xuất</button></div></details>';
  box.querySelectorAll('.udrop a').forEach(a=>a.addEventListener('click',()=>box.querySelector('details').open=false));
  $('#logout').addEventListener('click',async()=>{try{await API.post('/api/logout');}catch(e){}USER=null;PROG={};renderUser();showAuth();});}
function showAuth(msg,mode){const app=$('#app');app.removeAttribute('data-ch');$('#tnav').innerHTML='';renderUser();active=null;clearInterval(EXTIMER);mode=mode||'login';
  app.innerHTML='<section class="authwrap"><div class="authintro"><p class="eyebrow">Ôn thi tốt nghiệp THPT · Vật lí 12</p><h1>Hiểu <em>bản chất</em>, nhớ công thức lâu</h1><p class="sub">20 bài học có hình động, hơn 200 câu luyện tập, thi thử theo cấu trúc đề tốt nghiệp. Đăng nhập để lưu lịch sử làm bài, xem lại câu sai và làm lại cho đến khi đúng.</p></div>'+
   '<div class="authcard"><div class="seg authtabs" role="tablist"><label><input type="radio" name="am" id="am-login" value="login"'+(mode==='login'?' checked':'')+'> Đăng nhập</label><label><input type="radio" name="am" id="am-reg" value="register"'+(mode==='register'?' checked':'')+'> Tạo tài khoản</label></div>'+
   (msg?'<p class="amsg">'+esc(msg)+'</p>':'')+'<form id="authform" novalidate><div class="field" id="f-name"'+(mode==='login'?' hidden':'')+'><label for="a-name">Họ và tên</label><input id="a-name" name="name" autocomplete="name" maxlength="80"></div>'+
   '<div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" required maxlength="254"></div>'+
   '<div class="field"><label for="a-pass">Mật khẩu</label><input id="a-pass" name="password" type="password" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" required minlength="8" maxlength="128"><small id="a-hint"'+(mode==='login'?' hidden':'')+'>Ít nhất 8 kí tự.</small></div>'+
   '<p class="aerr" id="aerr" role="alert" hidden></p><button class="btn fill wide" type="submit" id="asubmit">'+(mode==='login'?'Đăng nhập':'Tạo tài khoản')+'</button></form>'+
   '<p class="qnote">Quên mật khẩu? Hãy nhờ thầy cô quản trị đặt lại mật khẩu tạm thời cho em.</p></div></section>';
  app.querySelectorAll('input[name=am]').forEach(r=>r.addEventListener('change',()=>showAuth('',r.value)));
  $('#authform').addEventListener('submit',async e=>{e.preventDefault();const err=$('#aerr'),btn=$('#asubmit');err.hidden=true;
    const email=$('#a-email').value.trim(),password=$('#a-pass').value,name=$('#a-name').value.trim();
    if(!email||!password||(mode==='register'&&!name)){err.textContent='Hãy điền đủ các ô.';err.hidden=false;return;}
    if(mode==='register'&&password.length<8){err.textContent='Mật khẩu cần ít nhất 8 kí tự.';err.hidden=false;return;}
    btn.disabled=true;btn.textContent='Đang xử lí...';
    try{const r=await API.post(mode==='login'?'/api/login':'/api/register',mode==='login'?{email,password}:{email,password,name});USER=r.user;await loadSummary();renderUser();if(!location.hash||location.hash==='#login')location.hash='#home';route();}
    catch(ex){err.textContent=ex.message;err.hidden=false;btn.disabled=false;btn.textContent=mode==='login'?'Đăng nhập':'Tạo tài khoản';}});}
const KIND={lesson:'Bài học',practice:'Luyện tập',test:'Kiểm tra chương',exam:'Thi thử',review:'Ôn câu sai'};
const when=t=>new Date(t).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function scoreText(a){if(a.finished_at==null)return '<span class="chip">Chưa xong</span>';const ten=a.kind==='exam'||a.kind==='test';return '<span class="chip '+(a.score/a.max>=.8?'ok':'mid')+'">'+(ten?fmt(a.score/a.max*10,2)+'/10':fmt(a.score,2)+'/'+fmt(a.max,a.max%1?2:0))+'</span>';}
function pageShell(title,sub){const app=$('#app');app.removeAttribute('data-ch');nav('me');active=null;app.innerHTML='<p class="crumbs"><a href="#home">Trang chủ</a> › '+esc(title)+'</p><header class="lhead"><span class="lno">'+esc(USER.name)+'</span><h1>'+esc(title)+'</h1>'+(sub?'<p class="one">'+sub+'</p>':'')+'</header><div id="pg"><p class="qnote">Đang tải...</p></div>';return $('#pg');}
function failBox(pg,e){pg.innerHTML='<p class="aerr">'+esc(e.message)+'</p><button class="btn" type="button" onclick="location.reload()">Tải lại trang</button>';}
async function mePage(){const pg=pageShell('Tiến bộ của em','Tổng hợp từ tất cả các lượt em đã làm. Bài nào tỉ lệ đúng thấp thì nên ôn lại trước.');
  try{const [s,h]=await Promise.all([API.get('/api/me/summary'),API.get('/api/attempts?limit=5')]);
    const rows=L.map(l=>({l,st:s.lessons[l.id]})).filter(x=>x.st);const weak=rows.filter(x=>x.st.max>0).sort((a,b)=>a.st.points/a.st.max-b.st.points/b.st.max).slice(0,3);
    let html='<div class="stats"><a class="stat" href="#history"><b>'+s.totals.attempts+'</b><span>lượt làm bài</span></a><div class="stat"><b>'+s.totals.questions+'</b><span>câu hỏi khác nhau đã làm</span></div><a class="stat warn" href="#wrong"><b>'+s.totals.wrongNow+'</b><span>câu đang sai, cần làm lại</span></a></div>';
    if(!rows.length)html+='<p class="sub">Em chưa làm câu nào. Hãy bắt đầu từ <a href="#c1-1">Bài 1.1</a> hoặc vào <a href="#exam">Thi thử</a>.</p>';
    else{if(weak.length)html+='<h2 class="part2">Nên ôn lại trước</h2><ul class="weaklist">'+weak.map(x=>'<li><a href="#'+x.l.id+'">'+esc(lessonName(x.l.id))+'</a><span>đúng '+fmt(100*x.st.points/x.st.max,0)+'%</span></li>').join('')+'</ul>';
      html+='<h2 class="part2">Theo từng bài</h2><div class="scroll"><table class="t prog"><tr><th>Bài</th><th>Số câu đã trả lời</th><th>Tỉ lệ điểm đúng</th></tr>'+L.map(l=>{const st=s.lessons[l.id];if(!st)return '<tr><td><a href="#'+l.id+'">'+esc(lessonName(l.id))+'</a></td><td colspan="2" class="qnote">Chưa làm</td></tr>';const p=st.max?st.points/st.max:0;return '<tr><td><a href="#'+l.id+'">'+esc(lessonName(l.id))+'</a></td><td>'+st.answered+'</td><td><span class="bar"><i style="width:'+Math.round(p*100)+'%" class="'+(p>=.8?'g':p>=.5?'m':'b')+'"></i></span> '+fmt(p*100,0)+'%</td></tr>';}).join('')+'</table></div>';}
    if(h.attempts.length)html+='<h2 class="part2">Lượt làm gần đây</h2>'+histList(h.attempts)+'<p><a class="btn" href="#history">Xem toàn bộ lịch sử</a></p>';
    pg.innerHTML=html;}catch(e){failBox(pg,e);}}
function histList(list){return '<ul class="hist">'+list.map(a=>'<li><a href="#attempt-'+a.id+'"><span class="hk">'+KIND[a.kind]+'</span><span class="ht">'+esc(a.title)+'</span><span class="hd">'+when(a.started_at)+' · '+a.answered+' câu'+(a.wrong?' · sai '+a.wrong:'')+'</span>'+scoreText(a)+'</a></li>').join('')+'</ul>';}
async function historyPage(){const pg=pageShell('Lịch sử làm bài','Bấm vào từng lượt để xem lại em đã chọn gì, câu nào sai và lời giải.');let off=0;const box=document.createElement('div');
  async function more(){try{const h=await API.get('/api/attempts?limit=50&offset='+off);if(off===0){pg.innerHTML='';if(!h.total){pg.innerHTML='<p class="sub">Chưa có lượt làm bài nào.</p>';return;}pg.appendChild(box);}
    box.insertAdjacentHTML('beforeend',histList(h.attempts));off+=h.attempts.length;const old=$('#hmore');if(old)old.remove();if(off<h.total){const b=button(pg,'Xem thêm',more);b.id='hmore';}}catch(e){failBox(pg,e);}}
  more();}
function reviewCard(q,a,n){const d=document.createElement('div');d.className='qi '+(a.correct?'okq':'noq');const type=q.t==='mc'?'Trắc nghiệm':q.t==='ds'?'Đúng / Sai':'Trả lời ngắn';
  let h='<div class="qhead"><span class="qtype">'+type+'</span><span class="qnum">Câu '+n+'</span><a class="tag2" href="#'+q.ls+'">Bài '+(BYID[q.ls]?BYID[q.ls].no:'')+'</a><span class="qpts">'+fmt(a.points,2)+'/'+fmt(a.max,2)+' điểm</span></div><p class="qq">'+sx(q.q)+'</p>'+(q.fig?'<div class="qfig">'+q.fig+'</div>':'');
  if(q.t==='mc'){const pick=a.answer&&a.answer.pick;h+='<div class="mopts">'+q.o.map((o,i)=>'<div class="mo ro'+(i===q.c?' right':i===pick?' wrong':'')+'"><span class="ml">'+'ABCD'[i]+'</span><span>'+sx(o[0])+(i===pick?' <b>(em chọn)</b>':'')+'</span></div>').join('')+'</div>';
    h+='<div class="fb '+(a.correct?'ok':'no')+'"><div class="h">'+(a.correct?'Em làm đúng':pick==null?'Em bỏ trống':'Em làm sai')+'</div>'+(pick!=null&&!a.correct?'<p><b>Vì sao lựa chọn của em sai:</b> '+sx(q.o[pick][1])+'</p>':'')+'<p><b>Đáp án đúng:</b> '+sx(q.o[q.c][1])+'</p></div>';}
  else if(q.t==='ds'){const picks=(a.answer&&a.answer.picks)||[];h+=q.s.map((s,si)=>{const p=picks[si];const ok=p===s[1];return '<div class="dsr"><div class="dsline"><span class="dl">'+'abcd'[si]+')</span><span class="dt">'+sx(s[0])+'</span><span class="chip '+(ok?'ok':'')+'">Em chọn: '+(p==null?'bỏ trống':p?'Đúng':'Sai')+' · Đáp án: '+(s[1]?'Đúng':'Sai')+'</span></div><div class="fb '+(ok?'ok':'no')+'">'+sx(s[2])+'</div></div>';}).join('');}
  else{const v=a.answer&&a.answer.value;h+='<div class="fb '+(a.correct?'ok':'no')+'"><div class="h">Em trả lời: '+esc(v==null||v===''?'bỏ trống':String(v))+' · Đáp số: '+String(q.a).replace('.',',')+' '+esc(q.u||'')+'</div><p>'+sx(q.sol)+'</p></div>';}
  d.innerHTML=h;return d;}
async function attemptPage(id){const pg=pageShell('Xem lại lượt làm bài');
  try{const r=await API.get('/api/attempts/'+id);const a=r.attempt;$('#app .lhead h1').textContent=a.title;
    const wrong=r.answers.filter(x=>!x.correct).length;pg.innerHTML='<div class="qsum exsumbox"><div>'+scoreText(Object.assign({},a))+' <span class="qnote">'+KIND[a.kind]+' · '+when(a.started_at)+(a.duration_s?' · làm trong '+Math.floor(a.duration_s/60)+' phút '+(a.duration_s%60)+' giây':'')+'</span></div><p>Em đã trả lời '+r.answers.length+' câu, '+(wrong?'<b>sai '+wrong+' câu</b>. Câu viền đỏ là câu sai.':'đúng toàn bộ.')+'</p>'+(wrong?'<a class="btn fill" href="#review">Làm lại các câu đang sai</a>':'')+'</div>';
    const list=document.createElement('div');pg.appendChild(list);let n=0;r.answers.forEach(x=>{const q=QBANK[x.qid];n++;if(!q){list.insertAdjacentHTML('beforeend','<div class="qi"><p class="qnote">Câu '+n+' không còn trong ngân hàng câu hỏi.</p></div>');return;}list.appendChild(reviewCard(q,x,n));});}
  catch(e){failBox(pg,e);}}
async function wrongPage(){const pg=pageShell('Câu đang sai','Đây là những câu mà lần gần nhất em trả lời còn sai. Làm lại đúng thì câu đó sẽ tự rời khỏi danh sách.');
  try{const r=await API.get('/api/wrong');const list=r.wrong.filter(w=>QBANK[w.qid]);if(!list.length){pg.innerHTML='<p class="sub">Không còn câu nào sai. Rất tốt! Hãy thử <a href="#exam">một đề thi thử</a>.</p>';return;}
    const by={};list.forEach(w=>{(by[w.ls]=by[w.ls]||[]).push(w);});
    let h='<div class="qsum exsumbox"><p><b>'+list.length+' câu</b> đang sai.</p><a class="btn fill" href="#review">Làm lại '+Math.min(list.length,30)+' câu sai nhiều nhất</a></div>';
    L.filter(l=>by[l.id]).forEach(l=>{h+='<h2 class="part2"><a href="#'+l.id+'">'+esc(lessonName(l.id))+'</a> <span class="qnote">'+by[l.id].length+' câu</span></h2><ul class="wl">'+by[l.id].map(w=>'<li><span>'+sx(QBANK[w.qid].q.length>300?QBANK[w.qid].q.slice(0,300)+'…':QBANK[w.qid].q)+'</span><span class="chip">sai '+w.wrongCount+'/'+w.tries+' lần</span></li>').join('')+'</ul>';});
    pg.innerHTML=h;}catch(e){failBox(pg,e);}}
async function reviewPage(){const pg=pageShell('Làm lại câu sai','Làm như bài luyện tập: chọn xong là thấy ngay đúng sai và lời giải.');
  try{const r=await API.get('/api/wrong');const items=r.wrong.map(w=>QBANK[w.qid]).filter(Boolean).slice(0,30);if(!items.length){pg.innerHTML='<p class="sub">Không còn câu nào sai để làm lại.</p>';return;}
    pg.innerHTML='<div id="quiz"></div><p><a class="btn" href="#wrong">Về danh sách câu sai</a></p>';renderQuiz($('#quiz'),items,'rv'+Date.now(),null,()=>new Recorder('review','wrong','Làm lại câu sai ('+items.length+' câu)'));}
  catch(e){failBox(pg,e);}}
function accountPage(){const pg=pageShell('Đổi mật khẩu','Email đăng nhập: '+esc(USER.email));
  pg.innerHTML='<form id="pwform" class="authcard" novalidate><div class="field"><label for="p-old">Mật khẩu hiện tại</label><input id="p-old" type="password" autocomplete="current-password" required></div><div class="field"><label for="p-new">Mật khẩu mới</label><input id="p-new" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><small>Ít nhất 8 kí tự. Các thiết bị khác sẽ bị đăng xuất.</small></div><p class="aerr" id="perr" role="alert" hidden></p><button class="btn fill" type="submit">Lưu mật khẩu mới</button></form>';
  $('#pwform').addEventListener('submit',async e=>{e.preventDefault();const er=$('#perr');er.hidden=true;try{await API.post('/api/me/password',{oldPassword:$('#p-old').value,newPassword:$('#p-new').value});toast('Đã đổi mật khẩu.');location.hash='#me';}catch(ex){er.textContent=ex.message;er.hidden=false;}});}
