import { createElement } from 'react';
import { render } from '@react-email/components';
import MagicLinkEmail, { type MagicLinkEmailProps } from '@/emails/MagicLinkEmail';
import WhaleAlertEmail, { type WhaleAlertEmailProps } from '@/emails/WhaleAlertEmail';
import WeeklyDigestEmail, { type WeeklyDigestEmailProps } from '@/emails/WeeklyDigestEmail';

export async function renderMagicLink(p: MagicLinkEmailProps) {
  return render(createElement(MagicLinkEmail, p));
}

export async function renderWhaleAlert(p: WhaleAlertEmailProps) {
  return render(createElement(WhaleAlertEmail, p));
}

export async function renderWeeklyDigest(p: WeeklyDigestEmailProps) {
  return render(createElement(WeeklyDigestEmail, p));
}
