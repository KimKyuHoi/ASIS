import { useRef, useState, type JSX } from 'react';
import type { GifStudioMedia } from '../../../../main/gif-studio/types';
import { useFitScale } from '../../hook/useFitScale';
import { useAnnotationKeyboard } from '../../hook/useAnnotationKeyboard';
import { useCloseFlow } from '../../hook/useCloseFlow';
import { useFrameBackground } from '../../hook/useFrameBackground';
import { useFrameNav } from '../../hook/useFrameNav';
import { useFrames } from '../../hook/useFrames';
import { useGifExport } from '../../hook/useGifExport';
import { usePlayback } from '../../hook/usePlayback';
import { useFrameGridSync } from '../../hook/useFrameGridSync';
import { useTrim } from '../../hook/useTrim';
import {
  defaultSettings,
  estimateBytes,
  outputDuration,
  toExportOptions,
} from '../../lib/export-settings';
import { ActionBar } from './ActionBar';
import { BusyOverlay, NoticeToast } from './ExportStatus';
import { ExportPanel } from './ExportPanel';
import { FrameActions } from './FrameActions';
import { FrameBar } from './FrameBar';
import { FrameEditor } from './FrameEditor';
import { GifToolbar } from './GifToolbar';
import { PlaybackOverlay } from './PlaybackOverlay';
import { Transport } from './Transport';

/**
 * 미디어 하나를 편집하는 작업 공간 — 상위가 미디어마다 key 를 바꿔 마운트하므로
 * 트림·출력 설정 state 는 미디어가 바뀌면 자동으로 초기화된다.
 *
 * 멈춰 있으면 지금 프레임을 이미지 에디터로 편집하고(FrameEditor), 재생하면 영상 위에
 * 프레임별 주석을 겹쳐 보여 준다(PlaybackOverlay). <video> 는 두 모드 모두 붙어 있다 —
 * 편집 배경·내보내기 배경 캡처도 이 video 로 뜬다.
 */
export function Workspace({
  media,
  videoUrl,
  filmstripUrl,
}: {
  media: GifStudioMedia;
  videoUrl: string;
  filmstripUrl: string;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewBox, setPreviewBox] = useState<HTMLDivElement | null>(null);
  const scale = useFitScale(previewBox, media.width, media.height);
  const trim = useTrim(media.duration);
  const { start, end } = trim;
  const [settings, setSettings] = useState(() => defaultSettings(media));
  const playback = usePlayback(videoRef, { start, end, speed: settings.speed });
  const nav = useFrameNav(playback);
  const frames = useFrames();
  const exporter = useGifExport(videoRef, media.path);
  const closing = useCloseFlow();
  useAnnotationKeyboard({ ...nav, busy: exporter.busy !== null, escape: closing.escape });
  useFrameBackground(videoRef, frames, nav.playing);

  useFrameGridSync({ start, end }, settings.fps, settings.speed);

  return (
    <div className="workspace">
      <GifToolbar disabled={nav.playing} />
      <div className="preview" ref={setPreviewBox}>
        <div
          className={`preview__frame${nav.playing ? '' : ' preview__frame--hidden'}`}
          style={{ width: media.width * scale, height: media.height * scale }}
        >
          <video
            ref={videoRef}
            className="preview__video"
            src={videoUrl}
            muted
            playsInline
            onEnded={playback.onEnded}
          />
          {nav.playing && scale > 0 ? (
            <PlaybackOverlay scale={scale} width={media.width} height={media.height} />
          ) : null}
        </div>
        {nav.playing ? null : (
          <FrameEditor
            contextMenu={closing.contextMenu}
            setContextMenu={closing.setContextMenu}
          />
        )}
      </div>
      <Transport
        nav={nav}
        filmstripUrl={filmstripUrl}
        duration={media.duration}
        trim={trim}
      />
      <FrameBar nav={nav} />
      <FrameActions nav={nav} />
      <ExportPanel media={media} settings={settings} onChange={setSettings} />
      <ActionBar
        estimatedBytes={estimateBytes(start, end, settings)}
        duration={outputDuration(start, end, settings)}
        busy={exporter.busy !== null}
        onClose={closing.requestClose}
        onExport={(target): void => {
          // 블러·모자이크 배경을 video 로 떠야 하므로 재생을 멈추고 굽는다.
          if (nav.playing) nav.togglePlay();
          exporter.run(target, toExportOptions(start, end, settings));
        }}
      />
      <Overlays exporter={exporter} />
    </div>
  );
}

/** 창 위에 뜨는 것 — 결과 알림, 내보내기 진행 모달. */
function Overlays({ exporter }: { exporter: ReturnType<typeof useGifExport> }): JSX.Element {
  return (
    <>
      {exporter.notice ? (
        <NoticeToast notice={exporter.notice} onChange={exporter.setNotice} />
      ) : null}
      {exporter.busy === null ? null : (
        <BusyOverlay busy={exporter.busy} onCancel={exporter.cancel} />
      )}
    </>
  );
}
