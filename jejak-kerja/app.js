(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var clip=function(s,n){s=String(s);return s.length>n?s.slice(0,n)+'…':s};
var pad=function(n){return String(n).padStart(2,'0')};
var ymd=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
var parse=function(s){var p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
var today=function(){return ymd(new Date())};
var addDays=function(s,n){var d=parse(s);d.setDate(d.getDate()+n);return ymd(d)};
var fmtD=function(s){return s?parse(s).toLocaleDateString('id-ID',{day:'numeric',month:'short'}):''};
var fmtLong=function(s){return parse(s).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})};
var fmtTs=function(iso){var d=new Date(iso);return d.toLocaleDateString('id-ID',{day:'numeric',month:'short'})+', '+pad(d.getHours())+':'+pad(d.getMinutes())};
var isoDay=function(iso){return ymd(new Date(iso))};
var diffDays=function(a,b){return Math.round((parse(b)-parse(a))/864e5)};
var relDay=function(ds){var n=diffDays(today(),ds);if(n===0)return 'hari ini';if(n===1)return 'besok';if(n===-1)return 'kemarin';if(n>1)return n+' hari lagi';return 'terlambat '+(-n)+' hari'};
var copy=function(o){return Object.assign({},o)};

var ST={todo:'Belum mulai',doing:'Berjalan',wait:'Hold',done:'Selesai'};
var ST_ORDER={doing:0,todo:1,wait:2,done:3};
var KIND={report:'Report',email:'Follow-up email',meeting:'Meeting',dokumen:'Dokumen',lain:'Lainnya'};
var PRI={high:'Tinggi',mid:'Sedang',low:'Rendah'};
var PRI_RANK={high:0,mid:1,low:2};
var RES={low:'Low',mid:'Medium',high:'High'};
var RES_N={low:1,mid:2,high:3};
var VIEWS={ringkas:'home',daftar:'list',kalender:'cal'};
var DOW=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];

var S={tasks:[],view:'home',filter:'all',q:'',sort:'prio',res:'all',
  cal:new Date(new Date().getFullYear(),new Date().getMonth(),1),sel:today(),
  mode:'init',ready:false,slow:false,err:null,assetsApi:null,uploading:false,modal:null,drag:-1};

/* ---------- penyimpanan ---------- */
var col=null,chains={},LS='jejak-kerja-v1';
function localLoad(){try{return JSON.parse(localStorage.getItem(LS)||'[]')}catch(e){return []}}
function localSave(a){try{localStorage.setItem(LS,JSON.stringify(a))}catch(e){}}
function newId(){return col?col.doc().id:('t'+Date.now().toString(36)+Math.random().toString(36).slice(2,6))}
function toast(msg,err){var t=$('#toast');t.textContent=msg;t.className=err?'err':'';t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(function(){t.hidden=true},3600)}
function queue(id,fn){
  var p=(chains[id]||Promise.resolve()).then(fn).catch(function(e){toast('Gagal menyimpan'+(e&&e.message?': '+e.message:''),true)});
  chains[id]=p;return p;
}
function put(id,data){return queue(id,async function(){
  if(col){await col.doc(id).set(data)}
  else{var a=localLoad().filter(function(t){return t.id!==id});a.push(Object.assign({id:id},data));localSave(a);S.tasks=a;render()}
})}
function patch(id,data){
  var cur=byId(id);if(cur){Object.assign(cur,data);render()}
  return queue(id,async function(){
    if(col){await col.doc(id).update(data)}
    else{var a=localLoad().map(function(t){return t.id===id?Object.assign({},t,data):t});localSave(a);S.tasks=a;render()}
  });
}
function del(id){return queue(id,async function(){
  if(col){await col.doc(id).delete()}
  else{var a=localLoad().filter(function(t){return t.id!==id});localSave(a);S.tasks=a;render()}
})}

