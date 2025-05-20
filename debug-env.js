require('dotenv').config();

// 환경 변수 값 확인
console.log('NAVER_CLIENT_ID:', process.env.NAVER_CLIENT_ID);
console.log('NAVER_CLIENT_SECRET:', process.env.NAVER_CLIENT_SECRET);

// 두 값이 같은지 확인
if (process.env.NAVER_CLIENT_ID === process.env.NAVER_CLIENT_SECRET) {
  console.error('경고: Client ID와 Client Secret이 동일합니다! 서로 다른 값을 사용해야 합니다.');
}

// 값이 비어 있는지 확인
if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
  console.error('경고: Client ID 또는 Client Secret이 비어 있습니다!');
}