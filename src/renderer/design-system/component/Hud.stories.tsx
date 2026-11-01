import type { Meta, StoryObj } from '@storybook/react-vite';
import { CaptureFrame } from './CaptureFrame';
import { HudButton, HudPill, RecDot } from './Hud';
import { RecordingHud } from './RecordingHud';

const meta = { title: 'Components/HUD & Capture frame' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 화면 위에 뜨는 녹화 HUD. 밝은/어두운 화면 어디에 떠도 읽히도록 항상 어둡다. */
export const RecordingPill: Story = {
  render: () => (
    <div className="sb-desktop">
      <HudPill label="녹화 제어">
        <RecDot />
        <span className="tabular">00:12</span>
        <HudButton>일시정지</HudButton>
        <HudButton variant="stop">정지</HudButton>
      </HudPill>
    </div>
  ),
};

const noop = (): void => undefined;
const ACTIONS = {
  cancel: { label: '취소', title: '취소 (ESC)', onClick: noop },
  stop: { label: '정지', title: '정지 (Enter)', onClick: noop },
};

/** GIF 녹화·화면 녹화 창이 함께 쓰는 녹화 알약 — 녹화 중 / 처리 중. */
export const Recording: Story = {
  render: () => (
    <div className="sb-desktop sb-stack">
      <RecordingHud label="GIF 녹화" badge="REC" seconds={83} detail="1245프레임" {...ACTIONS} />
      <RecordingHud label="GIF 녹화" badge="REC" seconds={83} detail="1245프레임 인코딩" busyMessage="GIF 만드는 중…" {...ACTIONS} />
    </div>
  ),
};

/**
 * ASIS 의 시그니처 — 캡처 프레임. 얇은 선 + 네 모서리 브래킷.
 * 개성은 여기에만 쓴다. 나머지 UI 는 macOS 네이티브처럼 조용하게.
 */
export const Frame: Story = {
  render: () => (
    <div className="sb-desktop" style={{ gap: 64, minHeight: 300 }}>
      <CaptureFrame width={220} height={140} showSize />
      <CaptureFrame width={220} height={140} tone="accent" />
      <CaptureFrame width={220} height={140} tone="recording" />
      <CaptureFrame width={220} height={140} tone="measure" />
    </div>
  ),
};
