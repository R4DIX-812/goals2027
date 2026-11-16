const invitationAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const inviteWindowMs = 15 * 60 * 1000;
const inviteLifetimeMs = 24 * 60 * 60 * 1000;

function createCode() {
  let code = '';
  const bytes = new Uint8Array(16);
  while (code.length < 6) {
    crypto.getRandomValues(bytes);
    for (const value of bytes) {
      if (value < 252) code += invitationAlphabet[value % invitationAlphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

function failure(code, message) {
  return Object.assign(new Error(message), {code});
}

export function readRoom(snapshot) {
  if (!snapshot.exists()) return null;
  const room = snapshot.data();
  return {
    id: snapshot.id,
    ...room,
    createdAt: room.createdAt?.toMillis() ?? 0,
    inviteExpiresAt: (room.inviteIssuedAt?.toMillis() ?? 0) + inviteLifetimeMs,
  };
}

export function createStore(db, firestore, userId) {
  const {doc, getDocFromServer, serverTimestamp, runTransaction, writeBatch, updateDoc, arrayUnion} = firestore;
  const profile = uid => doc(db, 'profiles', uid);
  const room = roomId => doc(db, 'rooms', roomId);
  const invite = code => doc(db, 'invites', code);
  const denied = error => error.code === 'permission-denied';
  const badInvite = () => failure('failed-precondition', '사용할 수 없는 초대코드예요. 친구에게 확인해 주세요.');
  const limited = () => failure('resource-exhausted', '초대코드는 15분에 최대 5번 시도할 수 있어요. 잠시 후 다시 시도해 주세요.');

  async function grant(uid, code) {
    const ref = doc(db, 'joinAttempts', uid);
    return runTransaction(db, async transaction => {
      const previous = (await transaction.get(ref)).data();
      const elapsed = previous ? Date.now() - previous.windowAt.toMillis() : Infinity;
      const restart = elapsed >= inviteWindowMs;
      if (!restart && previous.count >= 5) throw limited();
      transaction.set(ref, {
        code,
        count: restart ? 1 : previous.count + 1,
        windowAt: restart ? serverTimestamp() : previous.windowAt,
        lastAt: serverTimestamp(),
      });
    });
  }

  async function createRoom(roomId, uid, member) {
    const ref = room(roomId);
    for (let retry = 0; retry < 4; retry++) {
      const inviteCode = createCode();
      const batch = writeBatch(db);
      batch.set(ref, {
        title: member.nickname + '의 2027 다이어리',
        year: 2027,
        creatorId: uid,
        memberIds: [uid],
        members: [member],
        inviteCode,
        inviteIssuedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      batch.set(invite(inviteCode), {roomId, issuedAt: serverTimestamp()});
      try {
        await batch.commit();
        return {roomId};
      } catch (error) {
        if (!denied(error)) throw error;
        const existing = await getDocFromServer(ref).catch(() => null);
        if (existing?.data()?.creatorId === uid) return {roomId};
      }
    }
    throw failure('unavailable', '버킷리스트를 만들지 못했어요. 다시 시도해 주세요.');
  }

  async function joinRoom(code, uid, member) {
    if (!/^[A-Z0-9]{6}$/.test(code)) throw badInvite();
    try { await grant(uid, code); }
    catch (error) { if (denied(error)) throw limited(); throw error; }

    let invitation;
    try { invitation = (await getDocFromServer(invite(code))).data(); }
    catch (error) { if (denied(error)) throw badInvite(); throw error; }
    if (!invitation) throw badInvite();

    const roomId = invitation.roomId;
    const ref = room(roomId);
    try {
      await updateDoc(ref, {memberIds: arrayUnion(uid), members: arrayUnion(member)});
    } catch (error) {
      if (!denied(error)) throw error;
      const existing = await getDocFromServer(ref).catch(() => null);
      if (!existing?.data()?.memberIds.includes(uid)) throw badInvite();
    }
    return {roomId};
  }

  async function renewInvite(roomId) {
    for (let retry = 0; retry < 4; retry++) {
      const next = createCode();
      const batch = writeBatch(db);
      batch.update(room(roomId), {inviteCode: next, inviteIssuedAt: serverTimestamp()});
      batch.set(invite(next), {roomId, issuedAt: serverTimestamp()});
      try {
        await batch.commit();
        return {code: next};
      } catch (error) {
        if (!denied(error)) throw error;
      }
    }
    throw failure('permission-denied', '친구를 기다리는 방에서만 새 코드를 만들 수 있어요.');
  }

  async function saveItem(action, data, uid) {
    const ref = doc(db, 'rooms', data.roomId, 'items', data.itemId);
    return runTransaction(db, async transaction => {
      const current = (await transaction.get(ref)).data();
      if (current?.ownerId === uid && current.mutationId === data.mutationId) return {version: current.version};
      if (current && current.ownerId !== uid) throw failure('permission-denied', '내 기록만 수정할 수 있어요.');
      if (current?.deleted || (current?.version ?? 0) !== data.version) {
        throw failure('functions/aborted', '다른 기기에서 바뀐 기록이에요.');
      }
      const deleting = action === 'deleteItem';
      if (deleting && !current) throw failure('not-found', '기록을 찾을 수 없어요.');
      const entry = deleting ? current : data.item;
      const version = data.version + 1;
      transaction.set(ref, {
        ownerId: uid,
        kind: entry.kind,
        color: entry.color,
        sticker: entry.sticker,
        done: entry.done,
        title: deleting ? '' : entry.title.trim(),
        note: deleting ? '' : entry.note.trim(),
        deleted: deleting,
        mutationId: data.mutationId,
        version,
        createdAt: current?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {version};
    });
  }

  return async function call(action, data = {}) {
    const uid = userId();
    if (!uid) throw failure('unauthenticated', 'Google 계정으로 다시 로그인해 주세요.');
    if (action === 'profile') {
      return runTransaction(db, async transaction => {
        const ref = profile(uid);
        const existing = (await transaction.get(ref)).data();
        if (existing) return existing;
        const nickname = data.nickname.trim();
        transaction.set(ref, {nickname, createdAt: serverTimestamp()});
        return {nickname};
      });
    }
    if (action === 'saveItem' || action === 'deleteItem') return saveItem(action, data, uid);
    if (action === 'renewInvite') return renewInvite(data.roomId);
    const account = (await getDocFromServer(profile(uid))).data();
    if (!account) throw failure('failed-precondition', '먼저 별명을 정해 주세요.');
    const member = {uid, nickname: account.nickname};
    if (action === 'createRoom') return createRoom(data.requestId, uid, member);
    if (action === 'joinRoom') return joinRoom(data.code, uid, member);
    throw failure('invalid-argument', '지원하지 않는 요청이에요.');
  };
}
