/**
 * 내보낸 가이드 HTML 안에서 도는 편집 런타임 — 문자열로 인라인 삽입된다.
 *
 * 왜 문자열인가: main 번들(tsconfig.node, DOM lib 없음)에서 브라우저 코드를 타입 체크할
 * 방법이 없고, 산출물은 외부 스크립트 없이 파일 하나로 열려야 한다. 대신 문법을 ES2020
 * 범위로 제한하고, 실제 브라우저·Electron 창에서 동작을 확인한다.
 *
 * 하는 일:
 *   - [편집] ↔ [보기 모드] 전환. data-field 칸을 contenteditable 로 켠다/끈다.
 *   - 단계 위로/아래로/삭제. 번호는 CSS counter 라 따로 고칠 필요 없음, 상단 "N단계"만 갱신.
 *   - [저장] / ⌘S — 지금 문서를 *보기 모드로 정리한 복제본* 으로 직렬화해 .html 다운로드.
 *     저장본에도 이 스크립트가 남으므로 받은 사람도 다시 고쳐 저장할 수 있다.
 *   - 고친 뒤 저장 안 하고 닫으면 beforeunload 로 막는다. 다운로드 완료 여부는 알 길이
 *     없어 [저장] 클릭 시점에 푼다(브라우저는 대개 다운로드 폴더로 바로 저장한다).
 *
 * 이 런타임은 *받은 사람의 브라우저* 용이다 — ASIS 안의 편집은 React 편집 창이 맡는다.
 *
 * UI 문구는 #asis-guide-ui JSON 에서 읽는다(guideCopy 와 같은 언어).
 */
export const GUIDE_RUNTIME_JS = String.raw`
(function () {
  'use strict';
  var ui = JSON.parse(document.getElementById('asis-guide-ui').textContent);
  var body = document.body;
  var dirty = false;

  function fields(root) { return (root || document).querySelectorAll('[data-field]'); }

  function setEditable(on) {
    var list = fields();
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!on) { el.removeAttribute('contenteditable'); continue; }
      // plaintext-only 는 붙여넣기 서식을 막아 준다. 지원 안 하는 브라우저는 대입 시
      // SyntaxError 를 던지므로 그때만 'true' + paste 핸들러로 대신한다.
      try { el.contentEditable = 'plaintext-only'; } catch (err) { el.contentEditable = 'true'; }
    }
  }

  // 지우고 남은 <br> 같은 찌꺼기 → 진짜 빈 칸으로. 빈 칸은 보기 모드에서 숨겨진다.
  function normalize(root) {
    var list = fields(root);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var text = el.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '');
      el.textContent = text.trim() === '' ? '' : text;
    }
  }

  function updateCount() {
    var n = document.querySelectorAll('.step').length;
    var el = document.querySelector('[data-count]');
    if (el) el.textContent = ui.countTemplate.replace('{n}', String(n));
  }

  function setMode(mode) {
    if (mode === 'view') normalize();
    body.setAttribute('data-mode', mode);
    setEditable(mode === 'edit');
  }

  function fileName() {
    var title = document.querySelector('[data-field="title"]').textContent || '';
    var safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return (safe || ui.fileFallback) + '.html';
  }

  // 탭·창 제목(<title>)을 문서 제목 칸과 맞춘다 — 저장 파일명과 받은 사람의 탭 이름.
  function syncTitle() {
    var text = document.querySelector('[data-field="title"]').textContent.trim();
    document.title = text || ui.fileFallback;
  }

  function serialize() {
    normalize();
    syncTitle();
    var clone = document.documentElement.cloneNode(true);
    var cloneBody = clone.querySelector('body');
    cloneBody.setAttribute('data-mode', 'view');
    var editable = clone.querySelectorAll('[contenteditable]');
    for (var i = 0; i < editable.length; i++) editable[i].removeAttribute('contenteditable');
    return '<!doctype html>\n' + clone.outerHTML;
  }

  function save() {
    var blob = new Blob([serialize()], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 다운로드가 blob 을 읽어 갈 시간을 준 뒤 해제한다.
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    dirty = false;
  }

  function moveStep(step, dir) {
    if (dir < 0 && step.previousElementSibling) step.parentNode.insertBefore(step, step.previousElementSibling);
    if (dir > 0 && step.nextElementSibling) step.parentNode.insertBefore(step.nextElementSibling, step);
    dirty = true;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var step = btn.closest('.step');
    if (action === 'edit') setMode('edit');
    else if (action === 'view') setMode('view');
    else if (action === 'save') save();
    else if (action === 'up') moveStep(step, -1);
    else if (action === 'down') moveStep(step, 1);
    else if (action === 'remove') {
      if (!window.confirm(ui.removeConfirm)) return;
      step.remove();
      updateCount();
      dirty = true;
    }
  });

  document.addEventListener('input', function (e) {
    var field = e.target.closest('[data-field]');
    if (!field) return;
    dirty = true;
    if (field.getAttribute('data-field') === 'title') syncTitle();
  });

  // 'true' fallback 경로에서 서식 있는 붙여넣기를 일반 텍스트로.
  document.addEventListener('paste', function (e) {
    var field = e.target.closest && e.target.closest('[data-field]');
    if (!field || field.contentEditable === 'plaintext-only') return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
      return;
    }
    // 제목·단계 문장은 한 줄 — Enter 는 줄바꿈 대신 입력 완료.
    var field = e.target.closest && e.target.closest('[data-field]');
    if (field && field.hasAttribute('data-single-line') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      field.blur();
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  setMode(body.getAttribute('data-mode') === 'edit' ? 'edit' : 'view');
  updateCount();
})();
`;
