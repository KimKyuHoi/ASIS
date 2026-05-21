import type { JSX } from 'react';
import type { Tool } from '../types/shapes';
import {
  BLUR_RADII,
  FONT_FAMILIES,
  FONT_SIZES,
  MOSAIC_BLOCK_SIZES,
  PALETTE,
  STROKE_WIDTHS,
  useEditorStore,
} from '../lib/store';
import { hexToRgba } from '../lib/color-utils';

const TOOL_ITEMS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: '선택', key: 'V' },
  { tool: 'rect', label: '사각형', key: 'R' },
  { tool: 'ellipse', label: '원', key: 'O' },
  { tool: 'arrow', label: '화살표', key: 'A' },
  { tool: 'line', label: '직선', key: 'L' },
  { tool: 'pen', label: '펜', key: 'P' },
  { tool: 'text', label: '텍스트', key: 'T' },
  { tool: 'step', label: '번호', key: 'S' },
  { tool: 'highlight', label: '하이라이트', key: 'H' },
  { tool: 'blur', label: '블러', key: 'B' },
  { tool: 'mosaic', label: '모자이크', key: 'M' },
  { tool: 'eraser', label: '지우개', key: 'E' },
];

export function Toolbar({
  onCopy,
  onCancel,
  onImageFiles,
  onPin,
  onSaveFolder,
}: {
  onCopy: () => void;
  onCancel: () => void;
  onImageFiles: (files: FileList) => void;
  onPin: () => void;
  onSaveFolder: () => void;
}): JSX.Element {
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const blurRadius = useEditorStore((s) => s.blurRadius);
  const mosaicBlockSize = useEditorStore((s) => s.mosaicBlockSize);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const setBlurRadius = useEditorStore((s) => s.setBlurRadius);
  const setMosaicBlockSize = useEditorStore((s) => s.setMosaicBlockSize);
  const fontSize = useEditorStore((s) => s.fontSize);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const setFontFamily = useEditorStore((s) => s.setFontFamily);
  const updateShape = useEditorStore((s) => s.updateShape);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const shapes = useEditorStore((s) => s.shapes);

  // 선택된 도형들 — toolbar 의 색상/굵기/blur 가 *모든 선택된 도형* 에 즉시 적용.
  const selectedShapes = selectedIds.length > 0
    ? shapes.filter((s) => selectedIds.includes(s.id))
    : [];
  const firstSelected = selectedShapes[0] ?? null;

  // 블러 도구 active 또는 선택 안에 blur 도형 하나라도 있으면 블러 강도 표시.
  const hasBlurSelected = selectedShapes.some((s) => s.kind === 'blur');
  const isBlur = tool === 'blur' || hasBlurSelected;
  // 모자이크 도구 active 또는 선택 안에 mosaic 도형이 있으면 블록 크기 표시.
  const hasMosaicSelected = selectedShapes.some((s) => s.kind === 'mosaic');
  const isMosaic = tool === 'mosaic' || hasMosaicSelected;
  // eraser 활성 시 색상·두께 패널 숨김 (스타일 옵션 무관).
  const isEraser = tool === 'eraser';
  // text/step 도구 활성 또는 text/step 도형 선택 시 폰트 크기 패널 표시.
  const hasTextSelected = selectedShapes.some((s) => s.kind === 'text');
  const hasStepSelected = selectedShapes.some((s) => s.kind === 'step');
  const isText = tool === 'text' || tool === 'step' || hasTextSelected || hasStepSelected;

  const isStroked = (k: string): boolean =>
    k === 'rect' || k === 'ellipse' || k === 'arrow' || k === 'pen';

  // blur 강도 변경: 선택된 blur 도형 *전부* 에 적용. 없으면 default 만 변경.
  const handleBlurRadius = (r: number): void => {
    setBlurRadius(r);
    selectedShapes
      .filter((s) => s.kind === 'blur')
      .forEach((s) => updateShape(s.id, { blurRadius: r }));
  };

  // 모자이크 블록 크기 변경: 선택된 mosaic 도형 *전부* 에 적용.
  const handleMosaicBlockSize = (bs: number): void => {
    setMosaicBlockSize(bs);
    selectedShapes
      .filter((s) => s.kind === 'mosaic')
      .forEach((s) => updateShape(s.id, { blockSize: bs }));
  };

  // 폰트 크기 변경: 선택된 text/step 도형 *전부* 에 적용.
  const handleFontSize = (s: number): void => {
    setFontSize(s);
    selectedShapes
      .filter((sh) => sh.kind === 'text' || sh.kind === 'step')
      .forEach((sh) => updateShape(sh.id, { fontSize: s }));
  };

  // 폰트 패밀리 변경: 선택된 text 도형 *전부* 에 적용.
  const handleFontFamily = (f: string): void => {
    setFontFamily(f);
    selectedShapes
      .filter((sh) => sh.kind === 'text')
      .forEach((sh) => updateShape(sh.id, { fontFamily: f } as Partial<typeof sh>));
  };

  // 색상 변경: 선택된 도형 *모두* 에 종류별 적합한 필드로 patch.
  const handleColor = (c: string): void => {
    setColor(c);
    if (selectedShapes.length === 0) return;
    selectedShapes.forEach((s) => {
      if (s.kind === 'highlight') {
        updateShape(s.id, { fill: hexToRgba(c, 0.4) });
      } else if (s.kind === 'text' || s.kind === 'step') {
        updateShape(s.id, { fill: c });
      } else if (isStroked(s.kind)) {
        updateShape(s.id, { stroke: c });
      }
    });
  };

  // stroke width 변경: 선택된 stroked 도형 *모두* 에 적용.
  const handleStrokeWidth = (w: number): void => {
    setStrokeWidth(w);
    selectedShapes
      .filter((s) => isStroked(s.kind))
      .forEach((s) => updateShape(s.id, { strokeWidth: w }));
  };

  // 표시 값 — 단일 선택일 때만 그 값, 아니면 default.
  const displayFontSize = (firstSelected?.kind === 'text' || firstSelected?.kind === 'step') && selectedShapes.length === 1
    ? firstSelected.fontSize
    : fontSize;
  const displayFontFamily = firstSelected?.kind === 'text' && selectedShapes.length === 1
    ? firstSelected.fontFamily
    : fontFamily;
  const displayBlurRadius = firstSelected?.kind === 'blur' && selectedShapes.length === 1
    ? firstSelected.blurRadius
    : blurRadius;
  const displayMosaicBlockSize = firstSelected?.kind === 'mosaic' && selectedShapes.length === 1
    ? firstSelected.blockSize
    : mosaicBlockSize;
  const displayStrokeWidth = ((): number => {
    if (
      selectedShapes.length === 1 &&
      firstSelected &&
      (firstSelected.kind === 'rect' ||
        firstSelected.kind === 'ellipse' ||
        firstSelected.kind === 'arrow' ||
        firstSelected.kind === 'pen')
    ) {
      return firstSelected.strokeWidth;
    }
    return strokeWidth;
  })();

  return (
    <div
      className="toolbar"
      onMouseDown={(e): void => {
        // TextEditor의 window mousedown 리스너가 toolbar 클릭을 외부 클릭으로 오인해
        // 편집 모드를 종료하지 않도록 native 이벤트 전파를 차단한다.
        // Chromium custom select popup이 DOM 트리 밖에 렌더링되어 .toolbar 체크를
        // 우회하는 경우도 함께 방어한다.
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <div className="toolbar__group">
        {TOOL_ITEMS.map((item) => (
          <ToolButton
            key={item.tool}
            label={item.label}
            shortcut={item.key}
            active={tool === item.tool}
            onClick={(): void => setTool(item.tool)}
          />
        ))}
      </div>

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="toolbar__group toolbar__group--colors">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`color ${color === c ? 'color--active' : ''}`}
            style={{ background: c }}
            onClick={(): void => handleColor(c)}
            aria-label={`색상 ${c}`}
          />
        ))}
        <label className="color color--custom" title="커스텀 색상">
          <input
            type="color"
            value={color}
            onChange={(e): void => handleColor(e.target.value)}
          />
        </label>
      </div>

      <div className="toolbar__divider" aria-hidden="true" />

      {!isEraser && (isBlur ? (
        <div className="toolbar__group toolbar__group--slider">
          <span className="slider-label">블러</span>
          {BLUR_RADII.map((r) => (
            <button
              key={r}
              type="button"
              className={`radius ${displayBlurRadius === r ? 'radius--active' : ''}`}
              onClick={(): void => handleBlurRadius(r)}
              title={`블러 ${r}px`}
            >
              {r}
            </button>
          ))}
        </div>
      ) : isMosaic ? (
        <div className="toolbar__group toolbar__group--slider">
          <span className="slider-label">블록</span>
          {MOSAIC_BLOCK_SIZES.map((bs) => (
            <button
              key={bs}
              type="button"
              className={`radius ${displayMosaicBlockSize === bs ? 'radius--active' : ''}`}
              onClick={(): void => handleMosaicBlockSize(bs)}
              title={`블록 ${bs}px`}
            >
              {bs}
            </button>
          ))}
        </div>
      ) : isText ? (
        <>
          <div className="toolbar__group">
            <span className="slider-label">폰트</span>
            <select
              className="font-select"
              value={displayFontFamily}
              onChange={(e): void => handleFontFamily(e.target.value)}
              title="폰트 변경"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="toolbar__group toolbar__group--slider">
            <span className="slider-label">크기</span>
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={`radius ${displayFontSize === s ? 'radius--active' : ''}`}
                onClick={(): void => handleFontSize(s)}
                title={`${s}px`}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="toolbar__group toolbar__group--strokes">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={`stroke ${displayStrokeWidth === w ? 'stroke--active' : ''}`}
              onClick={(): void => handleStrokeWidth(w)}
              aria-label={`두께 ${w}px`}
              title={`${w}px`}
            >
              <span
                className="stroke__dot"
                style={{
                  width: Math.min(w, 14),
                  height: Math.min(w, 14),
                }}
              />
            </button>
          ))}
        </div>
      ))}

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="toolbar__group">
        <ToolbarButton
          label="실행 취소"
          shortcut="⌘Z"
          disabled={past.length === 0}
          onClick={undo}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          label="다시 실행"
          shortcut="⌘⇧Z"
          disabled={future.length === 0}
          onClick={redo}
        >
          ↷
        </ToolbarButton>
        <label
          className="iconbtn"
          title="이미지 첨부 (드롭 · ⌘V 도 가능)"
        >
          <ImageIcon />
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e): void => {
              if (e.target.files && e.target.files.length > 0) {
                onImageFiles(e.target.files);
              }
              // 같은 파일 재선택 가능하도록 reset.
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          className="iconbtn"
          onClick={onPin}
          title="화면에 핀 — 위에 떠있는 윈도우로 박아두기"
        >
          <PinIcon />
        </button>
        <button
          type="button"
          className="iconbtn"
          onClick={onSaveFolder}
          title="폴더에 저장 — ~/Pictures/ASIS/ 에 자동 저장 (⌘S 는 다른 이름으로 저장)"
        >
          <SaveFolderIcon />
        </button>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group toolbar__group--actions">
        <button
          type="button"
          className="action action--secondary"
          onClick={onCancel}
        >
          취소
        </button>
        <button
          type="button"
          className="action action--primary"
          onClick={onCopy}
        >
          복사
          <span className="action__hint">⌘C</span>
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  active,
  onClick,
}: {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`tool ${active ? 'tool--active' : ''}`}
      onClick={onClick}
      title={`${label} (${shortcut})`}
    >
      <span className="tool__label">{label}</span>
      <span className="tool__shortcut">{shortcut}</span>
    </button>
  );
}

/**
 * lucide 의 `image` 아이콘 inline 사본 — 의존성 없이 stroke 기반 SVG.
 * 24×24 viewBox, currentColor 로 부모 색 상속.
 * 출처: https://lucide.dev/icons/image (path 만 발췌, 라이선스: ISC).
 */
function ImageIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/**
 * lucide 의 `pin` 아이콘 — 떠있는 핀 윈도우 띄우기 액션.
 * 출처: https://lucide.dev/icons/pin (path 만 발췌, 라이선스: ISC).
 */
function PinIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

/**
 * lucide 의 `folder-down` 아이콘 — 폴더 저장 액션.
 * 출처: https://lucide.dev/icons/folder-down (path 발췌, 라이선스: ISC).
 */
function SaveFolderIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M12 10v6" />
      <path d="m15 13-3 3-3-3" />
    </svg>
  );
}


function ToolbarButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className="iconbtn"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${shortcut})`}
    >
      {children}
    </button>
  );
}