/* ---------- logika task dan langkah ---------- */
function blank(){return {title:'',kind:'report',status:'todo',priority:'mid',result:'',planStart:'',planEnd:'',startedAt:'',doneAt:'',nextNote:'',notes:'',steps:[],log:[],files:[],example:false}}
function byId(id){return S.tasks.find(function(t){return t.id===id})}
function steps(t){return t.steps||[]}
function isOver(t){return t.status!=='done'&&t.planEnd&&t.planEnd<today()}
function dueKey(t){return t.planEnd||t.planStart||'9999-12-31'}
function byPri(a,b){return (PRI_RANK[a.priority||'mid']-PRI_RANK[b.priority||'mid'])||dueKey(a).localeCompare(dueKey(b))}
function curStep(t){var s=steps(t);return s.find(function(x){return x.status==='doing'})||s.find(function(x){return x.status==='todo'})||null}
function aggStatus(ss){
  if(!ss.length)return null;
  var done=ss.filter(function(s){return s.status==='done'}).length;
  if(done===ss.length)return 'done';
  if(ss.some(function(s){return s.status==='doing'}))return 'doing';
  var rest=ss.filter(function(s){return s.status!=='done'});
  if(rest.every(function(s){return s.status==='wait'}))return 'wait';
  return done>0?'doing':'todo';
}
function stepTo(s,to){
  var now=new Date().toISOString(),n=copy(s);n.status=to;
  if((to==='doing'||to==='done')&&!n.startedAt)n.startedAt=now;
  if(to==='done'){if(s.status!=='done')n.doneAt=now}else n.doneAt='';
  return n;
}
function stepsPatch(t,ns,logTexts){
  var now=new Date().toISOString(),st=aggStatus(ns),o={steps:ns.map(copy),updatedAt:now};
  if(st){
    o.status=st;
    o.startedAt=t.startedAt||(ns.some(function(s){return s.status==='doing'||s.status==='done'})?now:'');
    o.doneAt=st==='done'?((t.status==='done'&&t.doneAt)||now):'';
  }
  if(logTexts&&logTexts.length)o.log=(t.log||[]).concat(logTexts.map(function(x){return {t:now,text:x,auto:true}}));
  return o;
}
function stamps(oldStatus,oldStarted,ns){
  var o={},now=new Date().toISOString();
  if(ns==='doing'&&!oldStarted)o.startedAt=now;
  if(ns==='done'){if(oldStatus!=='done')o.doneAt=now}else o.doneAt='';
  return o;
}
function durText(t){
  if(t.status!=='done'||!t.doneAt)return '';
  var s=t.startedAt?isoDay(t.startedAt):(t.planStart||isoDay(t.createdAt||t.doneAt));
  var n=diffDays(s,isoDay(t.doneAt))+1;
  return n<=1?'selesai dalam sehari':'dikerjakan '+n+' hari';
}
function setStatus(id,ns){
  var t=byId(id);if(!t||t.status===ns||steps(t).length)return;
  var now=new Date().toISOString();
  var log=(t.log||[]).concat([{t:now,text:'Status: '+ST[ns],auto:true}]);
  return patch(id,Object.assign({status:ns,log:log,updatedAt:now},stamps(t.status,t.startedAt,ns)));
}
function changeStep(id,sid,to){
  var t=byId(id);if(!t)return;
  var s=steps(t).find(function(x){return x.id===sid});if(!s||s.status===to)return;
  var ns=steps(t).map(function(x){return x.id===sid?stepTo(x,to):x});
  return patch(id,stepsPatch(t,ns,['Langkah "'+s.title+'": '+ST[to]]));
}
function tasksOn(ds){
  return S.tasks.filter(function(t){
    var s=t.planStart||t.planEnd,e=t.planEnd||t.planStart;
    return s&&e&&ds>=s&&ds<=e;
  }).sort(function(a,b){return (ST_ORDER[a.status]-ST_ORDER[b.status])||a.title.localeCompare(b.title)});
}
function lastDone(){
  var best=null;
  S.tasks.forEach(function(t){
    var ss=steps(t);
    if(ss.length){ss.forEach(function(s){if(s.status==='done'&&s.doneAt&&(!best||s.doneAt>best.at))best={t:t,s:s,at:s.doneAt}})}
    else if(t.status==='done'&&t.doneAt&&(!best||t.doneAt>best.at))best={t:t,s:null,at:t.doneAt};
  });
  return best;
}

/* ---------- tampilan ---------- */
function pill(st){return '<span class="pill st-'+st+'">'+ST[st]+'</span>'}
function priTag(p){p=p||'mid';return '<span class="pri pri-'+p+'">Prioritas '+PRI[p]+'</span>'}
function resBadge(r){
  if(!r||!RES[r])return '';
  var n=RES_N[r];
  return '<span class="res" title="Hasil penilaian akhir"><span>Hasil: '+RES[r]+'</span><i>'+[1,2,3].map(function(k){return '<b'+(k<=n?' class="on"':'')+'></b>'}).join('')+'</i></span>';
}
function actBtns(t){
  if(t.status==='done')return '<button class="btn sm" data-act="status" data-id="'+t.id+'" data-to="doing" type="button">Buka lagi</button>';
  var h='';
  if(t.status!=='doing')h+='<button class="btn sm" data-act="status" data-id="'+t.id+'" data-to="doing" type="button">Mulai</button>';
  return h+'<button class="btn sm" data-act="status" data-id="'+t.id+'" data-to="done" type="button">Selesai</button>';
}
function dateRange(t){
  if(t.planStart&&t.planEnd&&t.planStart!==t.planEnd)return fmtD(t.planStart)+' → '+fmtD(t.planEnd);
  var d=t.planEnd||t.planStart;return d?fmtD(d):'Tanpa tanggal';
}
function taskRow(t){
  var ss=steps(t),over=isOver(t),f=(t.files||[]).length,cs=ss.length?curStep(t):null;
  var dn=ss.filter(function(s){return s.status==='done'}).length;
  var segs=ss.length?'<div class="segs">'+ss.map(function(s){return '<span class="seg st-'+s.status+'" title="'+esc(s.title+' · '+ST[s.status])+'"></span>'}).join('')+'</div>':'';
  return '<div class="row st-'+t.status+'" data-act="open" data-id="'+t.id+'" tabindex="0" role="button">'
    +pill(t.status)
    +'<div><div class="t">'+esc(t.title)+'</div><div class="sub"><span>'+KIND[t.kind||'lain']+'</span>'
    +priTag(t.priority)+resBadge(t.result)
    +(ss.length?'<span>'+dn+'/'+ss.length+' langkah</span>':'')
    +(cs?'<span>Sekarang: '+esc(cs.title)+'</span>':'')
    +(f?'<span>'+f+' lampiran</span>':'')+'</div>'
    +segs
    +(t.nextNote?'<div class="sub nn">→ '+esc(clip(t.nextNote,80))+'</div>':'')+'</div>'
    +'<div class="right"><span class="d">'+dateRange(t)+(over?' · <span class="late">'+relDay(t.planEnd)+'</span>':'')+'</span>'+(ss.length?'':'<span class="a">'+actBtns(t)+'</span>')+'</div></div>';
}
function mini(id,title,meta){
  return '<div class="mini" data-act="open" data-id="'+id+'" tabindex="0" role="button"><span class="mini-t">'+esc(title)+'</span><span class="mini-m">'+meta+'</span></div>';
}

