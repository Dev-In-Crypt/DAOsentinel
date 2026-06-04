'use client';
import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';

export function CheckoutButton({ plan }: { plan: 'delegate_pro' | 'fund_suite' }) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  async function checkout() {
    if (!session) {
      await signIn();
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={checkout}
      disabled={loading}
      className="btn-mc btn-mc-primary"
      style={{ justifyContent: 'center', width: '100%' }}
    >
      {loading ? 'Loading…' : 'Subscribe'}
    </button>
  );
}
