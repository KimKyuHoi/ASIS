import type { Dispatch, JSX, SetStateAction } from 'react';
import type { Language } from '../../../../shared/i18n/language';
import { Button, Checkbox, Group, Row, Select, Slider } from '../../../design-system/component';
import { GIF_FPS_OPTIONS, PIN_OPACITY_RANGE } from '../../lib/settings-defaults';
import type { settingsStrings } from '../../lib/strings';
import type { MiscConfig } from '../../types/misc-config';

type Strings = (typeof settingsStrings)[Language];

/** 표시 언어 — 저장 버튼과 무관하게 즉시 전체 앱(트레이·메뉴·모든 창)에 반영된다. */
export function LanguageGroup({ t, lang }: { t: Strings; lang: Language }): JSX.Element {
  const options = [
    { value: 'ko', label: t.languageKo },
    { value: 'en', label: t.languageEn },
  ] as const;
  return (
    <Group title={t.languageSection}>
      <Row label={t.languageLabel} htmlFor="language">
        <Select
          id="language"
          value={lang}
          options={options}
          onChange={(next): void => {
            // 목록 밖 값은 Select 가 throw 한다 — 여기 오는 값은 항상 ko/en.
            window.i18n.setLanguage(next).catch((err: unknown) => {
              console.error('[asis settings] setLanguage failed', err);
            });
          }}
        />
      </Row>
    </Group>
  );
}

type FolderGroupProps = { t: Strings; folderPath: string; onPick: () => void };

export function FolderGroup({ t, folderPath, onPick }: FolderGroupProps): JSX.Element {
  // 빈 문자열 = 사용자가 고른 적 없음 → 기본 위치 안내 문구.
  const shown = folderPath === '' ? t.folderDefault : folderPath;
  return (
    <Group title={t.folderSection}>
      <Row label={<span className="settings-path" title={shown}>{shown}</span>}>
        <Button onClick={onPick}>{t.change}</Button>
      </Row>
    </Group>
  );
}

type GeneralGroupProps = {
  t: Strings;
  misc: MiscConfig;
  setMisc: Dispatch<SetStateAction<MiscConfig>>;
};

/** 이미지 캡처 후 동작 — 에디터 / 바로 복사 / 퀵 액세스 썸네일. */
function AfterCaptureRow({ t, misc, setMisc }: GeneralGroupProps): JSX.Element {
  return (
    <Row label={t.afterCapture} htmlFor="afterCapture">
      <Select
        id="afterCapture"
        value={misc.afterCapture}
        options={[
          { value: 'editor', label: t.afterCaptureEditor },
          { value: 'clipboard', label: t.afterCaptureClipboard },
        ]}
        onChange={(value): void => setMisc((prev) => ({ ...prev, afterCapture: value }))}
      />
    </Row>
  );
}

/** 일반 — 저장 버튼을 눌러야 반영된다(폼). 그래서 스위치가 아니라 체크박스. */
export function GeneralGroup({ t, misc, setMisc }: GeneralGroupProps): JSX.Element {
  const update = <F extends keyof MiscConfig>(field: F, value: MiscConfig[F]): void => {
    setMisc((prev) => ({ ...prev, [field]: value }));
  };
  const fpsOptions = GIF_FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` }));
  return (
    <Group title={t.generalSection}>
      <Row label={t.appearance} htmlFor="appearance">
        <Select
          id="appearance"
          value={misc.appearance}
          options={[
            { value: 'system', label: t.appearanceSystem },
            { value: 'light', label: t.appearanceLight },
            { value: 'dark', label: t.appearanceDark },
          ]}
          onChange={(value): void => update('appearance', value)}
        />
      </Row>
      <Row label={t.fullscreenScope} htmlFor="fullscreenScope">
        <Select
          id="fullscreenScope"
          value={misc.fullscreenScope}
          options={[
            { value: 'cursor', label: t.fullscreenScopeCursor },
            { value: 'all', label: t.fullscreenScopeAll },
          ]}
          onChange={(value): void => update('fullscreenScope', value)}
        />
      </Row>
      <Row label={t.gifFps} htmlFor="gifFps">
        <Select
          id="gifFps"
          value={String(misc.gifFps)}
          options={fpsOptions}
          onChange={(value): void => update('gifFps', Number(value))}
        />
      </Row>
      <AfterCaptureRow t={t} misc={misc} setMisc={setMisc} />
      <Row label={t.gifAfterRecord} htmlFor="gifAfterRecord">
        <Select
          id="gifAfterRecord"
          value={misc.gifAfterRecord}
          options={[
            { value: 'editor', label: t.gifAfterEditor },
            { value: 'save', label: t.gifAfterSave },
            { value: 'clipboard', label: t.gifAfterClipboard },
          ]}
          onChange={(value): void => update('gifAfterRecord', value)}
        />
      </Row>
      <RecordInputRows t={t} misc={misc} update={update} />
      <Row label={t.pinOpacity}>
        <Slider
          label={t.pinOpacity}
          hideLabel
          className="settings-slider"
          value={Math.round(misc.pinDefaultOpacity * 100)}
          {...PIN_OPACITY_RANGE}
          format={(v): string => `${v}%`}
          onChange={(v): void => update('pinDefaultOpacity', v / 100)}
        />
      </Row>
      <Row>
        <Checkbox
          label={t.captureSound}
          checked={misc.captureSound}
          onChange={(checked): void => update('captureSound', checked)}
        />
      </Row>
      <Row>
        <Checkbox
          label={t.openAtLogin}
          checked={misc.openAtLogin}
          onChange={(checked): void => update('openAtLogin', checked)}
        />
      </Row>
    </Group>
  );
}

type RecordInputRowsProps = {
  t: Strings;
  misc: MiscConfig;
  update: (field: 'recordShowClicks' | 'recordShowKeys', value: boolean) => void;
};

/** GIF·화면 녹화에 클릭 링·단축키 배지를 그릴지 — 두 녹화가 같은 값을 쓴다. */
function RecordInputRows({ t, misc, update }: RecordInputRowsProps): JSX.Element {
  return (
    <>
      <Row>
        <Checkbox
          label={t.recordShowClicks}
          checked={misc.recordShowClicks}
          onChange={(checked): void => update('recordShowClicks', checked)}
        />
      </Row>
      <Row>
        <Checkbox
          label={t.recordShowKeys}
          hint={t.recordShowKeysHint}
          checked={misc.recordShowKeys}
          onChange={(checked): void => update('recordShowKeys', checked)}
        />
      </Row>
    </>
  );
}
