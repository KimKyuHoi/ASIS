import { useEffect, useState } from 'react';
import { Nav } from './nav/component/Nav';
import { Hero } from './hero/component/Hero';
import { Features } from './features/component/Features';
import { Download } from './download/component/Download';
import { Footer } from './footer/component/Footer';

type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name: string; assets: ReleaseAsset[] };

const DEFAULT_HREF = 'https://github.com/KimKyuHoi/ASIS/releases/latest';

export default function App(): React.JSX.Element {
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

  const heroLabel = version ? `macOS 다운로드 (${version})` : 'macOS 다운로드';

  return (
    <>
      <Nav />
      <Hero downloadHref="#download" downloadLabel={heroLabel} />
      <Features />
      <Download armHref={armHref} intelHref={intelHref} version={version} />
      <Footer />
    </>
  );
}
