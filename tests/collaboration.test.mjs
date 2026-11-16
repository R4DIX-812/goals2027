import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp, deleteApp} from 'firebase/app';
import {connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential} from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import {createStore} from '../docs/store.js';

const projectId = 'demo-goals2027';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const isLoopback = host => /^127\.0\.0\.1:\d+$/.test(host ?? '');

async function signInTestUser(identity, clients) {
  const app = initializeApp({
    projectId,
    apiKey: 'fake-emulator-key',
    appId: 'goals2027-test',
  }, randomUUID());
  clients.push(app);

  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://' + authHost, {disableWarnings: true});
  const credential = GoogleAuthProvider.credential(JSON.stringify(identity));
  const {user} = await signInWithCredential(auth, credential);

  const db = firestore.getFirestore(app);
  const [host, port] = firestoreHost.split(':');
  firestore.connectFirestoreEmulator(db, host, Number(port));
  return {uid: user.uid, db, call: createStore(db, firestore, () => auth.currentUser?.uid)};
}

function waitForDocument(reference, matches) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Timed out waiting for ' + reference.path));
    }, 10000);
    const stop = firestore.onSnapshot(reference, {includeMetadataChanges: true}, snapshot => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && matches(snapshot.data())) {
        clearTimeout(timer);
        stop();
        resolve(snapshot.data());
      }
    }, error => {
      clearTimeout(timer);
      stop();
      reject(error);
    });
  });
}

test('two mock Google accounts invite each other and receive diary changes live', async () => {
  assert.ok(isLoopback(authHost) && isLoopback(firestoreHost), 'Run only against the local Firebase emulators');
  const clients = [];
  const identity = name => ({
    sub: randomUUID(),
    email: name + '-' + randomUUID() + '@example.com',
    email_verified: true,
  });
  const hostIdentity = identity('host');
  const friendIdentity = identity('friend');

  try {
    const host = await signInTestUser(hostIdentity, clients);
    const friend = await signInTestUser(friendIdentity, clients);
    assert.notEqual(host.uid, friend.uid);

    await host.call('profile', {nickname: '테스트 주인'});
    await friend.call('profile', {nickname: '테스트 친구'});
    const {roomId} = await host.call('createRoom', {requestId: randomUUID()});
    const hostRoom = firestore.doc(host.db, 'rooms', roomId);
    const {inviteCode} = (await firestore.getDocFromServer(hostRoom)).data();

    const [room, redeemed] = await Promise.all([
      waitForDocument(hostRoom, data => data?.memberIds.includes(friend.uid)),
      friend.call('joinRoom', {code: inviteCode}),
    ]);
    assert.equal(redeemed.roomId, roomId);
    assert.deepEqual(room.memberIds, [host.uid, friend.uid]);

    const item = {kind: 'goal', title: '같이 계획 세우기', note: '', color: 'paper', sticker: '', done: false};
    const hostItemId = randomUUID();
    const friendItemId = randomUUID();
    const save = (client, itemId, entry, version = 0) =>
      client.call('saveItem', {roomId, itemId, item: entry, version, mutationId: randomUUID()});
    const itemRef = (client, itemId) => firestore.doc(client.db, 'rooms', roomId, 'items', itemId);

    await Promise.all([
      waitForDocument(itemRef(friend, hostItemId), data => data?.title === item.title && data.ownerId === host.uid),
      save(host, hostItemId, item),
    ]);
    await Promise.all([
      waitForDocument(itemRef(host, friendItemId), data => data?.ownerId === friend.uid && data.title === '친구의 목표'),
      save(friend, friendItemId, {...item, title: '친구의 목표'}),
    ]);
    await Promise.all([
      waitForDocument(itemRef(friend, hostItemId), data => data?.done === true && data.version === 2),
      save(host, hostItemId, {...item, done: true}, 1),
    ]);

    const otherDevice = await signInTestUser(hostIdentity, clients);
    assert.equal(otherDevice.uid, host.uid);
    const storedItem = (await firestore.getDocFromServer(itemRef(otherDevice, hostItemId))).data();
    assert.equal(storedItem.title, item.title);
    assert.equal(storedItem.done, true);

    await Promise.all([
      waitForDocument(itemRef(friend, hostItemId), data => data?.deleted === true),
      host.call('deleteItem', {roomId, itemId: hostItemId, version: 2, mutationId: randomUUID()}),
    ]);
  } finally {
    await Promise.all(clients.map(deleteApp));
  }
});
