import { useEffect, useState } from 'react';
import { Nav } from './nav/component/Nav';
import { Hero } from './hero/component/Hero';
import { Features } from './features/component/Features';
import { Download } from './download/component/Download';
import { Footer } from './footer/component/Footer';
import { FeatureDetail } from './feature-detail/component/FeatureDetail';
import { Faq } from './faq/component/Faq';
import { BugReport } from './bug-report/component/BugReport';
import { usePage } from './page/hook/usePage';

type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name: string; assets: ReleaseAsset[] };

const DEFAULT_HREF = 'https://github.com/KimKyuHoi/ASIS/releases/latest';

/**
 * 페이지(라우트·언어)마다 HTML 을 따로 프리렌더한다 — 탭·언어 전환은 일반 링크 이동이다.
 * title·description·canonical 같은 head 는 빌드 때 정적으로 박히므로(meta/lib/head.ts)
 * 여기서 DOM 으로 고치지 않는다.
 */
export default function App(): React.JSX.Element {
  const { route } = usePage();
  const [version, setVersion] = useState('');
  const [armHref, setArmHref] = useState(DEFAULT_HREF);
  const [intelHref, setIntelHref] = useState(DEFAULT_HREF);

  useEffect(() => {
    fetch('https://api.github.com/repos/KimKyuHoi/ASIS/releases/latest')
      .then((r) => r.json())
      .then((data: Release) => {
        const assets = data.assets ?? [];
        const arm = assets.find((a) => a.name.endsWith('-arm64.dmg'));
        const intel = assets.find((a) => a.name.endsWith('-x64.dmg'));
        if (data.tag_name) setVersion(data.tag_name);
        if (arm) setArmHref(arm.browser_download_url);
        if (intel) setIntelHref(intel.browser_download_url);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Nav route={route} />
      {route === 'home' ? (
        <>
          <Hero downloadHref="#download" version={version} />
          <Features />
          <Download armHref={armHref} intelHref={intelHref} version={version} />
        </>
      ) : null}
      {route === 'features' ? <FeatureDetail /> : null}
      {route === 'faq' ? <Faq /> : null}
      {route === 'bug' ? <BugReport /> : null}
      <Footer />
    </>
  );
}
