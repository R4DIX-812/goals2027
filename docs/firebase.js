import {createStore, readRoom} from './store.js?v=20261116-rename';
import {config} from './config.js';
export const isLocal=['localhost','127.0.0.1'].includes(location.hostname);
export const isPreview=isLocal && new URLSearchParams(location.search).get('preview')==='1';
export async function connect(onSession) {
  if(isPreview) return preview(onSession);
  if(!config.firebase?.apiKey) {onSession({user:null,profile:null,configured:false});return {configured:false};}
  const v='13.3.0', base='https://www.gstatic.com/firebasejs/'+v+'/firebase-';
  const [A,U,D]=await Promise.all([import(base+'app.js'),import(base+'auth.js'),import(base+'firestore.js')]);
  const app = A.initializeApp(config.firebase);
  // Keep the auth session in localStorage. The OAuth popup can hide this page
  // while Firebase is saving the session, which can close IndexedDB in webviews.
  const auth = U.initializeAuth(app, {
    persistence: U.browserLocalPersistence,
    popupRedirectResolver: U.browserPopupRedirectResolver,
  });
  const db = D.getFirestore(app);
  const call=createStore(db,D,()=>auth.currentUser?.uid);
  let generation=0;
  U.onAuthStateChanged(auth,async user=>{
    const g=++generation;
    if(!user){onSession({user:null,profile:null,configured:true});return;}
    try {
      const p=await D.getDoc(D.doc(db,'profiles',user.uid));
      if(g===generation) onSession({user:{uid:user.uid},profile:p.exists()?p.data():null,configured:true});
    }catch(error){if(g===generation)onSession({user:{uid:user.uid},profile:null,configured:true,error});}
  });
  return {
    configured:true,
    async login(){const provider=new U.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await U.signInWithPopup(auth,provider);},
    logout:()=>U.signOut(auth),
    call,
    watchRooms(uid,next,error){return D.onSnapshot(D.query(D.collection(db,'rooms'),D.where('memberIds','array-contains',uid)),s=>next(s.docs.map(readRoom).sort((a,b)=>b.createdAt-a.createdAt)),error);},
    watchRoom(roomId,next,error){return D.onSnapshot(D.doc(db,'rooms',roomId),s=>next(readRoom(s)),error);},
    watchItems(roomId,next,error){return D.onSnapshot(D.collection(db,'rooms',roomId,'items'),s=>next(s.docs.map(d=>({id:d.id,...d.data()})).filter(d=>!d.deleted).sort((a,b)=>(a.createdAt?.toMillis()??0)-(b.createdAt?.toMillis()??0))),error);},
    async getItem(roomId,itemId){const s=await D.getDocFromServer(D.doc(db,'rooms',roomId,'items',itemId));return s.exists()?s.data():null;}
  };
}
function preview(onSession) {
  const uid='preview-user',friend='preview-friend';
  let profile={nickname:'나'}, room={id:'preview-room',title:'2027 버킷리스트',year:2027,creatorId:uid,memberIds:[uid,friend],members:[{uid,nickname:'나'},{uid:friend,nickname:'소연'}],createdAt:Date.now()};
  let items=[
    {id:'sample-001',ownerId:uid,kind:'goal',title:'나에게 다정한 하루를 보내기',note:'매일 밤, 오늘 좋았던 일 하나씩 적어 두기.',color:'paper',sticker:'flower',done:false,version:1,createdAt:1},
    {id:'sample-002',ownerId:uid,kind:'goal',title:'한 달에 한 권, 책 읽기',note:'속도보다 꾸준함. 좋아하는 문장도 모아 보자.',color:'green',sticker:'clover',done:true,version:1,createdAt:2},
    {id:'sample-003',ownerId:uid,kind:'bucket',title:'우리 같이, 바다 보러 가자!',note:'아무 계획 없이 걸어도 좋은 여행.',color:'pink',sticker:'star',done:false,version:1,createdAt:3},
    {id:'sample-004',ownerId:friend,kind:'goal',title:'작은 용기를 자주 내기',note:'처음 해 보는 일, 한 달에 하나씩.',color:'green',sticker:'star',done:false,version:1,createdAt:4},
    {id:'sample-005',ownerId:friend,kind:'bucket',title:'봄날의 피크닉',note:'김밥, 돗자리, 그리고 좋아하는 노래.',color:'paper',sticker:'flower',done:false,version:1,createdAt:5},
    {id:'sample-006',ownerId:friend,kind:'bucket',title:'필름 카메라로 일 년 기록하기',note:'2027년 마지막 날에 함께 펼쳐 보기.',color:'pink',sticker:'star',done:false,version:1,createdAt:6}
  ];
  const watchers={rooms:null,room:null,items:null};
  const emit=()=>{watchers.rooms?.([structuredClone(room)]);watchers.room?.(structuredClone(room));watchers.items?.(structuredClone(items.filter(x=>!x.deleted)));};
  queueMicrotask(()=>onSession({user:{uid},profile,configured:true}));
  return {configured:true,login:async()=>{},logout:async()=>{location.href=location.pathname;},
    async call(action,d={}){
      if(action==='profile'){profile={nickname:d.nickname};return profile;}
      if(action==='createRoom'){room={id:crypto.randomUUID(),title:profile.nickname+'의 2027 다이어리',memberIds:[uid],members:[{uid,nickname:profile.nickname}],creatorId:uid,inviteCode:'DEMO27',inviteExpiresAt:Date.now()+86400000,createdAt:Date.now()};items=[];emit();return {roomId:room.id};}
      if(action==='joinRoom') {if(d.code!=='DEMO27')throw Error('미리보기 코드는 DEMO27이에요.');return {roomId:room.id};}
      if (action === 'renameRoom') { room.title = d.title.trim(); emit(); return {roomId: room.id}; }
      if(action==='renewInvite'){room.inviteExpiresAt=Date.now()+86400000;emit();return {code:room.inviteCode};}
      const old=items.find(x=>x.id===d.itemId);
      if(old && old.ownerId!==uid)throw Error('내 기록만 수정할 수 있어요.');
      if(old && old.version!==d.version)throw Object.assign(Error('기록이 변경되었어요.'),{code:'functions/aborted'});
      const next={...(old??{}),...(d.item??{}),id:d.itemId,ownerId:uid,version:(old?.version??0)+1,createdAt:old?.createdAt??Date.now(),deleted:action==='deleteItem',mutationId:d.mutationId};
      items=items.filter(x=>x.id!==next.id);items.push(next);emit();return next;
    },
    watchRooms(_uid,next){watchers.rooms=next;queueMicrotask(()=>next([structuredClone(room)]));return()=>{watchers.rooms=null;};},
    watchRoom(_id,next){watchers.room=next;queueMicrotask(()=>next(structuredClone(room)));return()=>{watchers.room=null;};},
    watchItems(_id,next){watchers.items=next;queueMicrotask(()=>next(structuredClone(items.filter(x=>!x.deleted))));return()=>{watchers.items=null;};},
    async getItem(_r,id){return structuredClone(items.find(x=>x.id===id)??null);}
  };
}
