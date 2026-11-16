import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { createService } from './service.js';
initializeApp();
const run=createService(getFirestore());
export const diary=onCall({
  region:'asia-northeast3', maxInstances:3, minInstances:0, memory:'256MiB',
  timeoutSeconds:30,
  cors:['https://r4dix-812.github.io', /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
},async request=>{
  if(!request.auth || request.auth.token.firebase?.sign_in_provider!=='google.com')
    throw new HttpsError('unauthenticated','Google 계정으로 다시 로그인해 주세요.');
  try {return await run(request.auth.uid,request.rawRequest.ip,request.data);}
  catch(error) {
    if(['invalid-argument','permission-denied','failed-precondition','resource-exhausted','not-found','aborted','unavailable'].includes(error.code))
      throw new HttpsError(error.code,error.message);
    logger.error('diary request failed',{code:String(error.code??'unknown')});
    throw new HttpsError('internal','저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
});
