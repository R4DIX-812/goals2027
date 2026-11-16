# 2027

친구와 함께 쓰는 2027년 목표와 버킷리스트. Google로 로그인하고 별명을 정한 뒤 다이어리를 만들거나 6자리 초대코드로 참여할 수 있습니다.

## 로컬 실행

프로젝트 폴더에서 `node scripts/serve.mjs`를 실행하고 [로컬 주소](http://127.0.0.1:4173/)를 엽니다. 디자인 미리보기는 샘플 데이터로 실행되며 새로고침하면 초기화됩니다.

```sh
npm ci
npm test
```

Firestore 에뮬레이터 테스트에는 Java 21이 필요합니다.

## 배포

1. [Firebase 프로젝트](https://console.firebase.google.com/project/goals2027-d8a19/overview)에서 Google 로그인 제공자를 켜고 인증 허용 도메인에 `r4dix-812.github.io`를 추가합니다. Firestore는 서울 리전의 기본 데이터베이스를 사용합니다.
2. Firebase 콘솔의 Firestore → 규칙에서 이 저장소의 `firestore.rules`를 게시합니다. CLI를 사용하는 경우 `npx firebase deploy --project goals2027-d8a19 --only firestore:rules`를 실행합니다.
3. GitHub의 Settings → Pages에서 Deploy from a branch, main, /docs를 선택합니다.
4. HTTPS로 열린 사이트에서 두 Google 계정으로 로그인, 초대, 두 명 제한, 실시간 기록 반영 및 다른 기기에서 재접속을 확인합니다.

GitHub Pages와 Firebase Spark를 사용합니다. 방과 기록은 참여자만 읽을 수 있고 기록은 작성자만 수정할 수 있습니다. Firestore 보안 규칙이 방의 두 명 제한과 계정별 초대코드 조회 한도(15분당 5회)를 적용합니다. 초대코드는 24시간 유효합니다. Firebase의 무료 제공량을 넘으면 서비스 이용이 제한될 수 있습니다.
