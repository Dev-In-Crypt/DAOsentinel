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

export interface WeeklyDigestEmailProps {
  title: string;
  markdownBody: string;
  weekOf: string;
}

/**
 * The body is the Claude-generated markdown. We render it as preformatted text
 * inside the email — emails reliably display monospaced markdown across clients,
 * and prevents subtle XSS via untrusted model output.
 */
export default function WeeklyDigestEmail({ title, markdownBody, weekOf }: WeeklyDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>DAO Sentinel Weekly</Heading>
          <Text style={muted}>Week of {weekOf}</Text>
          <Section style={card}>
            <pre style={pre}>{markdownBody}</pre>
          </Section>
          <Text style={muted}>
            Read the web version with charts at{' '}
            <Link href="https://daosentinel.xyz/digest" style={link}>
              daosentinel.xyz/digest
            </Link>
            .
          </Text>
          <Text style={muted}>
            Don't want these?{' '}
            <Link href="https://daosentinel.xyz/unsubscribe" style={link}>
              Unsubscribe
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' };
const container = { margin: '0 auto', padding: '32px 24px', maxWidth: '640px' };
const h1 = { color: '#22c55e', fontSize: '24px', margin: '0' };
const muted = { color: '#a3a3a3', fontSize: '13px', lineHeight: '20px' };
const card = {
  backgroundColor: '#171717',
  border: '1px solid #262626',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
};
const pre = {
  whiteSpace: 'pre-wrap' as const,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  lineHeight: '20px',
  color: '#fafafa',
  margin: 0,
};
const link = { color: '#22c55e' };
