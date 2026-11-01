import { useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Toolbar, ToolbarSeparator } from './Toolbar';
import { Tooltip } from './Tooltip';

const meta = { title: 'Components/Toolbar', component: Toolbar } satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof Toolbar>;

const TOOLS: { id: IconName; label: string }[] = [
  { id: 'rect', label: '사각형' },
  { id: 'arrow', label: '화살표' },
  { id: 'pen', label: '펜' },
  { id: 'text', label: '텍스트' },
];

function AnnotationToolbar(): JSX.Element {
  const [tool, setTool] = useState<IconName>('rect');
  return (
    <Toolbar label="주석 도구">
      {TOOLS.map((item) => (
        <IconButton
          key={item.id}
          label={item.label}
          icon={<Icon name={item.id} />}
          pressed={tool === item.id}
          onClick={(): void => setTool(item.id)}
        />
      ))}
      <ToolbarSeparator />
      <IconButton label="자르기" icon={<Icon name="crop" />} />
      <IconButton label="복사" icon={<Icon name="copy" />} />
    </Toolbar>
  );
}

/** Tab 한 번으로 들어와 ←/→/Home/End 로 이동한다. */
export const Annotation: Story = { render: () => <AnnotationToolbar /> };

export const WithTooltip: Story = {
  render: () => (
    <div style={{ paddingBottom: 40 }}>
      <Tooltip content="설정 열기 (⌘,)">
        {(trigger): JSX.Element => <IconButton label="설정" icon={<Icon name="gear" />} {...trigger} />}
      </Tooltip>
    </div>
  ),
};
