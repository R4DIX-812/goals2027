import { randomInt, randomUUID, createHash } from 'node:crypto';
import { AppError, ensure, text, id, cleanItem, checkMember, checkJoin, checkVersion } from './core.js';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const code = () => Array.from({length:6},()=>alphabet[randomInt(36)]).join('');
const DAY = 86400000;
export function createService(db) {
  const doc = path => db.doc(path);
  async function limited(uid, ip, action, limit = 80, window = 60000) {
    const now = Date.now();
    const keys = ['uid:' + uid, 'ip:' + (ip || 'unknown')].map(k=>createHash('sha256').update(action+':'+k).digest('hex'));
    await db.runTransaction(async tx => {
      const refs = keys.map(k=>doc('rateLimits/'+k));
      const snapshots = await Promise.all(refs.map(r=>tx.get(r)));
      snapshots.forEach((s,i)=>{
        const old=s.data();
        const count=old && old.resetAt>now ? old.count : 0;
        ensure(count < limit * (i ? 4 : 1),'resource-exhausted','잠시 쉬었다가 다시 시도해 주세요.');
      });
      snapshots.forEach((s,i)=>{
        const old=s.data(), active=old && old.resetAt>now;
        tx.set(refs[i],{count:active?old.count+1:1,resetAt:active?old.resetAt:now+window,expiresAt:new Date(now+DAY)});
      });
    });
  }
  async function profile(uid) {
    const p=(await doc('profiles/'+uid).get()).data();
    ensure(p,'failed-precondition','먼저 별명을 정해 주세요.');
    return p;
  }
  return async function run(uid, ip, data) {
    ensure(data && typeof data === 'object', 'invalid-argument', '요청을 확인해 주세요.');
    const action=data.action;
    ensure(['profile','createRoom','joinRoom','renewInvite','saveItem','deleteItem'].includes(action),'invalid-argument','지원하지 않는 요청이에요.');
    await limited(uid,ip,'all');
    if(action==='profile') {
      const nickname=text(data.nickname,1,12,'별명');
      return db.runTransaction(async tx=>{
        const ref=doc('profiles/'+uid), old=await tx.get(ref);
        if(old.exists) return old.data();
        const p={nickname,createdAt:Date.now()}; tx.create(ref,p); return p;
      });
    }
    const p=await profile(uid);
    if(action==='createRoom') {
      await limited(uid,ip,'create',5,3600000);
      const requestId=id(data.requestId), roomId=createHash('sha256').update(uid+':'+requestId).digest('hex').slice(0,24);
      for(let attempt=0;attempt<5;attempt++) {
        const inviteCode=code(), now=Date.now();
        try { return await db.runTransaction(async tx=>{
          const r=doc('rooms/'+roomId), inv=doc('invites/'+inviteCode);
          const [old,collision]=await Promise.all([tx.get(r),tx.get(inv)]);
          if(old.exists) return {roomId};
          if(collision.exists) throw new AppError('collision','Try another code');
          tx.create(r,{title:p.nickname+'의 2027 다이어리',year:2027,creatorId:uid,memberIds:[uid],members:[{uid,nickname:p.nickname}],inviteCode,inviteExpiresAt:now+DAY,createdAt:now});
          tx.create(inv,{code:inviteCode,roomId,expiresAt:now+DAY,used:false});
          return {roomId};
        }); } catch(e) { if(e.code!=='collision') throw e; }
      }
      throw new AppError('unavailable','초대코드를 만들지 못했어요. 다시 시도해 주세요.');
    }
    if(action==='joinRoom') {
      // Limit every attempt, including malformed codes, across all instances.
      await limited(uid,ip,'join',5,900000);
      const inviteCode=text(data.code,6,6,'초대코드').toUpperCase();
      ensure(/^[A-Z0-9]{6}$/.test(inviteCode),'invalid-argument','영문과 숫자 6자리를 입력해 주세요.');
      return db.runTransaction(async tx=>{
        const inv=doc('invites/'+inviteCode), i=(await tx.get(inv)).data();
        ensure(i,'failed-precondition','사용할 수 없는 초대코드예요.');
        const r=doc('rooms/'+i.roomId), room=(await tx.get(r)).data();
        if(checkJoin(room,i,uid,Date.now())==='existing') return {roomId:i.roomId};
        tx.update(r,{memberIds:[...room.memberIds,uid],members:[...room.members,{uid,nickname:p.nickname}]});
        tx.update(inv,{used:true});
        return {roomId:i.roomId};
      });
    }
    const roomId=id(data.roomId), r=doc('rooms/'+roomId);
    if(action==='renewInvite') {
      await limited(uid,ip,'renew',5,3600000);
      for(let attempt=0;attempt<5;attempt++) {
        const next=code(), now=Date.now();
        try { return await db.runTransaction(async tx=>{
          const room=(await tx.get(r)).data(); checkMember(room,uid);
          ensure(room.creatorId===uid && room.memberIds.length===1,'permission-denied','친구를 기다리는 방에서만 새 코드를 만들 수 있어요.');
          const inv=doc('invites/'+next);
          if((await tx.get(inv)).exists) throw new AppError('collision','Try another code');
          tx.update(doc('invites/'+room.inviteCode),{used:true});
          tx.create(inv,{code:next,roomId,expiresAt:now+DAY,used:false});
          tx.update(r,{inviteCode:next,inviteExpiresAt:now+DAY});
          return {code:next};
        }); } catch(e) {if(e.code!=='collision') throw e;}
      }
      throw new AppError('unavailable','다시 시도해 주세요.');
    }
    const itemId=id(data.itemId), itemRef=doc('rooms/'+roomId+'/items/'+itemId);
    const mutationId=id(data.mutationId);
    const item=action==='saveItem'?cleanItem(data.item):null;
    return db.runTransaction(async tx=>{
      const [rs,is]=await Promise.all([tx.get(r),tx.get(itemRef)]);
      const room=rs.data(), existing=is.data(); checkMember(room,uid);
      if(existing?.ownerId===uid && existing?.mutationId===mutationId) return existing;
      checkVersion(existing,data.version,uid);
      ensure(!existing?.deleted,'aborted','이미 삭제된 기록이에요.');
      if(action==='deleteItem') {
        ensure(existing,'not-found','기록을 찾을 수 없어요.');
        // A tombstone prevents stale autosaves from recreating a deleted item.
        const removed={...existing,title:'',note:'',deleted:true,version:existing.version+1,mutationId,updatedAt:Date.now()};
        tx.set(itemRef,removed); return removed;
      }
      const saved={...item,ownerId:uid,version:(existing?.version??0)+1,mutationId,createdAt:existing?.createdAt??Date.now(),updatedAt:Date.now(),deleted:false};
      tx.set(itemRef,saved); return saved;
    });
  };
}
