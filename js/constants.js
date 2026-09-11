export const MOBILE_MAX = 768;

export const SIZE_CLASSES = ['h1-size', 'h2-size', 'decrease-size'];

export const COLOR_CLASSES = ['red-color', 'orange-color', 'green-color', 'blue-color', 'l-color'];

export const INDENT_CLASS = 'indent';

export const TOOL_LINE_CLASSES = [
    ...SIZE_CLASSES,
    ...COLOR_CLASSES,
    'bold',
    'underlined',
    'checklist',
    'box',
];

export const PW_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,16}$/;

export const AUTH_RE = /^\d{4}$/;

export const AUTH_FOCUS_MSG = '입력한 이메일로 전송된 숫자 4자리의 인증번호를 입력하세요.';

export const EMAIL_FOCUS_MSG = '@와 .을 포함한 이메일을 입력하세요.';

export const PW_FOCUS_MSG = '영문, 숫자, 특수문자를 포함한 8~16자리의 비밀번호를 입력하세요.';

export const PAGES_STORAGE_KEY = 'thinkingnote-pages';

/** 설정·세션 전체 — 탭/브라우저를 닫으면 초기화 (새로고침·뒤로/앞으로는 유지) */
export const SETTINGS_STORAGE_KEY = 'thinkingnote-settings';

export const DEFAULT_PROFILE_IMG = 'img/profile.svg';

export const NICKNAME_FOCUS_MSG = '국문, 영문, 숫자로 구성된 2~18자리의 닉네임을 입력하세요.';

export const NICKNAME_RE = /^[가-힣a-zA-Z0-9]{2,18}$/;

export const IMAGE_CLIPBOARD_MIME = 'application/x-thinkingnote-image';

export const LINE_CLIPBOARD_MIME = 'application/x-thinkingnote-line-classes';

export const WELCOME_HTML = `
<div class="h1-size bold">👋 반가워요!</div>
<div class="h1-size bold">씽킹노트에 오신 것을 환영해요.</div>
<div><br></div>
<div>이 페이지에서 씽킹노트만의 텍스트 편집 도구를 소개할게요.</div>
<div>아래 내용을 따라 기능을 익혀 보세요.</div>
<div><br></div>
<div><br></div>
<div><br></div>
<div><br></div>
<div class="h2-size bold">1. 텍스트 크기 조절하기</div>
<div><br></div>
<div>내용의 중요도에 따라 텍스트 크기를 조절해 보세요.</div>
<div>내용의 위계를 설정하여 페이지의 구조를 한눈에 파악할 수 있어요.</div>
<div><br></div>
<div class="h1-size box">이 텍스트는 가장 큰 제목 크기예요.</div>
<div class="h2-size box">이 텍스트는 중간 제목 크기예요.</div>
<div class="box">이 텍스트는 기본 크기예요.</div>
<div class="decrease-size box">이 텍스트는 조금 작은 크기예요.</div>
<div><br></div>
<div><br></div>
<div class="h2-size bold">2. 텍스트 강조하기</div>
<div><br></div>
<div>텍스트의 특정 부분을 강조하여 내용을 시각적으로 분류해 보세요.</div>
<div>핵심 내용을 한눈에 파악할 수 있어요.</div>
<div><br></div>
<div class="bold box">중요한 내용이나 잊지 말아야 할 핵심 내용은 굵게 강조해 보세요.</div>
<div class="underlined box">참고 자료의 출처나 주의 깊게 확인해야 할 부분에는 밑줄을 활용해 보세요.</div>
<div><br></div>
<div><br></div>
<div class="h2-size bold">3. 텍스트 색상 변경하기</div>
<div><br></div>
<div>텍스트 색상을 바꿔 내용의 성격이나 유형을 나누어 보세요.</div>
<div>색상 구분만으로 내용의 성격을 빠르게 구분할 수 있어요.</div>
<div><br></div>
<div class="red-color box">빨간색으로 강조하고 싶은 핵심 내용이나 경고 문구를 작성해 보세요.</div>
<div class="blue-color box">파란색으로 참고할 자료나 부수적인 정보를 구분하여 작성해 보세요.</div>
<div><br></div>
<div><br></div>
<div class="h2-size bold">4. 체크 리스트 작성하기</div>
<div><br></div>
<div>오늘의 할 일이나 완료 여부를 확인할 항목은 체크 리스트를 사용해 보세요.</div>
<div>수행 상태를 직관적으로 관리하여 남은 항목을 꼼꼼하게 점검할 수 있어요.</div>
<div><br></div>
<div class="checklist box"><button type="button" class="checklist-btn icon-btn"><span class="blank-icon">check_box_outline_blank</span><span class="check-icon">check_box</span></button><span class="checklist-txt">오늘 꼭 마쳐야 할 일은 체크 리스트로 등록해 보세요.</span></div>
<div class="checklist box on"><button type="button" class="checklist-btn icon-btn"><span class="blank-icon">check_box_outline_blank</span><span class="check-icon">check_box</span></button><span class="checklist-txt">이미 완료한 항목은 체크하여 한눈에 정리해 보세요.</span></div>
<div><br></div>
<div><br></div>
<div class="h2-size bold">5. 텍스트 블록 적용하기</div>
<div><br></div>
<div>중요한 내용이나 참고해야 하는 내용은 텍스트 블록을 적용해 보세요.</div>
<div>특정 내용을 한눈에 들어오게 할 수 있어요.</div>
<div><br></div>
<div class="box">별도의 구분이 필요한 내용은 텍스트 블록을 활용해 보세요.</div>
<div class="box">텍스트 블록을 적용하면 회색 박스가 추가돼요.</div>
<div><br></div>
<div><br></div>
<div class="h2-size bold">6. 이미지 추가하기</div>
<div><br></div>
<div>텍스트만으로 부족한 내용을 보완하기 위해 이미지를 추가해 보세요.<br>텍스트와 이미지를 적절히 배치하여 생각의 흐름을 입체적으로 시각화할 수 있어요.</div>
<div><br></div>
<div class="image"><button type="button" class="image-btn icon-btn"><span class="fullscreen-icon">fullscreen</span><span class="exit-icon">fullscreen_exit</span></button><img src="img/sample.png" alt=""></div>`;

export const PAGE_AREA_ITEM_SEL = '#sidebar-all-page-area > div, #sidebar-delete-page-area > div';

export const NOTE_PAGE_SEL = '#note-area > div';

export const NOTE_PAGE_ON_SEL = '#note-area > div.on';

export const SAVED_STATUS_TEXT = '저장되었어요.';

export const SAVED_STATUS_MS = 1000;

export const LINK_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/g;

export const THEME_IDS = {
    SYSTEM: 'set-system-dropdown-opt-btn',
    LIGHT: 'set-light-dropdown-opt-btn',
    DARK: 'set-dark-dropdown-opt-btn',
};

export const THEME_LABELS = {
    [THEME_IDS.SYSTEM]: '시스템 설정',
    [THEME_IDS.LIGHT]: '라이트 모드',
    [THEME_IDS.DARK]: '다크 모드',
};

export const LANG_IDS = {
    KO: 'set-ko-dropdown-opt-btn',
};

export const LANG_LABELS = {
    [LANG_IDS.KO]: '한국어',
};
