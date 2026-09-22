// Ported from b2b-platform apps/user/src/components/auth/signup/signup-form.tsx.
// One field added: the academy name, which becomes the organization.
import { memo, useState, type FormEvent } from 'react';
import { ArrowRight, AtSign, Eye, EyeOff, GraduationCap, Key, Loader2, User } from 'lucide-react';

import { Button, FieldLabel, FieldMessage, Input, authInputClass } from './ui';
import { LOGO_SRC } from './auth-layout';

export interface SignupValues {
  name: string;
  academyName: string;
  email: string;
  password: string;
}

interface SignupFormProps {
  pending: boolean;
  error?: string;
  onSubmit: (values: SignupValues) => void;
  loginHref: string;
}

type Errors = Partial<Record<keyof SignupValues | 'confirmPassword', string>>;

function SignupForm({ pending, error, onSubmit, loginHref }: SignupFormProps) {
  const [values, setValues] = useState<SignupValues & { confirmPassword: string }>({
    name: '', academyName: '', email: '', password: '', confirmPassword: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Same rules as the B2B app's zod schema.
    const next: Errors = {};
    if (values.name.trim().length < 2) next.name = 'Name must be at least 2 characters';
    if (values.academyName.trim().length < 2) next.academyName = 'Academy name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) next.email = 'Please enter a valid email address';
    if (values.password.length < 8) next.password = 'Password must be at least 8 characters';
    if (!values.confirmPassword) next.confirmPassword = 'Please confirm your password';
    else if (values.password !== values.confirmPassword) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      name: values.name.trim(),
      academyName: values.academyName.trim(),
      email: values.email.trim(),
      password: values.password,
    });
  };

  const eye = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors duration-200"
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

  return (
    <div className="relative flex w-full items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="border-border shadow-dark/5 rounded-2xl border bg-white p-8 shadow-xl backdrop-blur-sm">
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center md:hidden">
              <img src={LOGO_SRC} alt="DSPLN" className="h-12 w-auto" />
            </div>
            <h1 className="text-foreground mb-2 text-2xl font-bold">Create your account</h1>
            <p className="text-muted-foreground text-sm">
              Sign up to start designing and selling gear for your academy
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <FieldLabel htmlFor="signup-name">Full Name</FieldLabel>
              <div className="relative">
                <User className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="signup-name" type="text" placeholder="John Doe" autoComplete="name" className={authInputClass} value={values.name} onChange={set('name')} />
              </div>
              <FieldMessage>{errors.name}</FieldMessage>
            </div>

            <div>
              <FieldLabel htmlFor="signup-academy">Academy Name</FieldLabel>
              <div className="relative">
                <GraduationCap className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="signup-academy" type="text" placeholder="Brooklyn Jiu-Jitsu Academy" autoComplete="organization" className={authInputClass} value={values.academyName} onChange={set('academyName')} />
              </div>
              <FieldMessage>{errors.academyName}</FieldMessage>
            </div>

            <div>
              <FieldLabel htmlFor="signup-email">Email Address</FieldLabel>
              <div className="relative">
                <AtSign className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="signup-email" type="email" placeholder="you@youracademy.com" autoComplete="email" className={authInputClass} value={values.email} onChange={set('email')} />
              </div>
              <FieldMessage>{errors.email}</FieldMessage>
            </div>

            <div>
              <FieldLabel htmlFor="signup-password">Password</FieldLabel>
              <div className="relative">
                <Key className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="signup-password" type={showPassword ? 'text' : 'password'} placeholder="Create a password" autoComplete="new-password" className={`${authInputClass} pr-10`} value={values.password} onChange={set('password')} />
                {eye(showPassword, () => setShowPassword(!showPassword))}
              </div>
              <FieldMessage>{errors.password}</FieldMessage>
            </div>

            <div>
              <FieldLabel htmlFor="signup-confirm">Confirm Password</FieldLabel>
              <div className="relative">
                <Key className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input id="signup-confirm" type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm your password" autoComplete="new-password" className={`${authInputClass} pr-10`} value={values.confirmPassword} onChange={set('confirmPassword')} />
                {eye(showConfirmPassword, () => setShowConfirmPassword(!showConfirmPassword))}
              </div>
              <FieldMessage>{errors.confirmPassword}</FieldMessage>
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
                      <span className="text-sm">Creating account...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">Create Account</span>
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </div>
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Already have an account?{' '}
              <a href={loginHref} className="text-primary hover:text-primary-dark font-medium transition-colors hover:underline">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(SignupForm);
