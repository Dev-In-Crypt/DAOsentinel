import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata = {
  title: 'Terms of Service — DAO Sentinel',
  description: 'The terms governing your use of DAO Sentinel.',
};

const UPDATED = 'June 6, 2026';

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-4 text-sm mono text-[hsl(var(--text-dim))]">Last updated: {UPDATED}</p>
        </div>

        <div className="legal-prose" style={{ maxWidth: 760 }}>
          <p>
            These Terms govern your access to and use of DAO Sentinel (the &ldquo;Service&rdquo;). By
            using the Service you agree to these Terms. If you do not agree, do not use the Service.
          </p>

          <h2>1. The Service</h2>
          <p>
            DAO Sentinel is an independent governance-analytics platform. We aggregate public
            on-chain and Snapshot/Tally data and present metrics, scores, alerts, and AI-generated
            summaries. We are not affiliated with, endorsed by, or acting on behalf of any DAO,
            protocol, or token issuer we track.
          </p>

          <h2>2. Not financial or voting advice</h2>
          <p>
            All content — including Democracy Scores, whale alerts, delegate analytics, and AI
            summaries — is provided for informational purposes only. It is <strong>not</strong>{' '}
            financial, investment, legal, or voting advice. AI summaries may contain errors; always
            verify against the original proposal before acting. You are solely responsible for your
            decisions.
          </p>

          <h2>3. Accounts</h2>
          <p>
            You must provide a valid email to create an account and are responsible for activity
            under it. Keep access to your email secure, since login uses magic links. You must be at
            least 16 years old.
          </p>

          <h2>4. Acceptable use</h2>
          <ul>
            <li>Do not scrape, overload, or attempt to disrupt the Service or its APIs.</li>
            <li>Do not exceed the rate limits of your plan or share API keys.</li>
            <li>Do not use the Service to break any law or infringe others&rsquo; rights.</li>
            <li>Do not resell or redistribute the data feed without a written agreement.</li>
          </ul>

          <h2>5. Paid plans</h2>
          <p>
            Paid subscriptions are billed in advance through Stripe on a recurring basis until
            cancelled. You can cancel anytime; access continues until the end of the current billing
            period. Except where required by law, fees already paid are non-refundable. We may
            change pricing with prior notice for future billing periods.
          </p>

          <h2>6. Intellectual property</h2>
          <p>
            The Service&rsquo;s software, design, and original content are ours or our
            licensors&rsquo;. Underlying blockchain and governance data is public and not owned by
            us. We grant you a limited, non-exclusive, non-transferable right to use the Service per
            these Terms.
          </p>

          <h2>7. Availability &amp; changes</h2>
          <p>
            The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis.
            Data may be delayed, incomplete, or inaccurate due to upstream sources. We may modify,
            suspend, or discontinue any part of the Service at any time.
          </p>

          <h2>8. Disclaimer &amp; limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, we disclaim all warranties, express or implied.
            We are not liable for any indirect, incidental, or consequential damages, or for losses
            arising from your reliance on the Service, governance decisions, or trading activity.
            Our total liability for any claim is limited to the amount you paid us in the 12 months
            before the claim.
          </p>

          <h2>9. Termination</h2>
          <p>
            We may suspend or terminate your access if you violate these Terms. You may stop using
            the Service and delete your account at any time.
          </p>

          <h2>10. Governing law &amp; changes to terms</h2>
          <p>
            We may update these Terms; material changes take effect on the &ldquo;Last
            updated&rdquo; date above, and continued use constitutes acceptance. Any disputes will
            be handled under the laws of our place of establishment, without regard to
            conflict-of-law rules.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions about these Terms:{' '}
            <a href="mailto:hello@daosentinel.xyz">hello@daosentinel.xyz</a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
