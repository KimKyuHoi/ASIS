import { useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';
import { SegmentedControl } from './SegmentedControl';
import { Select } from './Select';
import { Slider } from './Slider';
import { TextField } from './TextField';
import { Toggle } from './Toggle';

const meta = { title: 'Components/Form controls' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FORMATS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPEG' },
  { value: 'gif', label: 'GIF' },
] as const;

type Format = (typeof FORMATS)[number]['value'];

function SelectDemo(): JSX.Element {
  const [format, setFormat] = useState<Format>('png');
  return <Select aria-label="저장 형식" value={format} options={FORMATS} onChange={setFormat} />;
}

export const PopupButton: Story = { render: () => <SelectDemo /> };

function ToggleDemo(): JSX.Element {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  return (
    <div className="sb-stack">
      <Toggle label="캡처 후 클립보드에 복사" checked={on} onChange={setOn} />
      <Toggle label="로그인 시 열기" checked={off} onChange={setOff} />
      <Toggle label="비활성" checked={false} onChange={setOff} disabled />
    </div>
  );
}

export const Toggles: Story = { render: () => <ToggleDemo /> };

function CheckboxDemo(): JSX.Element {
  const [shadow, setShadow] = useState(true);
  const [cursor, setCursor] = useState(false);
  return (
    <div className="sb-stack">
      <Checkbox label="창 그림자 포함" checked={shadow} onChange={setShadow} />
      <Checkbox label="마우스 커서 포함" hint="녹화와 스크린샷 모두에 적용됩니다" checked={cursor} onChange={setCursor} />
    </div>
  );
}

export const Checkboxes: Story = { render: () => <CheckboxDemo /> };

function SliderDemo(): JSX.Element {
  const [fps, setFps] = useState(15);
  return <Slider label="GIF 프레임" value={fps} min={5} max={30} onChange={setFps} format={(v): string => `${v} fps`} />;
}

export const Sliders: Story = { render: () => <SliderDemo /> };

function SegmentedDemo(): JSX.Element {
  const [mode, setMode] = useState<'area' | 'window' | 'screen'>('area');
  return (
    <SegmentedControl
      label="캡처 범위"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'area', label: '영역' },
        { value: 'window', label: '창' },
        { value: 'screen', label: '전체 화면' },
      ]}
    />
  );
}

/** 화살표 키로 이동 — 네이티브 radio 그룹. */
export const Segmented: Story = { render: () => <SegmentedDemo /> };

function TextFieldDemo(): JSX.Element {
  const [name, setName] = useState('스크린샷 {date}');
  const [folder, setFolder] = useState('');
  return (
    <div className="sb-stack">
      <TextField label="파일 이름" value={name} onChange={setName} hint="{date} 는 캡처 시각으로 바뀝니다" />
      <TextField
        label="저장 폴더"
        value={folder}
        onChange={setFolder}
        placeholder="~/Desktop"
        error={folder === '' ? '저장 폴더를 고르세요. 비워 두면 캡처를 저장할 수 없습니다.' : undefined}
      />
    </div>
  );
}

export const TextFields: Story = { render: () => <TextFieldDemo /> };
