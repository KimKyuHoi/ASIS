import type { JSX } from 'react';
import type { DashStyle, TextAlign, Tool } from '../types/shapes';
import { DASH_STYLES, dashPattern } from '../lib/dash';
import {
  BLUR_RADII,
  FONT_FAMILIES,
  FONT_SIZES,
  LINE_HEIGHTS,
  MOSAIC_BLOCK_SIZES,
  PALETTE,
  STROKE_WIDTHS,
  ZOOM_MAX,
  ZOOM_MIN,
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
  const dash = useEditorStore((s) => s.dash);
  const blurRadius = useEditorStore((s) => s.blurRadius);
  const mosaicBlockSize = useEditorStore((s) => s.mosaicBlockSize);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const setDash = useEditorStore((s) => s.setDash);
  const setBlurRadius = useEditorStore((s) => s.setBlurRadius);
  const setMosaicBlockSize = useEditorStore((s) => s.setMosaicBlockSize);
  const fontSize = useEditorStore((s) => s.fontSize);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const setFontFamily = useEditorStore((s) => s.setFontFamily);
  const textAlign = useEditorStore((s) => s.textAlign);
  const setTextAlign = useEditorStore((s) => s.setTextAlign);
  const lineHeight = useEditorStore((s) => s.lineHeight);
  const setLineHeight = useEditorStore((s) => s.setLineHeight);
  const updateShape = useEditorStore((s) => s.updateShape);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const shapes = useEditorStore((s) => s.shapes);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);

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
  // 정렬·줄간격은 text 전용 (step 제외).
  const showTextFormatting = tool === 'text' || hasTextSelected;

  const isStroked = (k: string): boolean =>
    k === 'rect' || k === 'ellipse' || k === 'arrow' || k === 'line' || k === 'pen';

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

  // 텍스트 정렬 변경: 선택된 text 도형 *전부* 에 적용.
  const handleTextAlign = (a: TextAlign): void => {
    setTextAlign(a);
    selectedShapes
      .filter((sh) => sh.kind === 'text')
      .forEach((sh) => updateShape(sh.id, { align: a } as Partial<typeof sh>));
  };

  // 줄간격 변경: 선택된 text 도형 *전부* 에 적용.
  const handleLineHeight = (h: number): void => {
    setLineHeight(h);
    selectedShapes
      .filter((sh) => sh.kind === 'text')
      .forEach((sh) => updateShape(sh.id, { lineHeight: h } as Partial<typeof sh>));
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

  // 선 스타일 변경: 선택된 stroked 도형 *모두* 에 적용.
  const handleDash = (d: DashStyle): void => {
    setDash(d);
    selectedShapes
      .filter((s) => isStroked(s.kind))
      .forEach((s) => updateShape(s.id, { dash: d } as Partial<typeof s>));
  };

  // 표시 값 — 단일 선택일 때만 그 값, 아니면 default.
  const displayFontSize = (firstSelected?.kind === 'text' || firstSelected?.kind === 'step') && selectedShapes.length === 1
    ? firstSelected.fontSize
    : fontSize;
  const displayFontFamily = firstSelected?.kind === 'text' && selectedShapes.length === 1
    ? firstSelected.fontFamily
    : fontFamily;
  const displayTextAlign: TextAlign = firstSelected?.kind === 'text' && selectedShapes.length === 1
    ? (firstSelected.align ?? 'left')
    : textAlign;
  const displayLineHeight = firstSelected?.kind === 'text' && selectedShapes.length === 1
    ? (firstSelected.lineHeight ?? 1.2)
    : lineHeight;
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
      isStroked(firstSelected.kind)
    ) {
      // isStroked 가 true 면 firstSelected 는 Stroked 도형 — strokeWidth 가 존재한다.
      return (firstSelected as { strokeWidth: number }).strokeWidth;
    }
    return strokeWidth;
  })();
  const displayDash = ((): DashStyle => {
    if (
      selectedShapes.length === 1 &&
      firstSelected &&
      isStroked(firstSelected.kind)
    ) {
      return (firstSelected as { dash?: DashStyle }).dash ?? 'solid';
    }
    return dash;
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
          {showTextFormatting && (
            <>
              <div className="toolbar__group toolbar__group--align">
                <button
                  type="button"
                  className={`iconbtn ${displayTextAlign === 'left' ? 'iconbtn--active' : ''}`}
                  onClick={(): void => handleTextAlign('left')}
                  title="왼쪽 정렬"
                >
                  <AlignLeftIcon />
                </button>
                <button
                  type="button"
                  className={`iconbtn ${displayTextAlign === 'center' ? 'iconbtn--active' : ''}`}
                  onClick={(): void => handleTextAlign('center')}
                  title="가운데 정렬"
                >
                  <AlignCenterIcon />
                </button>
                <button
                  type="button"
                  className={`iconbtn ${displayTextAlign === 'right' ? 'iconbtn--active' : ''}`}
                  onClick={(): void => handleTextAlign('right')}
                  title="오른쪽 정렬"
                >
                  <AlignRightIcon />
                </button>
              </div>
              <div className="toolbar__group toolbar__group--slider">
                <span className="slider-label">줄간격</span>
                {LINE_HEIGHTS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`radius ${displayLineHeight === h ? 'radius--active' : ''}`}
                    onClick={(): void => handleLineHeight(h)}
                    title={`줄간격 × ${h}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
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
          <div className="toolbar__divider" aria-hidden="true" />
          <div className="toolbar__group toolbar__group--dashes">
            <span className="slider-label">선</span>
            {DASH_STYLES.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`dash ${displayDash === d.value ? 'dash--active' : ''}`}
                onClick={(): void => handleDash(d.value)}
                aria-label={`선 스타일 ${d.label}`}
                title={d.label}
              >
                <DashPreview style={d.value} />
              </button>
            ))}
          </div>
        </>
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

      <div className="toolbar__divider" aria-hidden="true" />

      <div className="toolbar__group">
        <button
          type="button"
          className="iconbtn"
          onClick={(): void => setZoom(zoom / 1.25)}
          disabled={zoom <= ZOOM_MIN}
          title="축소 (-)"
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          className="iconbtn zoom-pct"
          onClick={(): void => setZoom(1)}
          title="원래 크기로 (⌘0)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="iconbtn"
          onClick={(): void => setZoom(zoom * 1.25)}
          disabled={zoom >= ZOOM_MAX}
          title="확대 (+)"
        >
          <ZoomInIcon />
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
 * 선 스타일 미리보기 — 실제 dash 패턴을 가로선 SVG 로 그린다.
 * 패턴은 `dashPattern` 을 그대로 재사용해 캔버스 렌더와 동일한 비율을 보장한다
 * (미리보기 전용 stroke 폭 2 기준). solid 는 dash 없음.
 */
function DashPreview({ style }: { style: DashStyle }): JSX.Element {
  const pattern = dashPattern(style, 2);
  return (
    <svg width="36" height="20" viewBox="0 0 36 20" aria-hidden="true">
      <line
        x1="3"
        y1="10"
        x2="33"
        y2="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={pattern ? pattern.join(' ') : undefined}
      />
    </svg>
  );
}

function AlignLeftIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  );
}

function AlignCenterIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function AlignRightIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="6" y1="18" x2="21" y2="18" />
    </svg>
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


/** 돋보기 + — lucide zoom-in 형태의 stroke SVG (의존성 없이 inline). */
function ZoomInIcon(): JSX.Element {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

/** 돋보기 - — lucide zoom-out 형태의 stroke SVG (의존성 없이 inline). */
function ZoomOutIcon(): JSX.Element {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
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