function nextCard(last){
  var task=null,step=null,note='',src='';
  if(last){var f=last.t,cs=curStep(f);if(cs||f.nextNote){task=f;step=cs;note=f.nextNote||'';src='Lanjutan dari yang terakhir kamu selesaikan'}}
  if(!task){
    var q=S.tasks.filter(function(x){return x.status==='todo'||x.status==='doing'}).sort(function(a,b){
      return byPri(a,b);
    });
    if(q[0]){task=q[0];step=curStep(task);note=task.nextNote||'';src='Dari antrean, prioritas tertinggi dulu'}
  }
  if(!task)return '<p class="meta">Antrean kosong. Tambah task baru, atau tulis "Setelah ini" di task yang sedang berjalan.</p>';
  var hold=steps(task).filter(function(s){return s.status==='wait'});
  var h;
  if(step)h='<h2>'+esc(step.title)+'</h2><div class="meta">di '+esc(task.title)+(step.status==='doing'?' · sedang berjalan':'')+'</div>';
  else if(note)h='<h2>'+esc(note)+'</h2><div class="meta">Catatan "Setelah ini" di '+esc(task.title)+'</div>';
  else h='<h2>'+esc(task.title)+'</h2><div class="meta">'+KIND[task.kind||'lain']+(task.planEnd?' · target '+fmtD(task.planEnd)+' ('+(isOver(task)?'<span class="late">'+relDay(task.planEnd)+'</span>':relDay(task.planEnd))+')':'')+'</div>';
  if(step&&note)h+='<p class="quote">Setelah ini: '+esc(note)+'</p>';
  if(hold.length)h+='<div class="meta">Hold: '+hold.map(function(s){return esc(s.title)}).join(', ')+'</div>';
  h+='<div class="meta">'+esc(src)+'</div><div class="acts">';
  if(step&&step.status==='todo')h+='<button class="btn primary sm" data-act="stepStatus" data-id="'+task.id+'" data-sid="'+esc(step.id)+'" data-to="doing" type="button">Mulai langkah ini</button>';
  else if(step&&step.status==='doing')h+='<button class="btn primary sm" data-act="stepStatus" data-id="'+task.id+'" data-sid="'+esc(step.id)+'" data-to="done" type="button">Tandai selesai</button>';
  else if(!step&&!steps(task).length&&task.status==='todo')h+='<button class="btn primary sm" data-act="status" data-id="'+task.id+'" data-to="doing" type="button">Mulai sekarang</button>';
  return h+'<button class="btn sm" data-act="open" data-id="'+task.id+'" type="button">Buka task</button></div>';
}

function viewHome(){
  var t=S.tasks;
  if(!t.length)return '<div class="empty"><h2>Belum ada task</h2><p>Catat task pertama kamu, lalu pecah jadi langkah-langkah seperti Review 1, Review 2, Draft report. Tiap langkah punya status sendiri, jadi yang di-hold tidak ikut dianggap berjalan.</p><button class="btn primary" data-act="newTask" type="button">Buat task pertama</button></div>';
  var last=lastDone();
  var lastHtml=last
    ?'<h2>'+esc(last.s?last.s.title:last.t.title)+'</h2><div class="meta">'+(last.s?'Langkah di '+esc(last.t.title)+' · ':'')+'selesai '+fmtTs(last.at)+(!last.s&&durText(last.t)?' · '+durText(last.t):'')+'</div>'+(last.t.result?'<div>'+resBadge(last.t.result)+'</div>':'')
      +'<div class="acts"><button class="btn sm" data-act="open" data-id="'+last.t.id+'" type="button">Buka task</button></div>'
    :'<p class="meta">Belum ada yang selesai. Setelah kamu menandai satu langkah atau task Selesai, di sini tercatat yang terakhir kamu kerjakan.</p>';
  var cnt=['todo','doing','wait','done'].map(function(s){return '<li><button data-act="goFilter" data-f="'+s+'" type="button"><b>'+t.filter(function(x){return x.status===s}).length+'</b> '+ST[s]+'</button></li>'}).join('');
  var doing=t.filter(function(x){return x.status==='doing'}).sort(byPri).map(function(x){
    var run=steps(x).filter(function(s){return s.status==='doing'}),c=run.length?run:(curStep(x)?[curStep(x)]:[]);
    return mini(x.id,x.title,c.length?esc('Langkah: '+c.map(function(s){return s.title}).join(', ')):KIND[x.kind||'lain']);
  });
  var holds=[];
  t.forEach(function(x){
    var ss=steps(x);
    if(ss.length){ss.forEach(function(s){if(s.status==='wait')holds.push(mini(x.id,s.title,esc(x.title)))})}
    else if(x.status==='wait')holds.push(mini(x.id,x.title,KIND[x.kind||'lain']));
  });
  var soon=t.filter(function(x){return x.status!=='done'&&x.planEnd&&x.planEnd<=addDays(today(),7)}).sort(function(a,b){return a.planEnd.localeCompare(b.planEnd)}).map(function(x){
    return mini(x.id,x.title,KIND[x.kind||'lain']+' · '+(isOver(x)?'<span class="late">'+relDay(x.planEnd)+'</span>':relDay(x.planEnd)));
  });
  return '<div class="flow"><section class="focus"><div class="eyebrow">Terakhir selesai</div>'+lastHtml+'</section>'
    +'<section class="focus next"><div class="eyebrow">Berikutnya</div>'+nextCard(last)+'</section></div>'
    +'<ul class="counts">'+cnt+'</ul>'
    +'<div class="cols"><section><h3>Sedang dikerjakan</h3>'+(doing.length?doing.join(''):'<div class="none">Tidak ada yang berjalan.</div>')+'</section>'
    +'<section><h3>Hold</h3>'+(holds.length?holds.join(''):'<div class="none">Tidak ada yang di-hold.</div>')+'</section>'
    +'<section><h3>Tenggat 7 hari ke depan</h3>'+(soon.length?soon.join(''):'<div class="none">Tidak ada tenggat dalam seminggu.</div>')+'</section></div>';
}

