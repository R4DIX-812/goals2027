# 우리의 2027

친구와 함께 쓰는 2027년 목표와 버킷리스트 다이어리. Google로 로그인하고 별명을 정한 뒤 다이어리를 만들거나 6자리 코드로 참여할 수 있습니다.

## 로컬 실행

프로젝트 폴더에서 `node scripts/serve.mjs`를 실행하고 [로컬 주소](http://127.0.0.1:4173/)를 엽니다. 디자인 미리보기는 샘플 데이터로 실행되며 새로고침하면 초기화됩니다.

```sh
npm ci
npm ci --prefix functions
npm test
npm run test:rules
npm run test:integration
```

에뮬레이터 테스트에는 Java 21이 필요합니다. 서버 함수는 Node.js 22를 사용합니다.

## 운영 배포

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트와 웹 앱을 만들고, Authentication에서 Google 제공자를 켭니다. 인증 허용 도메인에 `r4dix-812.github.io`를 추가합니다.
2. Cloud Firestore 기본 데이터베이스를 프로덕션 모드로 만듭니다. 주 사용자가 한국이면 서울 리전을 선택할 수 있습니다. Functions 배포를 위해 Blaze 결제 계정을 연결합니다.
3. `docs/config.js`의 `firebase`에 웹 앱 설정 객체를 넣습니다. 서비스 계정 키나 OAuth 비밀값은 여기에 넣지 않습니다.
4. Firebase CLI에 로그인하고 해당 프로젝트에 배포합니다. Functions와 Firestore 규칙 및 인덱스를 함께 배포합니다.

   ```sh
   npx firebase login
   npx firebase deploy --project PROJECT_ID --only firestore,functions
   ```

5. 코드를 GitHub에 올린 뒤 **Settings → Pages → Deploy from a branch → main → /docs**로 저장합니다. 배포 URL에는 HTTPS를 사용합니다.
6. 서로 다른 Google 계정 두 개로 방 생성, 초대 참여, 실시간 기록 확인, 다른 기기에서 재접속을 확인합니다. 제3자 접근과 세 번째 참여가 실패하는지도 확인합니다.

방 정보는 참여자만 읽을 수 있고 기록 수정은 작성자에게만 허용됩니다. 브라우저의 Firestore 직접 쓰기는 권한 규칙으로 차단하며, 모든 저장은 Google 계정으로 인증한 서버 함수를 거칩니다.
