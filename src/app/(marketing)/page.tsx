import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { OrbitalHero } from '@/components/orbital/OrbitalHero';
import {
  FeaturesSection,
  PipelineSection,
  MetricsBand,
  SocialProof,
  PublicGoodSection,
  NewsletterSection,
  FinalCTA,
  RevealOnScroll,
} from '@/components/orbital/Sections';
import { loadLandingData } from '@/server/landing-data';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const data = await loadLandingData();
  return (
    <>
      <Header />
      <RevealOnScroll />
      <OrbitalHero
        daos={data.daos}
        aggregateScore={data.aggregateScore}
        scoreTrend={data.scoreTrend}
        stats={data.stats}
        monitoredCount={data.monitoredCount}
      />
      <main>
        <FeaturesSection />
        <PipelineSection />
        <MetricsBand
          daos={data.monitoredCount}
          treasuryUsd={data.stats.treasuryUsd}
          whaleAlerts24h={data.stats.whaleAlerts24h}
          chains={data.chains}
          votesTracked={data.stats.votesTracked}
        />
        <SocialProof />
        <PublicGoodSection />
        <NewsletterSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
