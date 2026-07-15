import { useGiscus } from '../hook/useGiscus';
import type { GiscusConfig } from '../types/giscus';
import { useLanguage } from '../../i18n/hook/useLanguage';
import '../asset/giscus.css';

/**
 * giscus(GitHub Discussions 기반) 댓글 위젯.
 * 동작하려면 KimKyuHoi/ASIS 저장소에 giscus GitHub App 이 설치되어 있어야 한다.
 * 위젯 UI 언어는 현재 사이트 언어(ko/en)를 따라간다.
 */
export function Giscus({ config }: { config: GiscusConfig }): React.JSX.Element {
  const lang = useLanguage();
  const containerRef = useGiscus(config, lang);
  return <div className="giscus-mount" ref={containerRef} />;
}
