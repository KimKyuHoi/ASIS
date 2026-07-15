import { defineDict } from '../../i18n/lib/define-dict';

type ChecklistItem = { label: string; hint: string };

type BugReportStrings = {
  eyebrow: string
  title: string
  sub: string
  checklistTitle: string
  checklist: ChecklistItem[]
  /** 보안 이슈 안내 — 문장 중간에 GitHub Issue 링크가 들어간다. */
  noteBefore: string
  noteLink: string
  noteAfter: string
  submitTitle: string
  submitDesc: string
};

export const BUG_REPORT_STRINGS = defineDict<BugReportStrings>({
  ko: {
    eyebrow: '버그 제보',
    title: '버그를 알려주세요',
    sub: '아래 항목을 포함해 적어주시면 훨씬 빠르게 고칠 수 있습니다.',
    checklistTitle: '제보 전 체크리스트',
    checklist: [
      { label: '재현 방법', hint: '버그가 나타나기까지의 단계를 순서대로' },
      { label: 'AS-IS / TO-BE', hint: '무엇을 예상했고 실제로 무엇이 일어났는지' },
      { label: '환경', hint: 'macOS 버전, Apple Silicon / Intel, ASIS 버전' },
    ],
    noteBefore: '심각한 보안 이슈는 공개 댓글 대신',
    noteLink: 'GitHub Issue',
    noteAfter: '로 알려주세요.',
    submitTitle: '버그 제보 남기기',
    submitDesc: 'GitHub 계정으로 로그인해 제보를 남기고 진행 상황을 댓글로 확인할 수 있습니다.',
  },
  en: {
    eyebrow: 'Report a Bug',
    title: 'Tell us about a bug',
    sub: 'Include the details below and we can fix it much faster.',
    checklistTitle: 'Before you report',
    checklist: [
      { label: 'Steps to reproduce', hint: 'List the steps that lead to the bug, in order' },
      { label: 'AS-IS / TO-BE', hint: 'What you expected versus what actually happened' },
      { label: 'Environment', hint: 'macOS version, Apple Silicon / Intel, ASIS version' },
    ],
    noteBefore: 'For serious security issues, please open a',
    noteLink: 'GitHub Issue',
    noteAfter: ' instead of leaving a public comment.',
    submitTitle: 'Leave a bug report',
    submitDesc:
      'Sign in with your GitHub account to file a report and follow its progress in the comments.',
  },
});
