export type HwpShortcut = {
  id: string;
  title: string;
  keys: string[];
  category: "글자" | "문단" | "삽입" | "찾기" | "보기" | "파일";
  keywords: string[];
  description: string;
};

export const hwpShortcuts: HwpShortcut[] = [
  { id: "subscript", title: "아래 첨자", keys: ["Alt", "Shift", "S"], category: "글자", keywords: ["아래첨자", "subscript", "화학식"], description: "선택한 글자를 아래 첨자로 바꿉니다." },
  { id: "superscript", title: "위 첨자", keys: ["Alt", "Shift", "P"], category: "글자", keywords: ["위첨자", "superscript", "제곱"], description: "선택한 글자를 위 첨자로 바꿉니다." },
  { id: "script-cycle", title: "보통·위·아래 첨자 전환", keys: ["Ctrl", "Alt", "A"], category: "글자", keywords: ["첨자 전환", "보통 글자"], description: "보통 글자, 위 첨자, 아래 첨자를 차례로 전환합니다." },
  { id: "bold", title: "진하게", keys: ["Ctrl", "B"], category: "글자", keywords: ["굵게", "볼드", "bold"], description: "선택한 글자를 굵게 표시합니다." },
  { id: "italic", title: "기울임", keys: ["Ctrl", "I"], category: "글자", keywords: ["이탤릭", "italic"], description: "선택한 글자를 기울여 표시합니다." },
  { id: "underline", title: "밑줄", keys: ["Ctrl", "U"], category: "글자", keywords: ["underline"], description: "선택한 글자에 밑줄을 적용합니다." },
  { id: "character-shape", title: "글자 모양", keys: ["Alt", "L"], category: "글자", keywords: ["폰트", "글꼴", "글자 크기"], description: "글꼴과 크기 등 글자 모양 설정을 엽니다." },
  { id: "font-grow", title: "글자 크게", keys: ["Alt", "Shift", "E"], category: "글자", keywords: ["폰트 크게", "크기 증가", "Ctrl ]"], description: "선택한 글자의 크기를 한 단계 키웁니다." },
  { id: "font-shrink", title: "글자 작게", keys: ["Alt", "Shift", "R"], category: "글자", keywords: ["폰트 작게", "크기 감소", "Ctrl ["], description: "선택한 글자의 크기를 한 단계 줄입니다." },
  { id: "paragraph-shape", title: "문단 모양", keys: ["Alt", "T"], category: "문단", keywords: ["문단 설정", "정렬", "간격"], description: "정렬, 들여쓰기, 줄 간격 등 문단 설정을 엽니다." },
  { id: "indent", title: "첫 줄 들여쓰기", keys: ["Ctrl", "F6"], category: "문단", keywords: ["들여쓰기", "indent", "Ctrl Shift I"], description: "현재 문단의 첫 줄을 안쪽으로 들여씁니다." },
  { id: "outdent", title: "첫 줄 내어쓰기", keys: ["Ctrl", "F5"], category: "문단", keywords: ["내어쓰기", "outdent", "Ctrl Shift O"], description: "현재 문단의 첫 줄을 바깥쪽으로 내어씁니다." },
  { id: "line-wide", title: "줄 간격 넓게", keys: ["Alt", "Shift", "Z"], category: "문단", keywords: ["행간 늘리기", "줄간격 증가"], description: "현재 문단의 줄 간격을 넓힙니다." },
  { id: "line-narrow", title: "줄 간격 좁게", keys: ["Alt", "Shift", "A"], category: "문단", keywords: ["행간 줄이기", "줄간격 감소"], description: "현재 문단의 줄 간격을 좁힙니다." },
  { id: "align-left", title: "왼쪽 정렬", keys: ["Ctrl", "Shift", "L"], category: "문단", keywords: ["좌측 정렬"], description: "현재 문단을 왼쪽으로 정렬합니다." },
  { id: "align-center", title: "가운데 정렬", keys: ["Ctrl", "Shift", "C"], category: "문단", keywords: ["중앙 정렬"], description: "현재 문단을 가운데로 정렬합니다." },
  { id: "align-right", title: "오른쪽 정렬", keys: ["Ctrl", "Shift", "R"], category: "문단", keywords: ["우측 정렬"], description: "현재 문단을 오른쪽으로 정렬합니다." },
  { id: "justify", title: "양쪽 정렬", keys: ["Ctrl", "Shift", "M"], category: "문단", keywords: ["혼합 정렬", "justify"], description: "현재 문단의 양쪽 끝을 맞춥니다." },
  { id: "format-copy", title: "모양 복사", keys: ["Alt", "C"], category: "글자", keywords: ["서식 복사", "모양 붙여넣기"], description: "글자·문단 모양을 복사해 다른 곳에 적용합니다." },
  { id: "style", title: "스타일", keys: ["F6"], category: "문단", keywords: ["스타일 목록", "문단 스타일"], description: "스타일 목록을 열어 문서 스타일을 적용합니다." },
  { id: "equation", title: "수식 입력", keys: ["Ctrl", "N", "M"], category: "삽입", keywords: ["수식 편집기", "equation", "공식"], description: "수식 편집기를 열어 수식을 입력합니다." },
  { id: "table", title: "표 만들기", keys: ["Ctrl", "N", "T"], category: "삽입", keywords: ["테이블", "표 삽입"], description: "표 만들기 창을 엽니다." },
  { id: "character-map", title: "문자표", keys: ["Ctrl", "F10"], category: "삽입", keywords: ["특수문자", "기호"], description: "문자표를 열어 특수 문자와 기호를 입력합니다." },
  { id: "page-break", title: "쪽 나누기", keys: ["Ctrl", "Enter"], category: "삽입", keywords: ["페이지 나누기", "새 페이지"], description: "현재 위치에서 새 쪽을 시작합니다." },
  { id: "section-break", title: "구역 나누기", keys: ["Alt", "Shift", "Enter"], category: "삽입", keywords: ["섹션 나누기", "구역"], description: "현재 위치에서 새 구역을 시작합니다." },
  { id: "find", title: "찾기", keys: ["Ctrl", "F"], category: "찾기", keywords: ["검색", "텍스트 찾기"], description: "문서에서 원하는 내용을 찾습니다." },
  { id: "replace", title: "찾아 바꾸기", keys: ["Ctrl", "H"], category: "찾기", keywords: ["치환", "바꾸기"], description: "찾은 내용을 다른 내용으로 바꿉니다." },
  { id: "paragraph-marks", title: "문단 부호 표시", keys: ["Ctrl", "G", "T"], category: "보기", keywords: ["엔터 표시", "문단 기호"], description: "문단 끝을 나타내는 문단 부호를 표시합니다." },
  { id: "format-marks", title: "조판 부호 표시", keys: ["Ctrl", "G", "C"], category: "보기", keywords: ["편집 기호", "조판부호"], description: "문서 안의 조판 부호를 표시합니다." },
  { id: "print", title: "인쇄", keys: ["Alt", "P"], category: "파일", keywords: ["프린트", "출력"], description: "인쇄 설정 창을 엽니다." },
];