function filtered(){
  var q=S.q.trim().toLowerCase();
  return S.tasks.filter(function(t){
    if(S.filter!=='all'&&t.status!==S.filter)return false;
    if(S.res==='none'){if(t.result)return false}else if(S.res!=='all'&&t.result!==S.res)return false;
    if(q){
      var hay=t.title+' '+(t.notes||'')+' '+(t.nextNote||'')+' '+steps(t).map(function(s){return s.title}).join(' ');
      if(hay.toLowerCase().indexOf(q)<0)return false;
    }
    return true;
  }).sort(function(a,b){
    var da=a.status==='done'?1:0,db=b.status==='done'?1:0;
    if(da!==db)return da-db;
    if(da)return (b.doneAt||'').localeCompare(a.doneAt||'');
    return S.sort==='due'?dueKey(a).localeCompare(dueKey(b)):byPri(a,b);
  });
}
function listBody(){
  var r=filtered();
  if(!r.length)return '<div class="none">'+(S.tasks.length?'Tidak ada task yang cocok dengan filter ini.':'Belum ada task.')+'</div>';
  return r.map(taskRow).join('');
}
function viewList(){
  var chips=[['all','Semua']].concat(Object.keys(ST).map(function(k){return [k,ST[k]]})).map(function(p){
    return '<button class="fchip" data-act="filter" data-f="'+p[0]+'" aria-pressed="'+(S.filter===p[0])+'" type="button">'+p[1]+'</button>';
  }).join('');
  return '<div class="bar"><input type="search" id="q" placeholder="Cari judul, langkah, atau catatan" aria-label="Cari task" value="'+esc(S.q)+'"></div>'
    +'<div class="bar"><div class="chips">'+chips+'</div></div>'
    +'<div class="bar"><label class="inl">Urutkan <select id="sortSel"><option value="prio"'+(S.sort==='prio'?' selected':'')+'>Prioritas, tertinggi dulu</option><option value="due"'+(S.sort==='due'?' selected':'')+'>Tenggat terdekat</option></select></label>'
    +'<label class="inl">Hasil penilaian <select id="resSel">'
    +[['all','Semua'],['none','Belum dinilai'],['high','High'],['mid','Medium'],['low','Low']].map(function(p){return '<option value="'+p[0]+'"'+(S.res===p[0]?' selected':'')+'>'+p[1]+'</option>'}).join('')
    +'</select></label></div>'
    +'<div class="rows" id="listBody">'+listBody()+'</div>';
}

function viewCal(){
  var y=S.cal.getFullYear(),m=S.cal.getMonth();
  var off=(new Date(y,m,1).getDay()+6)%7,dim=new Date(y,m+1,0).getDate(),weeks=Math.ceil((off+dim)/7);
  var h='<div class="calhead"><h2>'+S.cal.toLocaleDateString('id-ID',{month:'long',year:'numeric'})+'</h2>'
    +'<button class="btn sm" data-act="calPrev" type="button" aria-label="Bulan sebelumnya">←</button>'
    +'<button class="btn sm" data-act="calToday" type="button">Hari ini</button>'
    +'<button class="btn sm" data-act="calNext" type="button" aria-label="Bulan berikutnya">→</button></div><div class="grid">';
  h+=DOW.map(function(d){return '<div class="dow">'+d+'</div>'}).join('');
  for(var i=0;i<weeks*7;i++){
    var d=new Date(y,m,1-off+i),ds=ymd(d),list=tasksOn(ds),other=d.getMonth()!==m;
    h+='<button class="cell'+(other?' dim':'')+(ds===today()?' today':'')+(ds===S.sel?' sel':'')+'" data-act="selDay" data-d="'+ds+'" type="button" aria-label="'+esc(fmtLong(ds))+(list.length?', '+list.length+' task':'')+'">'
      +'<span class="dn">'+d.getDate()+'</span>'
      +list.slice(0,3).map(function(t){return '<span class="chip st-'+t.status+'">'+esc(t.title)+'</span>'}).join('')
      +(list.length>3?'<span class="more">+'+(list.length-3)+' lagi</span>':'')+'</button>';
  }
  h+='</div><div class="legend">'+Object.keys(ST).map(function(k){return '<span class="pill st-'+k+'">'+ST[k]+'</span>'}).join('')+'</div>';
  var day=tasksOn(S.sel);
  h+='<section class="agenda"><div class="agenda-h"><h3 class="sec-h" style="margin:0">'+esc(fmtLong(S.sel))+'</h3>'
    +'<button class="btn sm" data-act="newOnDay" type="button">+ Task di tanggal ini</button></div>'
    +'<div class="rows">'+(day.length?day.map(taskRow).join(''):'<div class="none">Belum ada task di tanggal ini.</div>')+'</div></section>';
  return h;
}

function render(){
  var tabs={home:'#tab-home',list:'#tab-list',cal:'#tab-cal'};
  Object.keys(tabs).forEach(function(k){$(tabs[k]).setAttribute('aria-selected',String(S.view===k))});
  var b='';
  if(S.err)b='<div class="banner warn">Data tidak bisa dibaca saat ini. Muat ulang halaman ini nanti.</div>';
  else if(S.slow&&!S.ready)b='<div class="banner warn">Data belum terjangkau. Pastikan koneksi aktif, halaman akan terisi sendiri begitu tersambung.</div>';
  else if(S.mode==='local')b='<div class="banner warn">Mode lokal: task hanya tersimpan di browser ini dan tidak ikut ke perangkat lain. Lampiran file hanya aktif di versi yang dibuka dengan akun pemilik.</div>';
  if(S.ready&&S.tasks.some(function(t){return t.example}))b+='<div class="banner"><span>Task bertanda (contoh) hanya untuk melihat cara kerjanya.</span><button class="btn sm" data-act="clearExamples" type="button">Hapus semua contoh</button></div>';
  $('#banner').innerHTML=b;
  var v=$('#view');
  if(!S.ready){v.innerHTML='<div class="none">Memuat task…</div>'}
  else v.innerHTML=S.view==='home'?viewHome():S.view==='list'?viewList():viewCal();
  if(S.modal)refreshExtras();
}

