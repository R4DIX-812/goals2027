import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs,query,where} from 'firebase/firestore';
test('Firestore rules isolate members and deny client writes and invite enumeration',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-goals2027',firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore();
    await setDoc(doc(db,'rooms/roomtest001'),{memberIds:['alice','bob']});
    await setDoc(doc(db,'rooms/roomtest001/items/itemtest001'),{ownerId:'alice',title:'Private'});
    await setDoc(doc(db,'profiles/alice'),{nickname:'Alice'});
    await setDoc(doc(db,'invites/ABC123'),{roomId:'roomtest001'});
  });
  const google={firebase:{sign_in_provider:'google.com'}};
  const alice=env.authenticatedContext('alice',google).firestore(),bob=env.authenticatedContext('bob',google).firestore(),eve=env.authenticatedContext('eve',google).firestore(),anon=env.unauthenticatedContext().firestore();
  const wrongProvider=env.authenticatedContext('alice',{firebase:{sign_in_provider:'anonymous'}}).firestore();
  await assertSucceeds(getDoc(doc(alice,'rooms/roomtest001/items/itemtest001')));
  await assertSucceeds(getDoc(doc(bob,'rooms/roomtest001/items/itemtest001')));
  for(const db of [eve,anon,wrongProvider])await assertFails(getDoc(doc(db,'rooms/roomtest001/items/itemtest001')));
  await assertSucceeds(getDocs(query(collection(alice,'rooms'),where('memberIds','array-contains','alice'))));
  await assertFails(getDocs(collection(alice,'rooms')));
  await assertSucceeds(getDoc(doc(alice,'profiles/alice')));
  await assertFails(getDoc(doc(bob,'profiles/alice')));
  await assertFails(getDoc(doc(alice,'invites/ABC123')));
  await assertFails(getDocs(collection(alice,'invites')));
  await assertFails(setDoc(doc(alice,'rooms/roomtest001'),{memberIds:['alice','eve']}));
  await assertFails(setDoc(doc(alice,'rooms/roomtest001/items/itemtest001'),{ownerId:'alice',title:'Bypass API'}));
  await assertFails(setDoc(doc(alice,'profiles/alice'),{nickname:'Bypass API'}));
 }finally{await env.cleanup();}
});
