import { useEffect, useState } from 'react';
import type { JSX } from 'react';

const initialSeconds = parseInt(
  new URLSearchParams(location.search).get('seconds') ?? '3',
  10,
);

export default function Countdown(): JSX.Element {
  const [count, setCount] = useState(initialSeconds);

  useEffect(() => {
    if (count <= 0) return undefined;
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <div className="countdown">
      <div className="countdown__badge">{count > 0 ? count : '✓'}</div>
    </div>
  );
}