/* ---------- modal ---------- */
function opts(map,sel){return Object.keys(map).map(function(k){return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+map[k]+'</option>'}).join('')}
function openModal(id,preset){
  var t=id?byId(id):null;if(id&&!t)return;
  var d=t||Object.assign(blank(),preset||{});
  S.modal={id:id||null,steps:steps(d).map(copy),files:[]};
  $('#modalRoot').innerHTML='<div class="overlay" data-act="overlay"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mTitle">'
    +'<div class="sheet-h"><h2 id="mTitle">'+(id?'Detail task':'Task baru')+'</h2><button class="btn sm" data-act="closeModal" type="button">Tutup</button></div>'
    +'<div class="fld"><label for="f-title">Judul</label><input type="text" id="f-title" value="'+esc(d.title)+'" placeholder="Mis. Laporan evaluasi vendor"></div>'
    +'<div class="g2"><div class="fld"><label for="f-kind">Jenis</label><select id="f-kind">'+opts(KIND,d.kind||'lain')+'</select></div>'
    +'<div class="fld"><label for="f-pri">Prioritas (mana duluan)</label><select id="f-pri">'+opts(PRI,d.priority||'mid')+'</select></div></div>'
    +'<div class="g2"><div class="fld"><label for="f-start">Mulai (rencana)</label><input type="date" id="f-start" value="'+esc(d.planStart)+'"></div>'
    +'<div class="fld"><label for="f-end">Selesai (target)</label><input type="date" id="f-end" value="'+esc(d.planEnd)+'"></div></div>'
    +'<div class="fld" id="statusFld"><label for="f-status">Status</label><select id="f-status">'+opts(ST,d.status)+'</select></div>'
    +'<div class="timeinfo" id="statusAuto" hidden></div>'
    +'<div class="fld"><label for="f-res">Hasil penilaian akhir</label><select id="f-res">'+opts(Object.assign({'':'Belum dinilai'},RES),d.result||'')+'</select><div class="timeinfo">Isi setelah assessment selesai, mis. hasil akhir vendor: Low, Medium, atau High.</div></div>'
    +'<div class="timeinfo" id="timeInfo"></div>'
    +'<div class="box"><span class="lbl">Langkah</span><div class="timeinfo">Urutkan sesuai alur kerjamu. Tiap langkah punya status sendiri, jadi satu yang di-hold tidak menghentikan yang lain. Tarik ⋮⋮ atau pakai panah untuk mengubah urutan.</div>'
    +'<ul class="steps" id="stepList"></ul>'
    +'<div class="addline"><input type="text" id="stepIn" placeholder="Tambah langkah, mis. Review 1 (Enter). Tempel beberapa baris sekaligus juga bisa." aria-label="Langkah baru"><button class="btn" data-act="addStep" type="button">Tambah</button></div></div>'
    +'<div class="fld"><label for="f-nextNote">Setelah ini (tulis sendiri)</label><textarea class="short" id="f-nextNote" placeholder="Mis. Review 3, lalu detil temuan dan rekomendasi, lanjut draft report. Kalau perlu meeting dulu.">'+esc(d.nextNote)+'</textarea></div>'
    +'<div class="fld"><label for="f-notes">Catatan</label><textarea id="f-notes" placeholder="Konteks, link, hal yang perlu diingat">'+esc(d.notes)+'</textarea></div>'
    +'<div class="box"><span class="lbl">Lampiran (xls, docs, pdf, dll)</span><div id="fileBox"></div></div>'
    +(id?'<div class="box"><span class="lbl">Catatan harian</span><div id="logBox"></div></div>':'')
    +'<div class="foot"><div>'+(id?'<button class="btn danger" data-act="delTask" type="button">Hapus task</button>':'')+'</div>'
    +'<div class="r"><button class="btn" data-act="closeModal" type="button">Batal</button><button class="btn primary" data-act="saveTask" type="button">Simpan</button></div></div>'
    +'</div></div>';
  renderSteps();refreshExtras();
  var f=$('#f-title');if(f&&!id)f.focus();
}
function closeModal(keep){
  if(S.modal&&!S.modal.id&&!keep&&S.assetsApi){S.modal.files.forEach(function(f){S.assetsApi.delete(f.id).catch(function(){})})}
  S.modal=null;$('#modalRoot').innerHTML='';
}
function modalFiles(){
  if(!S.modal)return [];
  if(S.modal.id){var t=byId(S.modal.id);return t?(t.files||[]):[]}
  return S.modal.files;
}
function refreshExtras(){
  if(!S.modal)return;
  var t=S.modal.id?byId(S.modal.id):null;
  if(S.modal.id&&!t){closeModal(true);return}
  var ti=$('#timeInfo');
  if(ti){
    var p=[];
    if(t&&t.createdAt)p.push('Dibuat '+fmtD(isoDay(t.createdAt)));
    if(t&&t.startedAt)p.push('mulai dikerjakan '+fmtD(isoDay(t.startedAt)));
    if(t&&t.doneAt)p.push('selesai '+fmtD(isoDay(t.doneAt))+(durText(t)?' ('+durText(t)+')':''));
    ti.textContent=p.join(' · ');
  }
  var lb=$('#logBox');
  if(lb&&t){
    if(!lb.dataset.ready){
      lb.dataset.ready='1';
      lb.innerHTML='<div class="addline"><input type="text" id="logIn" placeholder="Tulis catatan, mis. sudah kirim draft ke manager" aria-label="Catatan harian"><button class="btn" data-act="addLog" type="button">Tambah</button></div><ul class="log" id="logList"></ul>';
    }
    var ll=$('#logList'),log=(t.log||[]).slice().reverse();
    if(ll)ll.innerHTML=log.length?log.map(function(e){return '<li'+(e.auto?' class="auto"':'')+'><time>'+fmtTs(e.t)+'</time><span>'+esc(e.text)+'</span></li>'}).join(''):'<li><span class="none">Belum ada catatan.</span></li>';
  }
  var fb=$('#fileBox');
  if(fb){
    var files=modalFiles(),h='';
    if(S.assetsApi){
      h+='<div class="drop" id="dropZone"><label class="btn sm" for="fileIn">Pilih file</label><input type="file" id="fileIn" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.md,.json,.xlsx,.xls,.docx">'
        +'<span>'+(S.uploading?'Mengunggah…':'atau tarik file ke sini. PDF, gambar, CSV, teks, Excel, Word.')+'</span></div>'
        +'<div class="timeinfo">Excel dan Word disimpan sebagai teks isinya. File aslinya tidak ikut tersimpan.</div>';
    }else h+='<div class="timeinfo">Upload lampiran hanya aktif kalau halaman ini dibuka dengan akun pemilik di Claude.</div>';
    h+='<ul class="files">'+files.map(function(f){
      return '<li><div><a href="/_blob/'+esc(f.id)+'" target="_blank" rel="noopener">'+esc(f.name)+'</a><small>'+(f.extracted?'isi teks diekstrak · ':'')+Math.max(1,Math.round((f.size||0)/1024))+' KB</small></div>'
        +'<button class="btn sm" data-act="rmFile" data-fid="'+esc(f.id)+'" type="button">Hapus</button></li>'}).join('')+'</ul>';
    fb.innerHTML=h;
  }
}

