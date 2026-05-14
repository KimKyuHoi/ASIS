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
  const [downloadHref, setDownloadHref] = useState(DEFAULT_HREF);
  const [downloadLabel, setDownloadLabel] = useState('macOS 다운로드');

  useEffect(() => {
    fetch('https://api.github.com/repos/KimKyuHoi/ASIS/releases/latest')
      .then((r) => r.json())
      .then((data: Release) => {
        const assets = data.assets ?? [];
        const arm = assets.find((a) => a.name.endsWith('-arm64.dmg'));
        const intel = assets.find((a) => a.name.endsWith('-x64.dmg'));
        const best = arm ?? intel;
        if (!best) return;
        setDownloadHref(best.browser_download_url);
        setDownloadLabel(`macOS 다운로드 (${data.tag_name})`);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <Nav />
      <Hero downloadHref={downloadHref} downloadLabel={downloadLabel} />
      <Features />
      <Download downloadHref={downloadHref} downloadLabel={downloadLabel} />
      <Footer />
    </>
  );
}
