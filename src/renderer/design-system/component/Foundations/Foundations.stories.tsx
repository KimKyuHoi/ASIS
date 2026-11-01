import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorSwatches } from './ColorSwatches';
import { ContrastTable } from './ContrastTable';
import { TokenScales } from './TokenScales';
import { TypeScale } from './TypeScale';

const meta = {
  title: 'Foundations',
  parameters: { a11y: { test: 'off' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 시맨틱 색 — 판마다 실제로 풀린 값. 원시(--p-*) 색은 도메인에서 직접 쓰지 않는다. */
export const Colors: Story = { render: () => <ColorSwatches /> };

export const Typography: Story = { render: () => <TypeScale /> };

export const Scales: Story = { render: () => <TokenScales /> };

/**
 * WCAG 대비 실측 — 각 판(라이트/다크) 안에서 토큰을 풀어 계산한다.
 * 툴바에서 강조색·대비 증가를 바꾸면 다시 잰다.
 */
export const Contrast: Story = { render: () => <ContrastTable /> };
