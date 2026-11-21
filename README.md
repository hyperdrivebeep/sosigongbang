# 소식공방

학원 원장님이 한 줄 메모로 카드뉴스를 만들고, 문구·색·로고를 고쳐 인스타그램에 올리는 Windows용 로컬 제작기입니다. 메모로 초안을 만들 때는 원장님이 연결한 ChatGPT 플랜을 사용합니다.

**원장님 PC에는 [최신 Windows 배포본](https://github.com/hyperdrivebeep/sosigongbang/releases/latest)을 받으세요.** `Sosigongbang-Windows-x64.zip`에는 Node.js 실행 환경이 들어 있습니다. 전체 압축을 푼 뒤 [설치 안내](outputs/소식공방/원장님%20PC%20설치.txt)에 따라 Chrome 확장을 등록하고 `Start.cmd`를 실행하세요.

## 원장님 사용 순서

1. ‘새로 만들기’에서 주제를 적고 ChatGPT로 초안을 만듭니다.
2. 각 장의 문구를 수정하고 ‘학원 디자인’에서 색과 로고를 정합니다.
3. ‘인스타에 게시’를 누르거나 ‘새로 만들기’ 입력칸에 “인스타에 올려줘”를 입력합니다. 사진 순서와 캡션을 확인하고 Instagram으로 보냅니다.
4. 표시된 계정을 확인하고 게시합니다. 화면 구성을 인식하지 못하면 Instagram 탭에서 이어갑니다.

## 다른 컴퓨터에서 개발하기

비공개 저장소에 접근할 수 있는 GitHub 계정, Windows x64, Node.js 24, Python 3, Chrome을 준비하세요.

```powershell
gh repo clone hyperdrivebeep/sosigongbang
cd sosigongbang
npm ci
npm run build
npm start
```

- `work/editor.html`, `editor.css`, `app.js`, `render.js`, `publish.js`가 편집기 원본입니다. HTML 또는 JS 수정 후 다시 빌드하세요.
- `outputs/소식공방/app`은 로컬 실행기와 ChatGPT 로그인 서비스입니다. `outputs/소식공방/인스타-업로드`는 압축 해제 방식으로 설치하는 Chrome Manifest V3 확장입니다.
- `work/academy-cardnews`는 ChatGPT 스킬 원본입니다. 빌드 시 스킬 ZIP과 프로젝트 내 스킬 복사본도 갱신합니다.
- 첫 로그인은 각 PC에서 진행합니다. Windows 사용자 계정에 묶인 암호화된 연결 정보와 실제 브라우저 프로필은 Git으로 옮기지 않습니다.

## QA와 게시 범위

Windows에서 `npm test`를 실행하세요. Chrome이 표준 설치 위치와 다르면 환경변수 `SOSI_BROWSER`에 chrome.exe의 전체 경로를 지정합니다. 계정 테스트에는 별도의 시험용 데이터를 사용합니다. 확장 테스트는 별도 Chrome 프로필에 실제 확장을 로드한 뒤 모의 Instagram 작성 화면으로 연결합니다.

실제 Chrome과 ChatGPT 계정으로 세 장 생성, 편집 및 1080×1350 PNG 다운로드를 확인했습니다. 확장의 사진 순서, 캡션, 취소, 계정 변경, 최종 공유 1회와 완료 처리는 모의 화면에서 확인했습니다. 실제 학원 인스타그램 게시와 원장님 PC에서의 설치 확인은 남아 있습니다. [설계와 QA](outputs/소식공방/설계와%20QA.md)

