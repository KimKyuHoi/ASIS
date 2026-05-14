import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Editor from './component/Editor';
import { ensureEditorIpcBridge } from './lib/ipc-init';
import './asset/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('어노테이션 에디터의 #root 를 찾지 못했다.');
}

// React 컴포넌트 mount *전* IPC bridge 초기화 — main → renderer 메시지를
// 컴포넌트 lifecycle 과 무관하게 모듈 스코프에서 한 번만 잡는다.
ensureEditorIpcBridge();

createRoot(rootElement).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);
