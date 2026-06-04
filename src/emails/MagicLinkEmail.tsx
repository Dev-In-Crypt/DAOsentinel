import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface MagicLinkEmailProps {
  url: string;
  host: string;
}

export default function MagicLinkEmail({ url, host }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Sign in to DAO Sentinel</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>DAO Sentinel</Heading>
          <Text style={text}>Click the button below to sign in to {host}.</Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={url} style={button}>
              Sign in
            </Button>
          </Section>
          <Text style={textMuted}>
            Or copy this URL:{' '}
            <Link href={url} style={link}>
              {url}
            </Link>
          </Text>
          <Text style={textMuted}>
            This link expires in 24 hours. If you did not request it, ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' };
const container = { margin: '0 auto', padding: '40px 24px', maxWidth: '560px' };
const h1 = { color: '#22c55e', fontSize: '28px', margin: '0 0 24px' };
const text = { color: '#fafafa', fontSize: '16px', lineHeight: '24px' };
const textMuted = { color: '#a3a3a3', fontSize: '13px', lineHeight: '20px' };
const button = {
  backgroundColor: '#22c55e',
  color: '#0a0a0a',
  padding: '12px 24px',
  borderRadius: '6px',
  fontWeight: 600,
  textDecoration: 'none',
};
const link = { color: '#22c55e' };
