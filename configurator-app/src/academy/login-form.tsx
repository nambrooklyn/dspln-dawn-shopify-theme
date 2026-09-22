// Ported from b2b-platform apps/user/src/components/auth/login/login-form.tsx
import { memo, useState, type FormEvent } from 'react';
import { ArrowRight, AtSign, Eye, EyeOff, Key, Loader2 } from 'lucide-react';

import { Button, FieldLabel, FieldMessage, Input, authInputClass } from './ui';
import { LOGO_SRC } from './auth-layout';

interface LoginFormProps {
  pending: boolean;
  error?: string;
  onSubmit: (values: { email: string; password: string }) => void;
  signupHref: string;
  forgotHref: string;
}

function LoginForm({ pending, error, onSubmit, signupHref, forgotHref }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Please enter a valid email address';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ email: email.trim(), password });
  };

  return (
    <div className="relative flex w-full items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="border-border shadow-dark/5 rounded-2xl border bg-white p-8 shadow-xl backdrop-blur-sm">
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center md:hidden">
              <img src={LOGO_SRC} alt="DSPLN" className="h-12 w-auto" />
            </div>
            <h1 className="text-foreground mb-2 text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Sign in to your academy to design, publish and manage orders
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <FieldLabel htmlFor="login-email">Email Address</FieldLabel>
              <div className="relative">
                <AtSign className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="login-email" type="email" placeholder="you@youracademy.com" autoComplete="email" className={authInputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <FieldMessage>{errors.email}</FieldMessage>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <FieldLabel htmlFor="login-password" className="mb-0">Password</FieldLabel>
                <a href={forgotHref} className="text-primary hover:text-primary-dark text-xs font-medium hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Key className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="login-password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" className={`${authInputClass} pr-10`} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors duration-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <FieldMessage>{errors.password}</FieldMessage>
            </div>

            <FieldMessage>{error}</FieldMessage>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={pending}
                className="bg-primary hover:bg-primary-dark group shadow-primary/25 h-11 w-full rounded-xl font-semibold shadow-lg transition-all duration-300"
              >
                <div className="flex items-center justify-center gap-2">
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span className="text-sm">Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">Sign In</span>
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </div>
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Don't have an account?{' '}
              <a href={signupHref} className="text-primary hover:text-primary-dark font-medium transition-colors hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(LoginForm);
