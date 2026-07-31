import { ImageResponse } from 'next/og';
import { TRACKED_DAOS } from '@/lib/constants';

// Standard Open Graph card size. Twitter falls back to this when no
// twitter-image is provided.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'DAO Sentinel — Mission control for on-chain democracy';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'radial-gradient(circle at 50% 0%, #1a2348 0%, #0A0E1A 60%)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 80px',
          fontFamily: 'system-ui',
          color: '#EAEEFB',
        }}
      >
        {/* Subtle grid texture */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(140,152,200,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(140,152,200,0.06) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            opacity: 0.5,
          }}
        />

        {/* Cyan corner accent */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: 300,
            background:
              'radial-gradient(circle, rgba(34,211,238,0.18), transparent 70%)',
          }}
        />

        {/* LEFT: brand mark */}
        <div
          style={{
            width: 320,
            height: 320,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginRight: 60,
          }}
        >
          {/* outer cyan ring */}
          <div
            style={{
              position: 'absolute',
              width: 320,
              height: 320,
              borderRadius: 160,
              border: '3px solid rgba(34,211,238,0.45)',
            }}
          />
          {/* inner indigo ring */}
          <div
            style={{
              position: 'absolute',
              width: 210,
              height: 210,
              borderRadius: 105,
              border: '5px solid rgba(129,140,248,0.75)',
            }}
          />
          {/* core glow */}
          <div
            style={{
              position: 'absolute',
              width: 220,
              height: 220,
              borderRadius: 110,
              background:
                'radial-gradient(circle, rgba(99,102,241,0.55), rgba(34,211,238,0.10) 45%, transparent 70%)',
            }}
          />
          {/* core */}
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 55,
              background:
                'radial-gradient(circle at 40% 35%, #818CF8, #6366F1 55%, #1A2348)',
              boxShadow:
                '0 0 60px rgba(99,102,241,0.9), inset 0 0 0 2px rgba(129,140,248,0.55)',
            }}
          />
          {/* cyan tick at top */}
          <div
            style={{
              position: 'absolute',
              top: 50,
              width: 28,
              height: 28,
              borderRadius: 14,
              background: '#22D3EE',
              boxShadow: '0 0 32px #22D3EE',
            }}
          />
        </div>

        {/* RIGHT: copy stack */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              fontSize: 18,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#818CF8',
              fontWeight: 600,
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                display: 'flex',
                width: 28,
                height: 2,
                background: '#6366F1',
                marginRight: 14,
              }}
            />
            daosentinel.xyz
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
              color: '#fff',
              marginBottom: 22,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Mission control for</span>
            <span
              style={{
                background: 'linear-gradient(120deg, #818CF8, #22D3EE)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              on-chain democracy.
            </span>
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#9AA3C4',
              lineHeight: 1.4,
              maxWidth: 640,
            }}
          >
            {`DAO governance watchdog · ${TRACKED_DAOS.length} DAOs · whale alerts · weekly digest`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
