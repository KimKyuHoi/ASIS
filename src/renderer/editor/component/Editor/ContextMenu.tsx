import type { JSX } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../lib/store';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { editorStrings } from '../../lib/strings';
import type { ContextMenuState } from '../../hook/useContextMenu';

type Direction = 'front' | 'forward' | 'backward' | 'back';
type MenuLabelKey = 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack';

const ITEMS: readonly [Direction, MenuLabelKey][] = [
  ['front', 'bringToFront'],
  ['forward', 'bringForward'],
  ['backward', 'sendBackward'],
  ['back', 'sendToBack'],
];

/** 도형 우클릭 메뉴 — z-order 변경. document.body 로 portal. */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}): JSX.Element {
  const t = editorStrings[useLanguage()];
  const reorderShape = useEditorStore((s) => s.reorderShape);
  return createPortal(
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(e): void => e.stopPropagation()}
    >
      {ITEMS.map(([dir, labelKey]) => (
        <button
          key={dir}
          type="button"
          className="context-menu__item"
          onClick={(): void => {
            reorderShape(menu.shapeId, dir);
            onClose();
          }}
        >
          {t.editor[labelKey]}
        </button>
      ))}
    </div>,
    document.body,
  );
}
