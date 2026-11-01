import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { KeyCap } from './KeyCap';
import { Titlebar } from './Titlebar';

const meta = { title: 'Components/Window chrome' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** hiddenInset 창 헤더 — 왼쪽 80px 은 신호등 자리. */
export const TitlebarStory: Story = {
  name: 'Titlebar',
  render: () => (
    <div style={{ border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--radius-window)', overflow: 'hidden' }}>
      <Titlebar
        title="GIF 스튜디오"
        subtitle="녹화 2026-11-01.gif · 1280 × 720"
        actions={
          <>
            <IconButton label="설정" icon={<Icon name="gear" />} />
            <Button variant="primary">내보내기</Button>
          </>
        }
      />
      <div style={{ height: 120, background: 'var(--surface-under-page)' }} />
    </div>
  ),
};

export const KeyCaps: Story = {
  render: () => (
    <div className="sb-inline">
      <KeyCap shortcut="CommandOrControl+Shift+4" />
      <KeyCap shortcut={['shift', 'cmd', '5']} />
      <KeyCap shortcut="Alt+Space" />
      <KeyCap shortcut="Escape" />
    </div>
  ),
};
