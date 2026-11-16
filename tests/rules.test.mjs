import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as firestore from 'firebase/firestore';
import {createStore} from '../docs/store.js';

const {doc,collection,getDoc,getDocs,query,where,updateDoc,setDoc,deleteDoc,serverTimestamp,Timestamp}=firestore;
const entry={title:'친구와 가고 싶은 곳',note:'봄에 출발하기',kind:'bucket',color:'pink',sticker:'heart',done:false};

test('Spark plan rules enforce authorization and concurrency through the real web adapter', async()=>{
  const env=await initializeTestEnvironment({
    projectId:'demo-goals2027',
    firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')},
  });
  const google={firebase:{sign_in_provider:'google.com'}};
  const web=uid=>{
    const db=env.authenticatedContext(uid,google).firestore();
    return {db,call:createStore(db,firestore,()=>uid),uid};
  };
  const a=web('alice'), b=web('bob'), c=web('charlie'), outsider=web('outsider');
  const unauthenticated=env.unauthenticatedContext().firestore();
  const anonymous=env.authenticatedContext('alice',{firebase:{sign_in_provider:'anonymous'}}).firestore();
  try {
    await env.clearFirestore();
    for(const user of [a,b,c,outsider]) await user.call('profile',{nickname:user.uid});
    assert.equal((await a.call('profile',{nickname:'변경'})).nickname,'alice');
    const roomId=randomUUID();
    await a.call('createRoom',{requestId:roomId});
    assert.equal((await a.call('createRoom',{requestId:roomId})).roomId,roomId);
    const ref=doc(a.db,'rooms',roomId);
    const code=(await getDoc(ref)).data().inviteCode;
    assert.match(code,/^[A-Z0-9]{6}$/);
    for(const other of [b.db,outsider.db,unauthenticated,anonymous]){
      await assertFails(getDoc(doc(other,'rooms',roomId)));
      await assertFails(getDoc(doc(other,'invites',code)));
    }
    await assertFails(getDocs(collection(a.db,'invites')));
    await assertFails(getDocs(collection(a.db,'rooms')));
    await assertSucceeds(getDocs(query(collection(a.db,'rooms'),where('memberIds','array-contains','alice'))));
    await assertFails(updateDoc(doc(b.db,'rooms',roomId),{memberIds:['alice','bob'],members:[{uid:'alice',nickname:'alice'},{uid:'bob',nickname:'bob'}]}));
    await assertFails(updateDoc(ref,{creatorId:'bob'}));
    await assertFails(setDoc(doc(b.db,'joinAttempts','alice'),{code,count:1,windowAt:serverTimestamp(),lastAt:serverTimestamp()}));

    const race=await Promise.allSettled([b.call('joinRoom',{code}),c.call('joinRoom',{code})]);
    assert.equal(race.filter(result=>result.status==='fulfilled').length,1);
    const joined=(await getDoc(ref)).data().memberIds;
    assert.equal(joined.length,2);
    const friend=joined.includes('bob')?b:c;
    await assertSucceeds(getDoc(doc(friend.db,'rooms',roomId)));
    await assert.rejects(outsider.call('joinRoom',{code}),{code:'failed-precondition'});
    assert.equal((await friend.call('joinRoom',{code})).roomId,roomId);
    const itemId=randomUUID();
    const save={roomId,itemId,version:0,mutationId:randomUUID(),item:entry};
    assert.equal((await a.call('saveItem',save)).version,1);
    assert.equal((await a.call('saveItem',save)).version,1);
    const friendItem=doc(friend.db,'rooms',roomId,'items',itemId);
    assert.equal((await getDoc(friendItem)).data().title,entry.title);
    await assertFails(getDoc(doc(outsider.db,'rooms',roomId,'items',itemId)));
    await assertFails(updateDoc(friendItem,{title:'수정'}));
    await assertFails(deleteDoc(friendItem));
    await assert.rejects(friend.call('saveItem',{...save,version:1,mutationId:randomUUID()}),{code:'permission-denied'});
    await assert.rejects(a.call('saveItem',{...save,mutationId:randomUUID()}),{code:'functions/aborted'});
    await assert.rejects(a.call('saveItem',{...save,version:1,mutationId:randomUUID(),item:{...entry,note:'x'.repeat(501)}}),{code:'permission-denied'});
    await a.call('deleteItem',{roomId,itemId,version:1,mutationId:randomUUID()});
    assert.equal((await getDoc(friendItem)).data().title,'');
    await assert.rejects(a.call('saveItem',{...save,version:2,mutationId:randomUUID()}),{code:'functions/aborted'});

    const second=(await a.call('createRoom',{requestId:randomUUID()})).roomId;
    const old=(await getDoc(doc(a.db,'rooms',second))).data().inviteCode;
    const replacement=(await a.call('renewInvite',{roomId:second})).code;
    assert.notEqual(old,replacement);
    await assert.rejects(outsider.call('joinRoom',{code:old}),{code:'failed-precondition'});
    await env.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();
      const issuedAt=Timestamp.fromMillis(Date.now()-25*60*60*1000);
      await updateDoc(doc(db,'rooms',second),{inviteIssuedAt:issuedAt});
      await updateDoc(doc(db,'invites',replacement),{issuedAt});
    });
    await assert.rejects(outsider.call('joinRoom',{code:replacement}),{code:'failed-precondition'});
    for(const code of ['OTHER1','OTHER2']) await assert.rejects(outsider.call('joinRoom',{code}),{code:'failed-precondition'});
    await assert.rejects(outsider.call('joinRoom',{code:'OTHER3'}),{code:'resource-exhausted'});
    const attempt=doc(outsider.db,'joinAttempts','outsider');
    await assertFails(deleteDoc(attempt));
    await assertFails(setDoc(attempt,{code:'OTHER3',count:1,windowAt:serverTimestamp(),lastAt:serverTimestamp()}));
    await assertFails(getDoc(doc(outsider.db,'invites',code)));
  } finally {
    await env.cleanup();
  }
});