/* langkah di dalam modal */
function renderSteps(){
  var box=$('#stepList');if(!box||!S.modal)return;
  var ns=S.modal.steps,has=ns.length>0;
  box.innerHTML=ns.map(function(s,i){
    var meta=[];
    if(s.startedAt)meta.push('mulai '+fmtD(isoDay(s.startedAt)));
    if(s.doneAt)meta.push('selesai '+fmtD(isoDay(s.doneAt)));
    return '<li class="step st-'+s.status+'" data-i="'+i+'">'
      +'<span class="grip" draggable="true" data-i="'+i+'" title="Tarik untuk mengubah urutan" aria-hidden="true">⋮⋮</span>'
      +'<span class="sn mono">'+(i+1)+'</span>'
      +'<div class="scell"><input type="text" class="stitle" data-i="'+i+'" value="'+esc(s.title)+'" aria-label="Langkah '+(i+1)+'">'+(meta.length?'<small>'+meta.join(' · ')+'</small>':'')+'</div>'
      +'<select class="sstat" data-i="'+i+'" aria-label="Status langkah '+(i+1)+'">'+opts(ST,s.status)+'</select>'
      +'<span class="sbtns"><button class="btn sm" data-act="stepUp" data-i="'+i+'" type="button" aria-label="Naikkan"'+(i===0?' disabled':'')+'>↑</button>'
      +'<button class="btn sm" data-act="stepDown" data-i="'+i+'" type="button" aria-label="Turunkan"'+(i===ns.length-1?' disabled':'')+'>↓</button>'
      +'<button class="btn sm" data-act="stepDel" data-i="'+i+'" type="button" aria-label="Hapus langkah">✕</button></span></li>';
  }).join('');
  var f=$('#statusFld'),a=$('#statusAuto');
  if(f)f.hidden=has;
  if(a){a.hidden=!has;if(has)a.textContent='Status task ('+ST[aggStatus(ns)]+') mengikuti status langkah-langkahnya.'}
}
function modalSteps(ns,logs,noRender){
  if(!S.modal)return;
  S.modal.steps=ns;
  if(S.modal.id){var t=byId(S.modal.id);if(t)patch(t.id,stepsPatch(t,ns,logs))}
  if(!noRender)renderSteps();
}
function addSteps(text){
  var lines=String(text).split(/\r?\n/).map(function(l){return l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/,'').trim()}).filter(Boolean);
  if(!lines.length||!S.modal)return;
  var add=lines.map(function(l){return {id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),title:l,status:'todo',startedAt:'',doneAt:''}});
  modalSteps(S.modal.steps.map(copy).concat(add),['Langkah ditambah: '+lines.join(', ')]);
  var inp=$('#stepIn');if(inp){inp.value='';inp.focus()}
}
function moveStep(from,to){
  var ns=S.modal.steps.map(copy);
  if(from<0||to<0||from>=ns.length||to>=ns.length||from===to)return;
  var it=ns.splice(from,1)[0];ns.splice(to,0,it);
  modalSteps(ns,[]);
}

