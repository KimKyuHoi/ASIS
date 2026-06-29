import { useGiscus } from '../hook/useGiscus';
import type { GiscusConfig } from '../types/giscus';
import '../asset/giscus.css';

/**
 * giscus(GitHub Discussions 기반) 댓글 위젯.
 * 동작하려면 KimKyuHoi/ASIS 저장소에 giscus GitHub App 이 설치되어 있어야 한다.
 */
export function Giscus({ config }: { config: GiscusConfig }): React.JSX.Element {
  const containerRef = useGiscus(config);
  return <div className="giscus-mount" ref={containerRef} />;
}
