import {connect,isLocal,isPreview} from './firebase.js';
const $=s=>document.querySelector(s),app=$('#app'),dialog=$('#editor'),form=$('#edit-form');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={star:'✦',heart:'♡',flower:'✿',clover:'♧','':''};
const state={user:null,profile:null,rooms:null,room:null,items:[],configured:false,route:'',error:null};
let api=null,subscriptions=[],editor=null,toastTimer,creating=false,createRequest=null,routeGeneration=0;
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function message(e){const codes={'auth/popup-closed-by-user':'로그인이 취소됐어요. 다시 시작할 수 있어요.','auth/popup-blocked':'로그인 창이 차단됐어요. 팝업을 허용한 뒤 다시 눌러 주세요.','auth/unauthorized-domain':'로그인 연결을 준비 중이에요. 잠시 후 다시 방문해 주세요.','auth/network-request-failed':'인터넷 연결을 확인해 주세요.','functions/unavailable':'연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.','permission-denied':'이 다이어리에 접근할 수 없어요.'};return codes[e?.code]??e?.message??'잠시 후 다시 시도해 주세요.';}
function go(path){location.hash=path;}
function stop(){subscriptions.forEach(fn=>fn());subscriptions=[];}
const header=()=>`<header class="site-header"><a class="brand" href="#/rooms"><span class="brand-icon">27</span>우리의 2027</a>${state.user?`<div class="header-actions"><span class="user-chip">${escape(state.profile?.nickname??'새로운 친구')} 님</span><button class="text-btn" data-action="logout">로그아웃</button></div>`:'<span class="header-note">너와 나의, 다음 페이지</span>'}</header>`;
const footer=()=>'<footer class="site-footer"><span>OUR LITTLE YEAR · 2027</span><span class="footer-hand">서두르지 않아도 좋아, 함께 채워 가자.</span><span>MADE FOR TWO ♡</span></footer>';
function shell(content){app.innerHTML=(isPreview?'<div class="preview-banner">로컬 미리보기 · 실제 계정과 연결되지 않으며 새로고침하면 초기화돼요.<button data-action="exit-preview">미리보기 끝내기</button></div>':'')+header()+content+footer();app.setAttribute('aria-busy','false');}
function login(){shell(`<main id="main" class="login-wrap"><div class="cover" aria-hidden="true"><div class="cover-top"><span>OUR LITTLE YEAR</span><div class="cover-stamp"><div>✿<small>GOOD THINGS<br>ARE COMING</small></div></div></div><h2>우리의 작은 약속들</h2><div class="year">2027</div><p class="hand">하고 싶은 일도, 되고 싶은 나도.<br>여기에 하나씩 모아 두자.</p><div class="cover-bottom"><span>JAN — DEC</span><span>365 DAYS OF POSSIBILITIES</span></div><span class="flower-sticker">✿</span><div class="little-note"><span class="tape"></span>올해도 잘 부탁해 ♡</div></div><section class="login-copy"><span class="eyebrow">A NEW YEAR, A SHARED DIARY</span><h1>너와 나의 다음 해를<br><em>한 장씩, 함께.</em></h1><p class="intro">작은 목표부터 언젠가 꼭 해 보고 싶은 일까지.<br>친구와 나란히 앉아, 우리의 2027년을 그려 봐요.</p><div class="login-card"><span class="tape"></span><button class="btn google-btn" data-action="login" ${!state.configured?'disabled':''}><svg class="google-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.6-.1-2.7-.4-3.9H24v7.4h11.3c-.2 1.9-1.5 4.8-4.3 6.7l6.6 5.1c3.9-3.6 6-8.9 6-15.3z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.3-4.1 2.2-6.9 2.2-5.3 0-9.9-3.5-11.5-8.4l-6.8 5.3C9.1 39.5 16 44 24 44z"/><path fill="#FBBC05" d="M12.5 27.8a12 12 0 0 1 0-7.6l-6.8-5.3a20 20 0 0 0 0 18.2z"/><path fill="#EA4335" d="M24 11.8c3.7 0 6.1 1.6 7.5 2.9l5.8-5.7C33.8 5.7 29.4 4 24 4 16 4 9.1 8.5 5.7 14.9l6.8 5.3c1.6-4.9 6.2-8.4 11.5-8.4z"/></svg>Google로 시작하기</button><p class="small">처음이라면 로그인 후 별명만 정해 주세요.</p>${!state.configured?'<p class="notice">다이어리를 준비하고 있어요.<br>로그인 연결이 끝나면 이곳에서 시작할 수 있어요.</p>':''}<p id="login-error" class="error" role="alert"></p><p class="privacy-note">함께하는 친구에게는 별명만 보여요.<br>기록은 같은 방의 두 사람만 읽을 수 있어요.</p></div><div class="login-footer"><span class="arrow">↳</span><span>큰 꿈이 아니어도 괜찮아!</span></div>${isLocal?'<button class="text-btn" data-action="preview">로컬 디자인 미리보기</button>':''}</section></main>`);}
function profile(){shell(`<main id="main" class="center-page"><form id="profile-form" class="form-paper"><span class="tape"></span><span class="eyebrow">NICE TO MEET YOU</span><h1>어떤 이름으로<br>기록할까요?</h1><p>친구에게 보여 줄 별명을 정해 주세요.<br>우리만의 다이어리니까, 편한 이름이면 충분해요.</p><label class="field">나의 별명<input name="nickname" maxlength="12" placeholder="1~12자, 편하게 불러 줄 이름" required autocomplete="nickname"></label><p class="error" id="profile-error" role="alert"></p><button class="btn primary">우리의 2027 시작하기 ↗</button><button type="button" class="back-btn text-btn" data-action="logout">로그인으로 돌아가기</button></form></main>`);}
function rooms(){shell(`<main id="main" class="page"><div class="page-heading"><div><span class="eyebrow">MY LITTLE COLLECTION</span><h1>${escape(state.profile.nickname)}님의 다이어리</h1><p>함께 꿈꾸는 한 해, 여기서 이어가요.</p></div><div class="actions"><button class="btn secondary" data-action="join">초대코드로 참여</button><button class="btn primary" data-action="create" ${creating?'disabled':''}>＋ 다이어리 만들기</button></div></div>${state.error?`<p class="notice" role="alert">${escape(message(state.error))}</p><button class="btn secondary" data-action="reload">다시 불러오기</button>`:state.rooms===null?'<p class="loading">다이어리를 꺼내고 있어요…</p>':state.rooms.length?`<div class="rooms-grid">${state.rooms.map(r=>`<button class="room-card" data-room="${escape(r.id)}"><span class="tape"></span><span class="eyebrow">OUR LITTLE YEAR · 2027</span><h2>${escape(r.title)}</h2><p>${r.members.length===2?escape(r.members.find(m=>m.uid!==state.user.uid)?.nickname)+'님과 함께':'아직 쓰이지 않은, 친구의 한 페이지'}</p><div class="room-card-bottom"><span class="count-tag">${r.members.length} / 2명</span><span>펼쳐 보기 ↗</span></div></button>`).join('')}</div>`:'<div class="empty-state"><span class="tape"></span><div class="empty-icon">✧</div><h2>첫 페이지를 열어 볼까요?</h2><p>새 다이어리를 만들고 친구 한 명을 초대해 보세요.<br>이미 초대받았다면 초대코드로 참여하면 돼요.</p><button class="btn primary" data-action="create">첫 다이어리 만들기 ↗</button></div>'}</main>`);}
function join(){shell('<main id="main" class="center-page"><form id="join-form" class="form-paper"><span class="tape"></span><span class="eyebrow">AN INVITATION FOR YOU</span><h1>친구의 초대가<br>도착했나요?</h1><p>친구에게 받은 6자리 초대코드를 적어 주세요.<br>같은 다이어리에 우리의 페이지가 생겨요.</p><label class="field">초대코드<input class="code-input" name="code" minlength="6" maxlength="6" pattern="[A-Za-z0-9]{6}" placeholder="ABC123" required autocomplete="off" autocapitalize="characters" spellcheck="false"></label><p class="error" id="join-error" role="alert"></p><button class="btn primary">함께 쓰러 가기 ↗</button><button type="button" class="back-btn text-btn" data-action="rooms">← 내 다이어리로</button></form></main>');}
function card(item,mine){return `<article class="note ${item.color} ${item.done?'done':''}"><span class="note-sticker" aria-hidden="true">${symbols[item.sticker]??''}</span><div class="note-top">${mine?`<button class="check-btn" data-toggle="${escape(item.id)}" aria-label="${escape(item.title)} ${item.done?'완료 취소':'완료 표시'}" aria-pressed="${item.done}">${item.done?'✓':''}</button>`:`<span class="check-display" aria-label="${item.done?'완료':'진행 중'}">${item.done?'✓':''}</span>`}<h4>${escape(item.title)}</h4></div>${item.note?`<p>${escape(item.note)}</p>`:''}<div class="note-bottom"><span>${item.done?'작은 약속 하나, 이루었어요':'2027 · 조금씩, 나의 속도로'}</span>${mine?`<button data-edit="${escape(item.id)}">수정</button>`:'<span>친구의 기록</span>'}</div></article>`;}
function diaryPage(member,mine){
 const items=state.items.filter(i=>i.ownerId===member?.uid),done=items.filter(i=>i.done).length;
 return `<section class="diary-page ${mine?'mine':'friend'}" id="${mine?'my-page':'friend-page'}"><div class="page-top"><div><span class="eyebrow">${mine?'MY SIDE OF THE STORY':'YOUR SIDE OF THE STORY'}</span><h2>${member?escape(member.nickname):'친구의 페이지'}</h2></div><span class="page-label">${mine?'나의 작은 약속':'너의 꿈을 응원해'}</span></div>${member?`<div class="progress-row"><span>${done}개의 약속을 이루었어요</span><div class="progress-line" aria-hidden="true"><span style="width:${items.length?Math.round(done/items.length*100):0}%"></span></div><span>${done} / ${items.length}</span></div>${['goal','bucket'].map(kind=>`<div class="section-title"><h3>${kind==='goal'?'올해의 목표':'버킷리스트'}<span>${kind==='goal'?'GROW A LITTLE':'DREAM A LITTLE'}</span></h3>${mine?`<button data-new="${kind}" aria-label="${kind==='goal'?'목표':'버킷리스트'} 추가">＋ 추가</button>`:''}</div>${items.filter(i=>i.kind===kind).map(i=>card(i,mine)).join('')||`<p class="empty-line">${mine?'아직 비어 있는 한 줄, 천천히 채워 봐요.':'친구의 새로운 이야기를 기다리고 있어요.'}</p>`}`).join('')}`:'<div class="friend-wait"><div class="postage" aria-hidden="true">♡</div><h3>여기는 친구의 2027이<br>채워질 자리예요.</h3><p>초대코드를 건네고<br>우리의 다음 페이지를 함께 열어요.</p></div>'}${mine?'<button class="jump-friend" data-action="friend">친구 페이지로 내려가기 ↓</button>':''}</section>`;
}
function room(){
 const r=state.room;
 if(state.error){shell(`<main class="page" id="main"><p class="notice">${escape(message(state.error))}</p><button class="btn secondary" data-action="rooms">내 다이어리로</button></main>`);return;}
 if(!r){shell('<main class="loading" id="main">다이어리를 펼치고 있어요…</main>');return;}
 const me=r.members.find(m=>m.uid===state.user.uid),friend=r.members.find(m=>m.uid!==state.user.uid),waiting=r.members.length<2;
 shell(`<main id="main" class="room-page"><div class="room-toolbar"><button class="text-btn" data-action="rooms">← 내 다이어리</button><h1>${escape(r.title)}</h1><span class="connection">${isPreview?'미리보기 · 저장되지 않아요':navigator.onLine?'연결됨 · 변경 내용을 함께 보고 있어요':'연결 끊김 · 저장을 기다리고 있어요'}</span></div>${waiting?`<div class="invite-strip"><span>한 사람을 위한 초대장 · ${r.inviteExpiresAt>Date.now()?'24시간 안에 친구에게 건네 주세요':'초대코드가 만료됐어요'}</span><div><strong>${escape(r.inviteCode)}</strong><button data-action="copy">복사</button><button data-action="renew">새 코드</button></div></div>`:''}<div class="book">${diaryPage(me,true)}${diaryPage(friend,false)}</div></main>`);
}
function render(){if(!state.user){login();return;}if(state.error&&!state.profile){shell(`<main class="page" id="main"><p class="notice">${escape(message(state.error))}</p><button class="btn secondary" data-action="reload">다시 불러오기</button></main>`);return;}if(!state.profile){profile();return;}const r=location.hash.slice(1);if(r==='/join')join();else if(r.startsWith('/rooms/'))room();else rooms();}
function route(){
 if(editor){history.replaceState(null,'','#'+state.route);return;}
 stop();const gen=++routeGeneration;state.route=location.hash.slice(1)||'/rooms';state.room=null;state.items=[];
 if(!api||!state.user||!state.profile){render();return;}
 state.error=null;
 const onError=e=>{if(gen===routeGeneration){state.error=e;render();}};
 if(state.route.startsWith('/rooms/')) {
   const roomId=state.route.slice(7);
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(roomId)){state.error=Error('잘못된 다이어리 주소예요.');render();return;}
   subscriptions.push(api.watchRoom(roomId,r=>{if(gen!==routeGeneration)return;if(!r){onError(Error('다이어리를 찾을 수 없어요.'));return;}state.room=r;render();},onError));
   subscriptions.push(api.watchItems(roomId,items=>{if(gen!==routeGeneration)return;state.items=items;render();},onError));
 }else if(state.route!=='/join'){
   state.rooms=null;subscriptions.push(api.watchRooms(state.user.uid,rs=>{if(gen!==routeGeneration)return;state.rooms=rs;render();},onError));
 }
 render();
}

