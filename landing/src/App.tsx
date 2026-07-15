import { useEffect, useState } from 'react';
import { Nav } from './nav/component/Nav';
import { useHashRoute } from './nav/hook/useHashRoute';
import { Hero } from './hero/component/Hero';
import { Features } from './features/component/Features';
import { Download } from './download/component/Download';
import { Footer } from './footer/component/Footer';
import { FeatureDetail } from './feature-detail/component/FeatureDetail';
import { Faq } from './faq/component/Faq';
import { BugReport } from './bug-report/component/BugReport';
import { useLanguage } from './i18n/hook/useLanguage';
import { META_STRINGS } from './meta/lib/strings';

type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name: string; assets: ReleaseAsset[] };

const DEFAULT_HREF = 'https://github.com/KimKyuHoi/ASIS/releases/latest';

export default function App(): React.JSX.Element {
  const route = useHashRoute();
  const lang = useLanguage();
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

  // 탭(해시 라우트) 전환 시 맨 위로. download 같은 홈 내부 앵커 이동은 건드리지 않는다.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  // 브라우저 탭 제목·meta description 을 현재 언어에 맞춘다(React state → DOM 동기화).
  useEffect(() => {
    const meta = META_STRINGS[lang];
    document.title = meta.title;
    const descEl = document.querySelector('meta[name="description"]');
    if (!descEl) throw new Error('meta[name="description"] must exist in index.html');
    descEl.setAttribute('content', meta.description);
  }, [lang]);

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
