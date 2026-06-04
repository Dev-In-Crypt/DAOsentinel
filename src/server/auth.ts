import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Resend from 'next-auth/providers/resend';
import { Resend as ResendClient } from 'resend';
import { renderMagicLink } from './email/render';
import { db } from './db';
import { users, accounts, sessions, verificationTokens } from './db/schema';

export const { auth, handlers, signIn, signOut } = NextAuth({
  // The adapter's strict generic types fight our extended schema. Cast is safe:
  // it asserts on table shapes at runtime via column names.
  adapter: DrizzleAdapter(db, {
    usersTable: users as never,
    accountsTable: accounts as never,
    sessionsTable: sessions as never,
    verificationTokensTable: verificationTokens as never,
  }),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? 'GovWatch <noreply@govwatch.xyz>',
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const host = new URL(url).host;
        const html = await renderMagicLink({ url, host });
        const client = new ResendClient(provider.apiKey as string);
        await client.emails.send({
          from: provider.from as string,
          to: email,
          subject: `Sign in to ${host}`,
          html,
          text: `Sign in to ${host}: ${url}`,
        });
      },
    }),
  ],
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=1',
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id?: string; plan?: string }).id = user.id;
        (session.user as { id?: string; plan?: string }).plan =
          (user as unknown as { plan?: string }).plan ?? 'free';
      }
      return session;
    },
  },
});
