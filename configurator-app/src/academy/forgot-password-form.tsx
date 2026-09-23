// Ported from b2b-platform apps/user/src/components/auth/forgot-password
import { memo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, AtSign, KeyRound, Loader2, Mail } from 'lucide-react';

import { Button, FieldLabel, FieldMessage, Input, authInputClass } from './ui';

interface Props {
  pending: boolean;
  error?: string;
  onSubmit: (email: string) => Promise<void> | void;
  loginHref: string;
}

function ForgotPasswordForm({ pending, error, onSubmit, loginHref }: Props) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('Please enter a valid email address'); return; }
    setFieldError('');
    await onSubmit(email.trim());
    setSubmitted(true);
  };

  const shell = (children: React.ReactNode) => (
    <div className="relative flex w-full items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="border-border shadow-dark/5 rounded-2xl border bg-white p-8 shadow-xl backdrop-blur-sm">{children}</div>
      </div>
    </div>
  );

  if (submitted && !error) {
    return shell(
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="bg-primary/10 flex h-14 w-14 items-center justify-center rounded-2xl">
            <Mail className="text-primary h-7 w-7" />
          </div>
        </div>
        <h1 className="text-foreground mb-2 text-2xl font-bold">Check your email</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          If that address has an account, a link to choose a new password is on its way.
        </p>
        <a href={loginHref} className="text-primary hover:text-primary-dark inline-flex items-center gap-2 text-sm font-medium hover:underline">
          <ArrowLeft className="size-4" /> Back to Sign In
        </a>
      </div>,
    );
  }

  return shell(
    <>
      <div className="mb-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="bg-primary/10 flex h-14 w-14 items-center justify-center rounded-2xl">
            <KeyRound className="text-primary h-7 w-7" />
          </div>
        </div>
        <h1 className="text-foreground mb-2 text-2xl font-bold">Forgot password?</h1>
        <p className="text-muted-foreground text-sm">Enter your email and we'll send you a reset link</p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
        <div>
          <FieldLabel htmlFor="forgot-email">Email Address</FieldLabel>
          <div className="relative">
            <AtSign className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input id="forgot-email" type="email" placeholder="you@youracademy.com" autoComplete="email" className={authInputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <FieldMessage>{fieldError || error}</FieldMessage>
        </div>
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-dark group shadow-primary/25 h-11 w-full rounded-xl font-semibold shadow-lg transition-all duration-300">
          <div className="flex items-center justify-center gap-2">
            {pending ? <><Loader2 className="size-4 animate-spin" /><span className="text-sm">Sending...</span></> : <><span className="text-sm">Send Reset Link</span><ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" /></>}
          </div>
        </Button>
      </form>
      <div className="mt-6 text-center">
        <a href={loginHref} className="text-primary hover:text-primary-dark inline-flex items-center gap-2 text-sm font-medium hover:underline">
          <ArrowLeft className="size-4" /> Back to Sign In
        </a>
      </div>
    </>,
  );
}

export default memo(ForgotPasswordForm);
