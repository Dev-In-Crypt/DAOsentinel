import * as React from 'react';
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

export interface OrgOnboardingEmailProps {
  organizationName: string;
  brandingDisplayName?: string | null;
  daoLinks: Array<{ daoName: string; daoSlug: string; url: string }>;
}

export default function OrgOnboardingEmail(p: OrgOnboardingEmailProps) {
  const displayName = p.brandingDisplayName ?? p.organizationName;
  return (
    <Html>
      <Head />
      <Preview>Your {displayName} dashboard is ready</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>Your dashboard is ready</Heading>
          <Text style={text}>
            You've been added to <strong>{displayName}</strong> on DAO Sentinel. Here's direct
            access to your private dashboard{p.daoLinks.length > 1 ? 's' : ''}:
          </Text>
          {p.daoLinks.map((d) => (
            <Section style={card} key={d.daoSlug}>
              <Text style={cardTitle}>{d.daoName}</Text>
              <Link href={d.url} style={link}>
                Open dashboard →
              </Link>
            </Section>
          ))}
          <Text style={muted}>
            Sign in works exactly like the public product — a magic-link email to this address,
            no separate password.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' };
const container = { margin: '0 auto', padding: '32px 24px', maxWidth: '560px' };
const h1 = { color: '#22c55e', fontSize: '22px', margin: '0 0 12px' };
const text = { color: '#fafafa', fontSize: '15px', lineHeight: '22px' };
const muted = { color: '#a3a3a3', fontSize: '13px', lineHeight: '20px', marginTop: '20px' };
const card = {
  backgroundColor: '#171717',
  border: '1px solid #262626',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
};
const cardTitle = { color: '#fafafa', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' };
const link = { color: '#22c55e', fontWeight: 600 };
