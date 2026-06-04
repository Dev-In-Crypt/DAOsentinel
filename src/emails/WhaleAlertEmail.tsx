import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface WhaleAlertEmailProps {
  daoName: string;
  daoSlug: string;
  proposalTitle: string;
  proposalId: string;
  voter: string;
  vp: number;
  vpPct: number;
  choice: string;
}

export default function WhaleAlertEmail(p: WhaleAlertEmailProps) {
  const base = 'https://daosentinel.xyz';
  return (
    <Html>
      <Head />
      <Preview>🐳 Whale vote on {p.daoName}: {p.vpPct.toFixed(1)}% VP</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>🐳 Whale vote</Heading>
          <Text style={text}>
            <strong>{p.daoName}</strong> · {p.vpPct.toFixed(1)}% VP cast
          </Text>
          <Section style={card}>
            <Text style={cardTitle}>{p.proposalTitle}</Text>
            <Text style={muted}>
              <code>{p.voter}</code> voted <strong>{p.choice}</strong> with{' '}
              {p.vp.toLocaleString()} VP ({p.vpPct.toFixed(1)}% of total).
            </Text>
            <Link href={`${base}/proposals/${p.proposalId}`} style={link}>
              View on DAO Sentinel →
            </Link>
          </Section>
          <Text style={muted}>
            You're getting this because <code>{p.daoSlug}</code> is on your watchlist.{' '}
            <Link href={`${base}/settings`} style={link}>
              Manage alerts
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' };
const container = { margin: '0 auto', padding: '32px 24px', maxWidth: '560px' };
const h1 = { color: '#f59e0b', fontSize: '22px', margin: '0 0 12px' };
const text = { color: '#fafafa', fontSize: '15px', lineHeight: '22px' };
const muted = { color: '#a3a3a3', fontSize: '13px', lineHeight: '20px' };
const card = {
  backgroundColor: '#171717',
  border: '1px solid #262626',
  borderRadius: '8px',
  padding: '16px',
  margin: '20px 0',
};
const cardTitle = { color: '#fafafa', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' };
const link = { color: '#22c55e', fontWeight: 600 };