function saveModal(){
  var title=$('#f-title').value.trim();
  if(!title){$('#f-title').focus();toast('Isi judul task dulu',true);return}
  var v={title:title,kind:$('#f-kind').value,priority:$('#f-pri').value,result:$('#f-res').value,planStart:$('#f-start').value,planEnd:$('#f-end').value,
    nextNote:$('#f-nextNote').value.trim(),notes:$('#f-notes').value.trim()};
  if(v.planStart&&v.planEnd&&v.planEnd<v.planStart){toast('Tanggal selesai tidak boleh sebelum tanggal mulai',true);return}
  var now=new Date().toISOString(),ss=S.modal.steps,has=ss.length>0,status=$('#f-status').value;
  if(S.modal.id){
    var old=byId(S.modal.id);if(!old)return;
    var data=Object.assign({},v,{updatedAt:now});
    if(has)Object.assign(data,stepsPatch(old,ss,[]));
    else{
      data.status=status;data.steps=[];
      Object.assign(data,stamps(old.status,old.startedAt,status));
      if(old.status!==status)data.log=(old.log||[]).concat([{t:now,text:'Status: '+ST[status],auto:true}]);
    }
    patch(old.id,data);
  }else{
    var id=newId(),doc=Object.assign(blank(),v,{createdAt:now,updatedAt:now,files:S.modal.files.map(copy)});
    if(has)Object.assign(doc,stepsPatch(doc,ss,[]));
    else Object.assign(doc,{status:status},stamps('','',status));
    doc.log=[{t:now,text:'Task dibuat',auto:true}].concat(!has&&status!=='todo'?[{t:now,text:'Status: '+ST[status],auto:true}]:[]);
    put(id,doc);
  }
  closeModal(true);
  toast('Tersimpan');
}

/* ---------- lampiran ---------- */
var loaded={};
function loadScript(src){
  if(!loaded[src])loaded[src]=new Promise(function(res,rej){
    var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error('Gagal memuat pustaka pembaca file'))};document.head.appendChild(s);
  });
  return loaded[src];
}
var DIRECT={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',csv:'text/csv',txt:'text/plain',md:'text/markdown',json:'application/json'};
async function addFiles(id,list){
  var api=S.assetsApi;if(!api){toast('Upload tidak tersedia di tampilan ini',true);return}
  var added=[];S.uploading=true;refreshExtras();
  for(var i=0;i<list.length;i++){
    var f=list[i],ext=(f.name.split('.').pop()||'').toLowerCase();
    try{
      var blob,type,extracted=false;
      if(DIRECT[ext]){blob=f;type=DIRECT[ext]}
      else if(ext==='xlsx'||ext==='xls'||ext==='xlsm'){
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        var wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
        var txt=wb.SheetNames.map(function(n){return '## '+n+'\n'+XLSX.utils.sheet_to_csv(wb.Sheets[n])}).join('\n\n');
        blob=new Blob([txt],{type:'text/plain'});type='text/plain';extracted=true;
      }else if(ext==='docx'){
        await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
        var r=await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()});
        blob=new Blob([r.value],{type:'text/plain'});type='text/plain';extracted=true;
      }else{toast(f.name+': format ini belum didukung (pakai PDF, gambar, CSV, teks, Excel, atau Word .docx)',true);continue}
      if(!blob.size){toast(f.name+': file kosong',true);continue}
      var res=await api.upload(blob,{type:type});
      added.push({id:res.id,name:f.name,ctype:res.contentType,size:f.size,extracted:extracted});
    }catch(e){toast(f.name+': '+((e&&e.message)||'gagal diunggah'),true)}
  }
  S.uploading=false;
  if(added.length){
    if(id){
      var t=byId(id);
      if(t){
        var now=new Date().toISOString();
        await patch(id,{files:(t.files||[]).concat(added),updatedAt:now,
          log:(t.log||[]).concat([{t:now,text:'Lampiran: '+added.map(function(a){return a.name}).join(', '),auto:true}])});
      }
    }else if(S.modal&&!S.modal.id){S.modal.files=S.modal.files.concat(added)}
    else added.forEach(function(a){api.delete(a.id).catch(function(){})});
    toast(added.length+' lampiran ditambahkan');
  }
  refreshExtras();
}
async function removeFile(id,fid){
  if(id){
    var t=byId(id);if(!t)return;
    await patch(id,{files:(t.files||[]).filter(function(f){return f.id!==fid}),updatedAt:new Date().toISOString()});
  }else if(S.modal){S.modal.files=S.modal.files.filter(function(f){return f.id!==fid});refreshExtras()}
  try{if(S.assetsApi)await S.assetsApi.delete(fid)}catch(e){}
}

