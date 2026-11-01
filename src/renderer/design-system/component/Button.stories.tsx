import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Icon } from './Icon';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: '저장', variant: 'secondary', size: 'regular', disabled: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['secondary', 'primary', 'destructive', 'plain'] },
    size: { control: 'inline-radio', options: ['regular', 'large'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 한 창에 primary 는 하나 — 기본 동작(↩)과 같은 버튼이다. */
export const Variants: Story = {
  render: () => (
    <div className="sb-inline">
      <Button variant="primary">캡처 저장</Button>
      <Button>취소</Button>
      <Button variant="destructive">기록 모두 지우기</Button>
      <Button variant="plain">자세히 보기</Button>
      <Button icon={<Icon name="copy" size={14} />}>복사</Button>
      <Button disabled>비활성</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="sb-inline">
      <Button>보통 22px</Button>
      <Button size="large" variant="primary">
        큰 28px
      </Button>
    </div>
  ),
};
