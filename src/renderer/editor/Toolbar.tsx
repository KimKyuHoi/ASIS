import type { JSX } from 'react';
import type { Tool } from './state/types';
import {
  BLUR_RADII,
  PALETTE,
  STROKE_WIDTHS,
  useEditorStore,
} from './state/store';

const TOOL_ITEMS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'select', label: '선택', key: 'V' },
  { tool: 'rect', label: '사각형', key: 'R' },
  { tool: 'ellipse', label: '원', key: 'O' },
  { tool: 'arrow', label: '화살표', key: 'A' },
  { tool: 'pen', label: '펜', key: 'P' },
  { tool: 'text', label: '텍스트', key: 'T' },
  { tool: 'highlight', label: '하이라이트', key: 'H' },
  { tool: 'blur', label: '블러', key: 'B' },
];

export function Toolbar({
  onCopy,
  onCancel,
}: {
  onCopy: () => void;
  onCancel: () => void;
}): JSX.Element {
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const blurRadius = useEditorStore((s) => s.blurRadius);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const setStrokeWidth = useEditorStore((s) => s.setStrokeWidth);
  const setBlurRadius = useEditorStore((s) => s.setBlurRadius);
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

  const isStroked = (k: string): boolean =>
    k === 'rect' || k === 'ellipse' || k === 'arrow' || k === 'pen';

  // blur 강도 변경: 선택된 blur 도형 *전부* 에 적용. 없으면 default 만 변경.
  const handleBlurRadius = (r: number): void => {
    setBlurRadius(r);
    selectedShapes
      .filter((s) => s.kind === 'blur')
      .forEach((s) => updateShape(s.id, { blurRadius: r }));
  };

  // 색상 변경: 선택된 도형 *모두* 에 종류별 적합한 필드로 patch.
  const handleColor = (c: string): void => {
    setColor(c);
    if (selectedShapes.length === 0) return;
    selectedShapes.forEach((s) => {
      if (s.kind === 'highlight') {
        updateShape(s.id, { fill: hexToRgba(c, 0.4) });
      } else if (s.kind === 'text') {
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
  const displayBlurRadius = firstSelected?.kind === 'blur' && selectedShapes.length === 1
    ? firstSelected.blurRadius
    : blurRadius;
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
    <div className="toolbar">
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

      {isBlur ? (
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
      )}

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

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
