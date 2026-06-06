import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata = {
  title: 'Privacy Policy — DAO Sentinel',
  description: 'How DAO Sentinel collects, uses, and protects your data.',
};

const UPDATED = 'June 6, 2026';

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="container-mc" style={{ paddingTop: 140, paddingBottom: 80 }}>
        <div className="sec-head" style={{ maxWidth: 760, marginBottom: 40 }}>
          <span className="eyebrow">Legal</span>
          <h1
            className="mt-3 text-5xl font-semibold md:text-6xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.03em',
            }}
          >
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm mono text-[hsl(var(--text-dim))]">Last updated: {UPDATED}</p>
        </div>

        <div className="legal-prose" style={{ maxWidth: 760 }}>
          <p>
            DAO Sentinel (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the website at
            daosentinel.xyz. This policy explains what data we collect, why, and the choices you
            have. We keep collection to the minimum needed to run the service.
          </p>

          <h2>1. What we collect</h2>
          <ul>
            <li>
              <strong>Account data.</strong> When you sign in we store your email address (used for
              the magic-link login and, if you opt in, alert notifications). We never ask for a
              password.
            </li>
            <li>
              <strong>Preferences.</strong> The DAOs and delegates you watch, and your alert
              channel settings (email / Telegram).
            </li>
            <li>
              <strong>Billing data.</strong> If you subscribe to a paid plan, payment is processed
              by Stripe. We store only a Stripe customer/subscription identifier and your plan tier
              — never your full card details.
            </li>
            <li>
              <strong>Usage analytics.</strong> We use privacy-friendly, cookieless analytics
              (Vercel Analytics) to count page views and performance. No personal profiles are
              built and no advertising trackers are used.
            </li>
          </ul>

          <h2>2. What we do not collect</h2>
          <p>
            We do not collect wallet private keys, we never ask you to connect a wallet, and we do
            not sell or rent your data to anyone. All on-chain governance data we display is public
            blockchain and Snapshot/Tally data — not personal data you provide.
          </p>

          <h2>3. How we use your data</h2>
          <ul>
            <li>To authenticate you and keep you signed in.</li>
            <li>To deliver the alerts and weekly digest you subscribed to.</li>
            <li>To provide and bill for paid features.</li>
            <li>To monitor reliability and improve the product in aggregate.</li>
          </ul>

          <h2>4. Third-party processors</h2>
          <p>We share data only with the vendors that make the service work:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — database hosting (your account &amp; preferences).
            </li>
            <li>
              <strong>Vercel</strong> — application hosting &amp; cookieless analytics.
            </li>
            <li>
              <strong>Resend</strong> — transactional email (login links, alerts, digest).
            </li>
            <li>
              <strong>Stripe</strong> — payment processing (paid plans only).
            </li>
            <li>
              <strong>OpenRouter</strong> — AI summaries of public proposals (no personal data
              sent).
            </li>
          </ul>

          <h2>5. Cookies</h2>
          <p>
            We use a single strictly-necessary cookie to keep you signed in. Our analytics are
            cookieless. Because we set no advertising or tracking cookies, no consent banner is
            required under GDPR/ePrivacy for our analytics.
          </p>

          <h2>6. Data retention</h2>
          <p>
            We keep your account data while your account is active. You can delete your account at
            any time, after which we remove your personal data within 30 days, except where we must
            retain billing records for legal/tax purposes.
          </p>

          <h2>7. Your rights</h2>
          <p>
            Depending on your jurisdiction (including the EU/EEA under GDPR and California under
            CCPA), you may have the right to access, correct, export, or delete your personal data,
            and to object to processing. To exercise any of these, email us at the address below.
          </p>

          <h2>8. Children</h2>
          <p>The service is not directed at anyone under 16, and we do not knowingly collect their data.</p>

          <h2>9. Changes</h2>
          <p>
            We may update this policy as the product evolves. Material changes will be reflected by
            the &ldquo;Last updated&rdquo; date above.
          </p>

          <h2>10. Contact</h2>
          <p>
            Questions or data requests:{' '}
            <a href="mailto:hello@daosentinel.xyz">hello@daosentinel.xyz</a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
