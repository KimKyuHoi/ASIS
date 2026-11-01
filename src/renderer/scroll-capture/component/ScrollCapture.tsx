import { useState, type JSX } from 'react';
import { RecordingHud } from '../../design-system/component';
import { useLanguage } from '../../../shared/i18n/use-language';
import { useScrollCaptureSession } from '../hook/useScrollCaptureSession';
import { DirectionPicker } from './DirectionPicker';
import { scrollCaptureStrings } from '../lib/strings';

type Mode = 'auto' | 'manual';

/** main 이 쿼리스트링으로 넘긴 캡처 모드 — 창 수명 동안 고정이라 모듈 스코프에서 한 번 읽는다. */
function readMode(): Mode {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode !== 'auto' && mode !== 'manual') {
    throw new Error(`scroll-capture: 알 수 없는 mode 쿼리 (${String(mode)})`);
  }
  return mode;
}
const MODE = readMode();

/**
 * 스크롤 캡처 컨트롤 윈도우 — GIF·화면 녹화와 같은 녹화 알약(design-system RecordingHud).
 *
 * 상태
 *   - choose(auto 만): 화살표(↑/↓) 로 자동 스크롤 방향을 고른다. 고르기 전에도 캡처는 돌고 있어
 *     직접 스크롤해도 된다.
 *   - capturing: REC + mm:ss + "N장 · 높이 Hpx"(끊긴 구간이 생기면 경고) + 정지/취소.
 *     auto(손쉬운 사용 권한 있음) 는 main 이 끝까지 스크롤하고, manual 은 사용자가 스크롤하는
 *     만큼 찍는다. 툴팁에 모드별 사용법과 정지 방법.
 *   - stitching: 정지 후 프레임들을 세로로 이어붙이는 동안(스피너). 끝나면 main 이
 *     저장 다이얼로그를 처리하고 윈도우를 닫는다.
 */
export default function ScrollCapture(): JSX.Element {
  const t = scrollCaptureStrings[useLanguage()];
  const { phase, seconds, progress, stop, cancel } = useScrollCaptureSession();
  const stitching = phase === 'stitching';
  const howTo = MODE === 'auto' ? t.howToAuto : t.howTo;
  // auto 는 방향을 고를 때까지 선택 알약을 보인다(창 수명 동안 한 번).
  const [chosen, setChosen] = useState(MODE !== 'auto');

  if (!chosen && !stitching) {
    return (
      <DirectionPicker
        label={t.hudLabelAuto}
        prompt={t.choosePrompt}
        up={{ label: t.up, title: t.upTitle }}
        down={{ label: t.down, title: t.downTitle }}
        cancel={{ label: t.cancel, title: t.cancelTitle, onClick: cancel }}
        stop={{ label: t.stop, title: t.stopTitle, onClick: stop }}
        onChoose={(direction): void => {
          setChosen(true);
          window.scrollCapture.chooseDirection(direction);
        }}
      />
    );
  }
  const capturingDetail =
    progress.gaps > 0
      ? t.progressWithGaps(progress.frames, progress.height, progress.gaps)
      : t.progress(progress.frames, progress.height);

  return (
    <RecordingHud
      label={MODE === 'auto' ? t.hudLabelAuto : t.hudLabel}
      badge={t.rec}
      seconds={seconds}
      detail={stitching ? t.stitchingCount(progress.frames) : capturingDetail}
      detailTitle={stitching ? undefined : howTo}
      busyMessage={stitching ? t.stitching : undefined}
      cancel={{ label: t.cancel, title: t.cancelTitle, onClick: cancel }}
      stop={{ label: t.stop, title: t.stopTitle, onClick: stop }}
    />
  );
}
