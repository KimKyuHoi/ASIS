import { useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { HudPill } from './Hud';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  args: { label: '설정', icon: <Icon name="gear" /> },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

function PressedDemo(): JSX.Element {
  const [pen, setPen] = useState(true);
  return (
    <div className="sb-inline">
      <IconButton label="펜" icon={<Icon name="pen" />} pressed={pen} onClick={(): void => setPen(!pen)} />
      <IconButton label="삭제" icon={<Icon name="trash" />} />
      <IconButton label="비활성" icon={<Icon name="crop" />} disabled />
    </div>
  );
}

/** pressed 가 있으면 토글 버튼(aria-pressed). 도구 선택에 쓴다. */
export const Pressed: Story = { render: () => <PressedDemo /> };

export const OnHud: Story = {
  render: () => (
    <div className="sb-desktop">
      <HudPill label="캡처 도구">
        <IconButton tone="hud" label="영역" icon={<Icon name="crop" />} pressed />
        <IconButton tone="hud" label="창" icon={<Icon name="photo" />} />
        <IconButton tone="hud" label="닫기" icon={<Icon name="close" />} />
      </HudPill>
    </div>
  ),
};
