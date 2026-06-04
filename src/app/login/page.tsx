import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // If already signed in, skip the form and go straight to the app.
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
