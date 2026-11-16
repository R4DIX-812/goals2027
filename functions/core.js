export class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function ensure(condition, code, message) {
  if (!condition) throw new AppError(code, message);
}
export function text(value, min, max, label) {
  ensure(typeof value === 'string', 'invalid-argument', label + '을 확인해 주세요.');
  const clean = value.trim();
  ensure([...clean].length >= min && [...clean].length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean), 'invalid-argument', label + '은 ' + min + '~' + max + '자로 입력해 주세요.');
  return clean;
}
export function id(value) {
  ensure(typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value), 'invalid-argument', '잘못된 요청이에요.');
  return value;
}
export function cleanItem(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'invalid-argument', '기록을 확인해 주세요.');
  ensure(['goal', 'bucket'].includes(input.kind), 'invalid-argument', '기록 종류를 확인해 주세요.');
  ensure(['paper', 'pink', 'green'].includes(input.color), 'invalid-argument', '종이 색을 확인해 주세요.');
  ensure(['', 'star', 'heart', 'flower', 'clover'].includes(input.sticker), 'invalid-argument', '스티커를 확인해 주세요.');
  ensure(typeof input.done === 'boolean', 'invalid-argument', '완료 상태를 확인해 주세요.');
  return {title:text(input.title,1,80,'제목'),note:text(input.note ?? '',0,500,'메모'),kind:input.kind,color:input.color,sticker:input.sticker,done:input.done};
}
export function checkMember(room, uid) {
  ensure(room && room.memberIds.includes(uid), 'permission-denied', '이 다이어리에 접근할 수 없어요.');
}
export function checkJoin(room, invite, uid, now) {
  if (room?.memberIds.includes(uid)) return 'existing';
  ensure(room && invite && !invite.used && invite.expiresAt > now && room.inviteCode === invite.code && room.memberIds.length < 2, 'failed-precondition', '사용할 수 없는 초대코드예요.');
  return 'join';
}
export function checkVersion(existing, version, uid) {
  ensure(Number.isSafeInteger(version) && version >= 0, 'invalid-argument', '기록 버전을 확인해 주세요.');
  if (!existing) { ensure(version === 0, 'aborted', '기록이 변경되었거나 삭제됐어요.'); return; }
  ensure(existing.ownerId === uid, 'permission-denied', '내 기록만 수정할 수 있어요.');
  ensure(existing.version === version, 'aborted', '다른 기기에서 바뀐 기록이에요. 최신 내용을 확인해 주세요.');
}