function fillEditor(item){
 for(const key of ['title','note'])form.elements[key].value=item[key]??'';
 for(const key of ['kind','color','sticker'])form.elements[key].value=item[key]??({kind:'goal',color:'paper',sticker:''}[key]);
}
function readEditor(){return {title:form.elements.title.value.trim(),note:form.elements.note.value.trim(),kind:form.elements.kind.value,color:form.elements.color.value,sticker:form.elements.sticker.value,done:editor.done};}
function status(text,error=false){$('#save-status').textContent=text;$('#save-status').classList.toggle('error',error);}
function openEditor(item,kind='goal'){
 editor={id:item?.id??crypto.randomUUID(),roomId:state.room.id,version:item?.version??0,done:item?.done??false,revision:0,savedRevision:0,busy:false,request:null,conflict:false,timer:null,maxTimer:null,error:null,composing:false};
 fillEditor(item??{kind,color:kind==='bucket'?'pink':'paper',sticker:'',title:'',note:''});
 $('#conflict').hidden=true;$('#retry-save').hidden=true;
 $('[data-action="delete-item"]').hidden=!item;
 status(item?'저장된 기록이에요.':'제목을 적으면 자동으로 저장돼요.');
 dialog.showModal();form.elements.title.focus();
}
function changed(){
 if(!editor)return;editor.revision++;editor.error=null;
 clearTimeout(editor.timer);status(navigator.onLine?'입력 중…':'연결이 끊겼어요. 아직 저장되지 않았어요.');
 if(editor.composing)return;
 editor.timer=setTimeout(saveEditor,500);editor.maxTimer??=setTimeout(saveEditor,2000);
}
async function saveEditor(){
 const e=editor;if(!e||e.busy||e.conflict||e.composing)return false;
 clearTimeout(e.timer);clearTimeout(e.maxTimer);e.maxTimer=null;
 if(e.savedRevision===e.revision&&!e.request)return true;
 if(!form.elements.title.value.trim()){status('제목을 적으면 저장할 수 있어요.',true);return false;}
 if(!navigator.onLine){status('연결이 끊겼어요. 이 창을 닫지 말고 잠시 기다려 주세요.',true);$('#retry-save').hidden=false;return false;}
 e.busy=true;status('저장 중…');
 e.request??={revision:e.revision,payload:{roomId:e.roomId,itemId:e.id,version:e.version,mutationId:crypto.randomUUID(),item:readEditor()}};
 try {
   const saved=await api.call('saveItem',e.request.payload);e.version=saved.version;e.savedRevision=e.request.revision;e.request=null;e.error=null;
   status(isPreview?'미리보기 화면에 반영했어요. 실제로 저장되지는 않아요.':'저장됨 · 친구에게도 보여요.');$('#retry-save').hidden=true;$('[data-action="delete-item"]').hidden=false;
 }catch(error){
   e.error=error;status(message(error),true);$('#retry-save').hidden=false;
   if(error.code==='functions/aborted'){
     e.conflict=true;$('#retry-save').hidden=true;
     try{e.latest=await api.getItem(e.roomId,e.id);$('#latest-content').textContent=e.latest&&!e.latest.deleted?e.latest.title+'\n'+e.latest.note:'이 기록은 삭제되었어요.';$('#conflict').hidden=false;$('[data-action="keep-draft"]').textContent=e.latest&&!e.latest.deleted?'내 초안으로 저장':'새 기록으로 저장';}
     catch{status('최신 내용을 가져오지 못했어요. 연결 후 다시 저장해 주세요.',true);e.conflict=false;$('#retry-save').hidden=false;}
   }
 }finally{e.busy=false;}
 if(!e.error&&e.revision>e.savedRevision)return saveEditor();
 return !e.error;
}
async function closeEditor(discard=false){
 const e=editor;if(!e)return;
 if(e.busy){notify('저장이 끝나면 다시 닫아 주세요.');return;}
 if(!discard&&e.revision>e.savedRevision){
   const ok=await saveEditor();
   if(!ok){if(!await confirmAction('저장되지 않은 내용을 닫을까요?','아직 저장되지 않은 변경 내용이 사라져요.'))return;}
 }
 clearTimeout(e.timer);clearTimeout(e.maxTimer);editor=null;dialog.close();
}
function confirmAction(title,content){
 const d=$('#confirm');$('#confirm-title').textContent=title;$('#confirm-text').textContent=content;d.showModal();
 return new Promise(resolve=>{
  const click=e=>{const b=e.target.closest('[data-confirm]');if(b)end(b.dataset.confirm==='true');};
  const cancel=e=>{e.preventDefault();end(false);};
  function end(v){d.removeEventListener('click',click);d.removeEventListener('cancel',cancel);d.close();resolve(v);}
  d.addEventListener('click',click);d.addEventListener('cancel',cancel);
 });
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 const action=button.dataset.action;
 try {
   if(button.dataset.room){go('/rooms/'+button.dataset.room);return;}
   if(button.dataset.new){openEditor(null,button.dataset.new);return;}
   if(button.dataset.edit){const i=state.items.find(x=>x.id===button.dataset.edit);if(i?.ownerId===state.user.uid)openEditor(i);return;}
   if(button.dataset.toggle){
     const item=state.items.find(x=>x.id===button.dataset.toggle);if(!item||item.ownerId!==state.user.uid)return;
     button.disabled=true;
     try{await api.call('saveItem',{roomId:state.room.id,itemId:item.id,version:item.version,mutationId:crypto.randomUUID(),item:{...item,done:!item.done}});}
     finally{button.disabled=false;}return;
   }
   if(action==='login'){button.disabled=true;try{await api.login();}catch(e){$('#login-error').textContent=message(e);}finally{button.disabled=false;}}
   if(action==='preview')location.href=location.pathname+'?preview=1#/rooms/preview-room';
   if(action==='exit-preview')location.href=location.pathname;
   if(action==='logout'){stop();await api.logout();}
   if(action==='rooms')go('/rooms');
   if(action==='join')go('/join');
   if(action==='reload')location.reload();
   if(action==='friend')$('#friend-page').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
   if(action==='copy'){await navigator.clipboard.writeText(state.room.inviteCode);notify('초대코드를 복사했어요. 친구에게 건네 주세요.');}
   if(action==='renew'){button.disabled=true;try{await api.call('renewInvite',{roomId:state.room.id});notify('새 초대코드를 만들었어요. 이전 코드는 사용할 수 없어요.');}finally{button.disabled=false;}}
   if(action==='create'){
     if(creating)return;creating=true;button.disabled=true;createRequest??=crypto.randomUUID();
     try{const r=await api.call('createRoom',{requestId:createRequest});createRequest=null;go('/rooms/'+r.roomId);}
     finally{creating=false;button.disabled=false;}
   }
   if(action==='close-editor')await closeEditor();
   if(action==='retry-save')await saveEditor();
   if(action==='delete-item'){
     if(!editor||editor.busy)return;
     clearTimeout(editor.timer);clearTimeout(editor.maxTimer);
     editor.composing=true;
     const accepted=await confirmAction('이 기록을 지울까요?','이 기록은 친구의 페이지에서도 사라져요. 삭제 후에는 되돌릴 수 없어요.');
     editor.composing=false;
     if(!accepted){if(editor.revision>editor.savedRevision)saveEditor();return;}
     editor.busy=true;
     try{await api.call('deleteItem',{roomId:editor.roomId,itemId:editor.id,version:editor.version,mutationId:crypto.randomUUID()});editor.busy=false;await closeEditor(true);notify('기록을 지웠어요.');}
     catch(e){editor.busy=false;status(message(e),true);}
   }
   if(action==='use-latest'){
     if(!editor.latest||editor.latest.deleted){await closeEditor(true);return;}
     fillEditor(editor.latest);editor.version=editor.latest.version;editor.done=editor.latest.done;editor.request=null;editor.conflict=false;editor.error=null;editor.savedRevision=editor.revision;$('#conflict').hidden=true;status('최신 내용을 불러왔어요.');
   }
   if(action==='keep-draft'){
     if(!editor.latest||editor.latest.deleted){editor.id=crypto.randomUUID();editor.version=0;}else editor.version=editor.latest.version;
     editor.request=null;editor.conflict=false;editor.error=null;$('#conflict').hidden=true;await saveEditor();
   }
 }catch(error){notify(message(error));}
});
document.addEventListener('submit',async event=>{
 const f=event.target;event.preventDefault();
 if(f===form){await closeEditor();return;}
 const button=f.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
 try {
   if(f.id==='profile-form'){state.profile=await api.call('profile',{nickname:f.elements.nickname.value});go('/rooms');route();}
   if(f.id==='join-form'){const r=await api.call('joinRoom',{code:f.elements.code.value.trim().toUpperCase()});go('/rooms/'+r.roomId);}
 }catch(e){const err=f.querySelector('.error');if(err)err.textContent=message(e);}
 finally{if(button)button.disabled=false;}
});
form.addEventListener('input',changed);
form.addEventListener('compositionstart',()=>{if(editor)editor.composing=true;});
form.addEventListener('compositionend',()=>{if(editor){editor.composing=false;changed();}});
dialog.addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
window.addEventListener('hashchange',route);
window.addEventListener('beforeunload',e=>{if(editor&&(editor.busy||editor.revision>editor.savedRevision)){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>{if(editor)saveEditor();render();});
window.addEventListener('offline',()=>{if(editor)status('연결이 끊겼어요. 이 창을 닫지 말고 잠시 기다려 주세요.',true);render();});
app.addEventListener('input',event=>{if(event.target.name==='code')event.target.value=event.target.value.toUpperCase().replace(/\s/g,'');});
try {
 api=await connect(session=>{
   if(state.user?.uid!==session.user?.uid&&editor){clearTimeout(editor.timer);clearTimeout(editor.maxTimer);editor=null;dialog.close();}
   Object.assign(state,session);queueMicrotask(route);
 });
 route();
}catch(error){state.configured=false;login();$('#login-error').textContent='로그인 연결을 불러오지 못했어요. 새로고침해 주세요.';}
