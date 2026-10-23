import type { ReactNode } from 'react';

import type { SceneId } from '@/engine';

/* L1 道具剪影。只画「有人在那儿」的暗示，细节交给 shader，
   所以这里全是纯色块，不描边、不上渐变。 */

const PROPS: Partial<Record<SceneId, ReactNode>> = {
  lofi: (
    <svg
      className="absolute -right-[3%] bottom-0 h-auto w-[86%] translate-y-[14px]"
      viewBox="0 0 390 420"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
    >
      <rect x="255" y="215" width="86" height="205" rx="18" fill="#2C2018" />
      <path d="M196 330 Q186 250 214 226 Q246 200 292 212 Q332 222 338 288 L342 330 Z" fill="#1B1322" />
      <path d="M228 246 Q210 178 262 160 Q320 142 338 196 Q346 224 330 244 Q326 204 292 196 Q248 186 228 246 Z" fill="#2C2018" />
      <ellipse cx="292" cy="184" rx="38" ry="42" fill="#1B1322" />
      <path d="M206 268 Q168 288 130 318 L142 332 Q182 302 216 290 Z" fill="#1B1322" />
      <path d="M330 320 L344 248 L386 248 L390 320 Z" fill="#2A2036" />
      <rect x="360" y="212" width="6" height="40" fill="#2A2036" />
      <ellipse cx="363" cy="320" rx="22" ry="5" fill="#3A2C46" />
      <rect x="0" y="316" width="390" height="104" fill="#0C0812" />
      <rect x="0" y="309" width="390" height="9" rx="4" fill="#120D1A" />
    </svg>
  ),
  classic: (
    <svg
      className="absolute -left-[4%] bottom-0 h-auto w-[52%]"
      viewBox="0 0 200 170"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
    >
      <path d="M100 170 L100 66" stroke="#2C2018" strokeWidth="5" fill="none" />
      <path d="M58 170 L100 108 L142 170" stroke="#2C2018" strokeWidth="5" fill="none" />
      <rect x="52" y="22" width="96" height="52" rx="5" fill="#2C2018" transform="rotate(-7 100 48)" />
      <g stroke="#6B4E2A" strokeWidth="1.2" opacity="0.75" transform="rotate(-7 100 48)">
        <path d="M66 36h68M66 42h68M66 48h68M66 54h68M66 60h68" />
      </g>
    </svg>
  ),
};

export function Props({ scene, enabled }: { scene: SceneId; enabled: boolean }) {
  if (!enabled) return null;
  const prop = PROPS[scene];
  if (!prop) return null;
  return (
    <div className="prop-layer" aria-hidden>
      {prop}
    </div>
  );
}
