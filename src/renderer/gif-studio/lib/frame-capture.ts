/**
 * 프레임 정지화면 캡처 — 재생용 프록시 <video> 를 그 시각으로 옮겨 canvas 에 그린다.
 *
 * 편집 배경과 블러·모자이크의 원본 픽셀로 쓴다. 프록시는 최대 1280px 이라 원본보다 작을 수
 * 있지만, 에디터의 블러·모자이크는 bgImage.naturalWidth / imageWidth 비율로 보정하므로
 * 좌표는 맞는다 (해상도만 프록시 기준). 같은 프레임을 다시 열 때를 위해 Blob URL 을 캐시한다.
 *
 * video 하나를 공유하므로 캡처는 한 번에 하나씩(queue) 돈다 — seek 이 겹치면 다른 프레임을 그린다.
 *  - captureFrame: 요청을 모두 순서대로 (내보내기 배경 — 빠지면 안 된다)
 *  - captureLatest: 마지막 요청만 (편집 배경 — 트림 드래그·키 반복 때 밀린 요청은 버린다)
 */

const MAX_CACHED = 48;
const SEEK_TIMEOUT_MS = 3000;

const cache = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
/** 미디어가 바뀔 때마다 증가 — 그 전에 시작한 캡처 결과를 새 캐시에 넣지 않는다. */
let generation = 0;

/** 더 새 편집 배경 요청에 밀려 버려진 캡처. 호출자는 조용히 무시한다. */
export class CaptureSuperseded extends Error {
  constructor() {
    super('더 새 프레임 요청에 밀린 캡처');
    this.name = 'CaptureSuperseded';
  }
}

type Job = {
  video: HTMLVideoElement;
  t: number;
  key: string;
  resolve: (url: string) => void;
  reject: (err: unknown) => void;
};

let latest: Job | null = null;

export function clearFrameCache(): void {
  generation += 1;
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  latest?.reject(new CaptureSuperseded());
  latest = null;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  // 실패해도 다음 캡처는 진행한다 — 실패는 run 으로 호출자에게 간다.
  queue = run.catch(() => undefined);
  return run;
}

/** video 를 t 로 옮기고 그 프레임을 PNG Blob URL 로. 캐시 키는 호출자가 정한다(격자+프레임). */
export function captureFrame(video: HTMLVideoElement, t: number, key: string): Promise<string> {
  return enqueue(() => captureNow(video, t, key));
}

/** 기다리는 편집 배경 캡처를 버린다 — 재생을 시작하면 밀린 seek 이 영상을 멈추지 않게. */
export function cancelLatest(): void {
  latest?.reject(new CaptureSuperseded());
  latest = null;
}

/** 편집 배경용 — 앞서 기다리던 요청은 CaptureSuperseded 로 끝내고 이 요청만 남긴다. */
export function captureLatest(video: HTMLVideoElement, t: number, key: string): Promise<string> {
  latest?.reject(new CaptureSuperseded());
  return new Promise((resolve, reject) => {
    latest = { video, t, key, resolve, reject };
    // runLatest 는 실패를 job.reject 로 넘기고 스스로는 던지지 않는다 — 여기 catch 는 큐 체인용.
    enqueue(runLatest).catch(() => undefined);
  });
}

async function runLatest(): Promise<void> {
  const job = latest;
  latest = null;
  // 이미 다른 runLatest 가 가져갔다 — 이 차례는 할 일이 없다.
  if (!job) return;
  try {
    job.resolve(await captureNow(job.video, job.t, job.key));
  } catch (err) {
    job.reject(err);
  }
}

async function captureNow(video: HTMLVideoElement, t: number, key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // 최근 사용으로 올린다 (Map 은 삽입 순서 — 지웠다 다시 넣으면 맨 뒤).
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const mine = generation;
  await seekTo(video, t);
  const url = URL.createObjectURL(await drawToPng(video));
  if (mine !== generation) {
    URL.revokeObjectURL(url);
    throw new CaptureSuperseded();
  }
  cache.set(key, url);
  // 가장 오래 안 쓴(맨 앞) 항목부터 버린다.
  for (const [oldKey, oldUrl] of cache) {
    if (cache.size <= MAX_CACHED) break;
    URL.revokeObjectURL(oldUrl);
    cache.delete(oldKey);
  }
  return url;
}

function drawToPng(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('GIF 스튜디오 — 2D canvas 를 만들지 못했다.');
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('GIF 스튜디오 — 프레임 PNG 인코딩 실패'));
    }, 'image/png');
  });
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new Error(`GIF 스튜디오 — 프레임 이동 시간 초과 (${t.toFixed(3)}s)`));
    }, SEEK_TIMEOUT_MS);
    const onSeeked = (): void => {
      window.clearTimeout(timer);
      resolve();
    };
    const el = video;
    el.addEventListener('seeked', onSeeked, { once: true });
    el.pause();
    el.currentTime = t;
  });
}
