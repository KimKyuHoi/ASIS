import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { Toast } from './Toast';

const meta = { title: 'Components/Feedback' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Badges: Story = {
  render: () => (
    <div className="sb-inline">
      <Badge>초안</Badge>
      <Badge tone="accent">새 기능</Badge>
      <Badge tone="success">저장됨</Badge>
      <Badge tone="warning">권한 필요</Badge>
      <Badge tone="danger">실패</Badge>
    </div>
  ),
};

/** 동작 이름과 같은 말로 결과를 알린다 — "복사" → "복사했습니다". 항상 어두운 HUD. */
export const Toasts: Story = {
  render: () => (
    <div className="sb-desktop" style={{ flexDirection: 'column' }}>
      <Toast tone="success" icon={<Icon name="check" />} title="클립보드에 복사했습니다" onDismiss={(): void => undefined} />
      <Toast
        icon={<Icon name="photo" />}
        title="캡처를 저장했습니다"
        description="스크린샷 2026-11-01 14.02.11.png"
        action={<Button size="regular">Finder에서 보기</Button>}
      />
      <Toast
        tone="danger"
        title="화면 녹화 권한이 없습니다"
        description="시스템 설정 › 개인정보 보호 › 화면 녹화에서 ASIS를 켜세요."
      />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <EmptyState
      icon={<Icon name="photo" size={32} />}
      title="아직 캡처 기록이 없습니다"
      description="⌘⇧4 로 화면 일부를 캡처하면 여기에 모입니다."
      action={<Button variant="primary">지금 캡처하기</Button>}
    />
  ),
};
