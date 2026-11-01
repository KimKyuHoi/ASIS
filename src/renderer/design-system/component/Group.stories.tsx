import { useState, type JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { Group, Row } from './Group';
import { KeyCap } from './KeyCap';
import { Select } from './Select';
import { Toggle } from './Toggle';

const meta = { title: 'Components/Group & Row', component: Group } satisfies Meta<typeof Group>;

export default meta;
type Story = StoryObj<typeof Group>;

const APPEARANCES = [
  { value: 'system', label: '시스템 설정 따르기' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
] as const;

function SettingsDemo(): JSX.Element {
  const [appearance, setAppearance] = useState<(typeof APPEARANCES)[number]['value']>('system');
  const [sound, setSound] = useState(true);
  return (
    <div className="sb-stack" style={{ maxWidth: 520 }}>
      <Group title="일반">
        <Row label="외형" htmlFor="appearance">
          <Select id="appearance" value={appearance} options={APPEARANCES} onChange={setAppearance} />
        </Row>
        <Row label="셔터 소리" hint="캡처할 때 소리를 냅니다">
          <Toggle aria-label="셔터 소리" checked={sound} onChange={setSound} />
        </Row>
      </Group>
      <Group title="단축키" footer="다른 앱과 겹치면 단축키가 동작하지 않을 수 있습니다.">
        <Row label="영역 캡처">
          <KeyCap shortcut="CommandOrControl+Shift+4" />
        </Row>
        <Row label="화면 녹화">
          <KeyCap shortcut="CommandOrControl+Shift+5" />
        </Row>
        <Row label="기록">
          <Button>기록 열기</Button>
        </Row>
      </Group>
    </div>
  );
}

/** 설정 화면 구성 — 섹션 제목은 문장형(대문자·자간 X). */
export const SettingsForm: Story = { render: () => <SettingsDemo /> };
