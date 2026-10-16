import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Sparkles, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/field-error';
import { loginAuth } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSeo } from '@/lib/seo';
import { loginSchema } from '@/lib/auth-schemas';
import {
  formatApiFieldErrors,
  formatFormErrorMessage,
  formatZodErrors,
  withoutFieldError,
  type FieldErrors,
} from '@/lib/form-errors';

type Field = 'email' | 'password';

const GENERIC_ERROR = 'Unable to sign in. Please try again.';

export default function SignIn() {
  useSeo({
    title: 'Sign in to Lumina AI',
    description: 'Sign in to your Lumina AI workspace and continue your conversations.',
    path: '/sign-in',
  });

  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Field-level problems render under their input; `error` is only for
  // form-level ones (bad credentials, server failure, network).
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const values = () => ({ email, password });

  const edit = (field: Field) => {
    setFieldErrors((prev) => withoutFieldError(prev, field));
    setError(null);
  };

  const handleBlur = (field: Field) => {
    const parsed = loginSchema.safeParse(values());
    const issues = parsed.success ? {} : formatZodErrors<Field>(parsed.error);
    setFieldErrors((prev) =>
      issues[field] ? { ...prev, [field]: issues[field] } : withoutFieldError(prev, field),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side check first: instant feedback, no round trip. The server
    // stays the source of truth because this step can be bypassed.
    const parsed = loginSchema.safeParse(values());
    if (!parsed.success) {
      setFieldErrors(formatZodErrors<Field>(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const user = await loginAuth(parsed.data);
      queryClient.setQueryData(['auth', 'me'], user);
      setLocation('/chat');
    } catch (err) {
      const serverFieldErrors = formatApiFieldErrors<Field>(err);
      if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      } else {
        setError(formatFormErrorMessage(err, GENERIC_ERROR));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
          <p className="text-muted-foreground">Sign in to continue to Lumina</p>
        </div>

        {/* noValidate: the browser's own bubbles would pre-empt the inline messages below. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {error && (
            <p className="text-sm text-destructive" data-testid="sign-in-error" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                edit('email');
              }}
              onBlur={() => handleBlur('email')}
              placeholder="you@example.com"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              data-testid="input-email"
              className="h-12"
            />
            <FieldError id="email-error" message={fieldErrors.email} data-testid="email-error" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                edit('password');
              }}
              onBlur={() => handleBlur('password')}
              placeholder="••••••••"
              required
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              data-testid="input-password"
              className="h-12"
            />
            <FieldError
              id="password-error"
              message={fieldErrors.password}
              data-testid="password-error"
            />
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={submitting} data-testid="button-sign-in">
            {submitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/sign-up" className="text-primary hover:underline font-medium" data-testid="link-sign-up">
              Sign up
            </Link>
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground" data-testid="link-home">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