/* ---------- event ---------- */
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]');if(!el)return;
  var a=el.dataset.act,id=el.dataset.id,i=Number(el.dataset.i);
  switch(a){
    case 'tab':location.hash=el.dataset.v;break;
    case 'newTask':openModal(null);break;
    case 'newOnDay':openModal(null,{planStart:S.sel,planEnd:S.sel});break;
    case 'open':openModal(id);break;
    case 'status':setStatus(id,el.dataset.to);break;
    case 'stepStatus':changeStep(id,el.dataset.sid,el.dataset.to);break;
    case 'filter':S.filter=el.dataset.f;render();break;
    case 'goFilter':S.filter=el.dataset.f;location.hash='daftar';break;
    case 'calPrev':S.cal=new Date(S.cal.getFullYear(),S.cal.getMonth()-1,1);render();break;
    case 'calNext':S.cal=new Date(S.cal.getFullYear(),S.cal.getMonth()+1,1);render();break;
    case 'calToday':var n=new Date();S.cal=new Date(n.getFullYear(),n.getMonth(),1);S.sel=today();render();break;
    case 'selDay':S.sel=el.dataset.d;var d=parse(S.sel);S.cal=new Date(d.getFullYear(),d.getMonth(),1);render();break;
    case 'overlay':if(e.target===el)closeModal();break;
    case 'closeModal':closeModal();break;
    case 'saveTask':saveModal();break;
    case 'addStep':var si=$('#stepIn');if(si)addSteps(si.value);break;
    case 'stepUp':moveStep(i,i-1);break;
    case 'stepDown':moveStep(i,i+1);break;
    case 'stepDel':
      if(S.modal){var ns=S.modal.steps.map(copy),gone=ns.splice(i,1)[0];if(gone)modalSteps(ns,['Langkah dihapus: '+gone.title])}
      break;
    case 'delTask':
      if(!el.classList.contains('armed')){el.classList.add('armed');el.textContent='Klik lagi untuk hapus';setTimeout(function(){if(el.isConnected){el.classList.remove('armed');el.textContent='Hapus task'}},4000)}
      else{var tid=S.modal&&S.modal.id;closeModal(true);if(tid){var tt=byId(tid);del(tid);if(tt&&S.assetsApi)(tt.files||[]).forEach(function(f){S.assetsApi.delete(f.id).catch(function(){})});toast('Task dihapus')}}
      break;
    case 'addLog':addLog();break;
    case 'rmFile':if(S.modal)removeFile(S.modal.id,el.dataset.fid);break;
    case 'clearExamples':S.tasks.filter(function(t){return t.example}).forEach(function(t){del(t.id)});break;
  }
});
function addLog(){
  var inp=$('#logIn');if(!inp||!S.modal||!S.modal.id)return;
  var text=inp.value.trim();if(!text)return;
  var t=byId(S.modal.id);if(!t)return;
  var now=new Date().toISOString();
  inp.value='';
  patch(t.id,{log:(t.log||[]).concat([{t:now,text:text}]),updatedAt:now});
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&S.modal){closeModal();return}
  if(e.key==='Enter'){
    if(e.target&&e.target.id==='logIn'){e.preventDefault();addLog();return}
    if(e.target&&e.target.id==='stepIn'){e.preventDefault();addSteps(e.target.value);return}
    var r=e.target&&e.target.closest&&e.target.closest('[data-act="open"][role="button"]');
    if(r&&e.target===r){e.preventDefault();openModal(r.dataset.id)}
  }
});
document.addEventListener('paste',function(e){
  if(e.target&&e.target.id==='stepIn'){
    var tx=((e.clipboardData||window.clipboardData).getData('text')||'');
    if(/\n/.test(tx.trim())){e.preventDefault();addSteps(tx)}
  }
});
document.addEventListener('input',function(e){
  if(e.target.id==='q'){S.q=e.target.value;var lb=$('#listBody');if(lb)lb.innerHTML=listBody()}
});
document.addEventListener('change',function(e){
  var el=e.target,cl=el.classList;
  if(el.id==='sortSel'||el.id==='resSel'){
    if(el.id==='sortSel')S.sort=el.value;else S.res=el.value;
    var lbx=$('#listBody');if(lbx)lbx.innerHTML=listBody();return;
  }
  if(el.id==='fileIn'&&S.modal){var fl=Array.prototype.slice.call(el.files);el.value='';if(fl.length)addFiles(S.modal.id,fl);return}
  if(!S.modal||!cl)return;
  var i=Number(el.dataset.i),ns=S.modal.steps.map(copy),s=ns[i];
  if(!s)return;
  if(cl.contains('sstat')&&s.status!==el.value){ns[i]=stepTo(s,el.value);modalSteps(ns,['Langkah "'+s.title+'": '+ST[el.value]])}
  else if(cl.contains('stitle')){
    var v=el.value.trim();
    if(!v){el.value=s.title;return}
    if(v!==s.title){ns[i].title=v;modalSteps(ns,[],true)}
  }
});
/* tarik-lepas: file ke zona lampiran, dan urutan langkah */
document.addEventListener('dragstart',function(e){
  var g=e.target.closest&&e.target.closest('.grip');
  if(g){S.drag=Number(g.dataset.i);e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(S.drag));e.dataTransfer.setDragImage(g.closest('.step'),12,12)}catch(x){}}
});
document.addEventListener('dragover',function(e){
  var z=e.target.closest&&e.target.closest('#dropZone');
  if(z){e.preventDefault();z.classList.add('over');return}
  var st=e.target.closest&&e.target.closest('.step');
  if(st&&S.drag>=0){e.preventDefault();st.classList.add('over')}
});
document.addEventListener('dragleave',function(e){
  var z=e.target.closest&&e.target.closest('#dropZone');if(z)z.classList.remove('over');
  var st=e.target.closest&&e.target.closest('.step');if(st)st.classList.remove('over');
});
document.addEventListener('dragend',function(){S.drag=-1;var o=document.querySelectorAll('.step.over');for(var k=0;k<o.length;k++)o[k].classList.remove('over')});
document.addEventListener('drop',function(e){
  var z=e.target.closest&&e.target.closest('#dropZone');
  if(z){e.preventDefault();z.classList.remove('over');if(S.modal&&e.dataTransfer)addFiles(S.modal.id,Array.prototype.slice.call(e.dataTransfer.files));return}
  var st=e.target.closest&&e.target.closest('.step');
  if(st&&S.drag>=0){e.preventDefault();var from=S.drag;S.drag=-1;moveStep(from,Number(st.dataset.i))}
});
function viewFromHash(){var h=location.hash.slice(1);return VIEWS[h]||'home'}
window.addEventListener('hashchange',function(){S.view=viewFromHash();render()});

/* ---------- mulai ---------- */
async function init(){
  $('#todayLbl').textContent=fmtLong(today());
  S.view=viewFromHash();
  render();
  var timer=setTimeout(function(){if(!S.ready){S.slow=true;render()}},10000);
  var db=null;
  try{db=window.claude&&await window.claude.use('db')}catch(e){db=null}
  try{S.assetsApi=window.claude&&await window.claude.use('assets')}catch(e){S.assetsApi=null}
  if(db){
    col=db.collection('tasks');S.mode='cloud';
    col.onSnapshot(function(snap){
      if(!snap.metadata.fromCache){clearTimeout(timer);S.slow=false}
      S.ready=true;
      S.tasks=snap.docs.map(function(d){return Object.assign({id:d.id},d.data())});
      S.err=null;render();
    },function(err){clearTimeout(timer);S.err=err;S.ready=true;render()});
  }else{
    clearTimeout(timer);S.mode='local';S.tasks=localLoad();S.ready=true;render();
  }
}
init();
})();
