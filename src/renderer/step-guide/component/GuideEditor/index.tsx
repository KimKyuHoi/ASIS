import { use, type JSX } from 'react';
import type { GuideDraft } from '../../../../shared/step-guide';
import { EmptyState, TextField } from '../../../design-system/component';
import { useLanguage } from '../../../../shared/i18n/use-language';
import { useEditorWindowEvents } from '../../hook/useEditorWindowEvents';
import { useGuideEditor } from '../../hook/useGuideEditor';
import { useGuideSave } from '../../hook/useGuideSave';
import { useStepAnnotationKeyboard } from '../../hook/useStepAnnotationKeyboard';
import { useAnnotationVersion, useStepAnnotations } from '../../hook/useStepAnnotations';
import { withAnnotatedImages } from '../../lib/annotated-edits';
import { discardStep } from '../../lib/step-annotations';
import { guideEditorStrings } from '../../lib/editor-strings';
import EditorTitlebar from './EditorTitlebar';
import StepDetail from './StepDetail';
import StepList from './StepList';
import '../../asset/editor.css';

type Props = { draftPromise: Promise<GuideDraft> };

/**
 * 스텝 가이드 편집 창 — 녹화 [완료] 후, 파일을 만들기 *전에* 뜨는 앱 에디터.
 *
 * 왼쪽: 단계 목록(썸네일·드래그 정렬). 오른쪽: 가이드 제목·설명 + 선택한 단계의
 * 안내 문구·부연 설명·순서·삭제·화면 미리보기. [저장…]에서 main 이 단일 HTML 을 쓴다.
 *
 * draftPromise 는 엔트리(main.tsx)가 모듈 스코프에서 한 번 만든 것 — use() 로 읽는다.
 */
export default function GuideEditor({ draftPromise }: Props): JSX.Element {
  const t = guideEditorStrings[useLanguage()];
  const draft = use(draftPromise);
  const annotationVersion = useAnnotationVersion();
  const { state, dispatch, edits, snapshot, dirty } = useGuideEditor(draft, annotationVersion);
  const canSave = state.steps.length > 0;
  const { status, requestSave } = useGuideSave({
    prepareEdits: () => withAnnotatedImages(edits, state.steps),
    canSave,
    onSaved: () => {
      dispatch({ type: 'saved', snapshot });
    },
  });
  useEditorWindowEvents(dirty, requestSave);

  const selectedIndex = state.steps.findIndex((s) => s.id === state.selectedId);
  // findIndex 가 -1 이면 .at(-1) 이 마지막 단계를 돌려주므로 명시 분기.
  const selected = selectedIndex >= 0 ? state.steps[selectedIndex] : undefined;
  useStepAnnotations(selected);
  useStepAnnotationKeyboard(selected?.kind === 'image');

  return (
    <div className="ge">
      <EditorTitlebar t={t} status={status} dirty={dirty} canSave={canSave} onSave={requestSave} />

      <div className="ge-body">
        <aside className="ge-sidebar">
          <p className="ge-sidebar__heading">
            {t.stepsHeading(state.steps.length)}
            <span className="ge-sidebar__hint">{t.dragHint}</span>
          </p>
          <StepList
            steps={state.steps}
            selectedId={state.selectedId}
            t={t}
            onSelect={(id): void => dispatch({ type: 'select', id })}
            onMove={(id, to): void => dispatch({ type: 'move', id, to })}
          />
        </aside>

        <main className="ge-main">
          <TextField
            className="ge-field ge-field--title"
            label={t.titleLabel}
            value={state.title}
            placeholder={t.titlePlaceholder}
            onChange={(value): void => dispatch({ type: 'title', value })}
          />
          <span className="ds-field ge-field">
            <label className="ds-field__label" htmlFor="ge-description">{t.descriptionLabel}</label>
            <textarea
              id="ge-description"
              className="ds-field__input ge-textarea"
              value={state.description}
              placeholder={t.descriptionPlaceholder}
              rows={2}
              onChange={(event): void => dispatch({ type: 'description', value: event.target.value })}
            />
          </span>

          {selected ? (
            <StepDetail
              key={selected.id}
              step={selected}
              index={selectedIndex}
              total={state.steps.length}
              t={t}
              onCaption={(value): void => dispatch({ type: 'caption', id: selected.id, value })}
              onNote={(value): void => dispatch({ type: 'note', id: selected.id, value })}
              onMove={(to): void => dispatch({ type: 'move', id: selected.id, to })}
              onRemove={(): void => {
                discardStep(selected.id);
                dispatch({ type: 'remove', id: selected.id });
              }}
            />
          ) : (
            <EmptyState className="ge-empty" title={t.empty} />
          )}
        </main>
      </div>
    </div>
  );
}
