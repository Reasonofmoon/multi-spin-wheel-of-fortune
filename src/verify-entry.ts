import { verifySessionLog } from './domain/fairness';
import './verify.css';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The verification page is missing ${selector}.`);
  return element;
}

const input = requireElement<HTMLTextAreaElement>('#session-json');
const fileInput = requireElement<HTMLInputElement>('#session-file');
const verifyButton = requireElement<HTMLButtonElement>('#verify-button');
const summary = requireElement<HTMLParagraphElement>('#summary');
const results = requireElement<HTMLOListElement>('#draw-results');

async function verifyInput(): Promise<void> {
  results.replaceChildren();
  summary.removeAttribute('data-result');

  let content = input.value;
  const file = fileInput.files?.item(0);
  if (!content.trim() && file) content = await file.text();
  if (!content.trim()) {
    summary.textContent = '먼저 JSON 로그를 입력하거나 파일을 선택해 주세요.';
    summary.dataset.result = 'fail';
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    summary.textContent =
      'JSON 형식이 올바르지 않습니다. 원본 내보내기 파일을 확인해 주세요.';
    summary.dataset.result = 'fail';
    return;
  }

  let verification: Awaited<ReturnType<typeof verifySessionLog>>;
  try {
    verification = await verifySessionLog(parsed);
  } catch {
    summary.textContent = '이 브라우저에서 Web Crypto를 실행할 수 없습니다.';
    summary.dataset.result = 'fail';
    return;
  }
  if (!verification.validLog) {
    summary.textContent = '로그 형식, 서버 시드 또는 커밋먼트가 유효하지 않습니다.';
    summary.dataset.result = 'fail';
    return;
  }

  const passed =
    verification.commitmentValid && verification.draws.every((draw) => draw.passed);
  summary.textContent =
    `커밋먼트 ${verification.commitmentValid ? 'PASS' : 'FAIL'} · ` +
    `추첨 ${verification.draws.filter((draw) => draw.passed).length}/${verification.draws.length}건 검증 통과`;
  summary.dataset.result = passed ? 'pass' : 'fail';

  for (const draw of verification.draws) {
    const item = document.createElement('li');
    item.textContent = `Nonce ${draw.nonce}: ${draw.passed ? 'PASS' : 'FAIL'}`;
    item.dataset.result = draw.passed ? 'pass' : 'fail';
    results.append(item);
  }
}

verifyButton.addEventListener('click', () => {
  void verifyInput();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.item(0);
  if (!file) return;
  void file
    .text()
    .then((content) => {
      input.value = content;
      void verifyInput();
    })
    .catch(() => {
      summary.textContent = '선택한 파일을 읽을 수 없습니다.';
      summary.dataset.result = 'fail';
    });
});
