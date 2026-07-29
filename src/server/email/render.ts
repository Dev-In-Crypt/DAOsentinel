import { createElement } from 'react';
import { render } from '@react-email/components';
import MagicLinkEmail, { type MagicLinkEmailProps } from '@/emails/MagicLinkEmail';
import WhaleAlertEmail, { type WhaleAlertEmailProps } from '@/emails/WhaleAlertEmail';
import WeeklyDigestEmail, { type WeeklyDigestEmailProps } from '@/emails/WeeklyDigestEmail';
import OrgOnboardingEmail, { type OrgOnboardingEmailProps } from '@/emails/OrgOnboardingEmail';
import OrgReportEmail, { type OrgReportEmailProps } from '@/emails/OrgReportEmail';

export async function renderMagicLink(p: MagicLinkEmailProps) {
  return render(createElement(MagicLinkEmail, p));
}

export async function renderWhaleAlert(p: WhaleAlertEmailProps) {
  return render(createElement(WhaleAlertEmail, p));
}

export async function renderWeeklyDigest(p: WeeklyDigestEmailProps) {
  return render(createElement(WeeklyDigestEmail, p));
}

export async function renderOrgOnboarding(p: OrgOnboardingEmailProps) {
  return render(createElement(OrgOnboardingEmail, p));
}

/** The paid org-scoped weekly report (TODO-070) — not the public `renderWeeklyDigest`. */
export async function renderOrgReport(p: OrgReportEmailProps) {
  return render(createElement(OrgReportEmail, p));
}
