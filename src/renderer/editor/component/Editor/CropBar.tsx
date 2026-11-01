import type { JSX } from 'react';
import { Button } from '../../../design-system/component';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import { useEditorStore } from '../../lib/store';
import { commitCrop, isUsableCrop } from '../../lib/crop';

/**
 * 크롭 모드 안내 막대 — 캔버스 위쪽 가운데. 안내 문구 + 결과 크기 + [취소][적용].
 * 크기는 결과 이미지의 *물리 픽셀* (복사·저장되는 크기) 로 보여 준다.
 */
export function CropBar({ bgImage }: { bgImage: HTMLImageElement }): JSX.Element | null {
  const t = editorStrings[useLanguage()];
  const cropping = useEditorStore((s) => s.cropping);
  const rect = useEditorStore((s) => s.cropRect);
  const imageWidth = useEditorStore((s) => s.imageWidth);
  const cancelCrop = useEditorStore((s) => s.cancelCrop);
  if (!cropping) return null;
  const ratio = imageWidth > 0 ? bgImage.naturalWidth / imageWidth : 1;
  const usable = isUsableCrop(rect);

  const apply = (): void => {
    commitCrop(bgImage).catch((err: unknown) => {
      console.error('[asis editor] 크롭 적용 실패', err);
    });
  };

  return (
    <div
      className="editor__crop-bar"
      role="toolbar"
      aria-label={t.toolbar.crop}
      // TextEditor 의 window mousedown 처럼 바깥 클릭 감지가 막대 클릭을 오인하지 않게.
      onMouseDown={(e): void => e.nativeEvent.stopImmediatePropagation()}
    >
      <span className="editor__crop-hint">{usable ? t.crop.hintAdjust : t.crop.hintEmpty}</span>
      {usable ? (
        <span className="editor__crop-size tabular">
          {t.crop.size(Math.round(rect.w * ratio), Math.round(rect.h * ratio))}
        </span>
      ) : null}
      <Button variant="secondary" onClick={cancelCrop}>
        {t.crop.cancel}
      </Button>
      <Button variant="primary" onClick={apply} disabled={!usable}>
        {t.crop.apply}
        <span className="action__hint">↵</span>
      </Button>
    </div>
  );
}
