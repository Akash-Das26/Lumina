import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '@/lib/auth-schemas';
import {
  UNREACHABLE_MESSAGE,
  formatApiFieldErrors,
  formatFormErrorMessage,
  formatSubmitError,
  formatZodErrors,
  getHttpStatus,
  withoutFieldError,
  type FieldErrors,
} from '@/lib/form-errors';

type RegisterField = 'name' | 'email' | 'password';

const VALID = { name: 'Ada Lovelace', email: 'ada@test.dev', password: 'password123' };

function registerErrors(input: unknown): FieldErrors<RegisterField> {
  const result = registerSchema.safeParse(input);
  if (result.success) throw new Error('expected the input to be rejected');
  return formatZodErrors<RegisterField>(result.error);
}

describe('registerSchema', () => {
  it('accepts valid input and normalises the email and name', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      name: '  Ada Lovelace  ',
      email: '  ADA@Test.DEV ',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ...VALID });
  });

  it('rejects an invalid email with a friendly message', () => {
    expect(registerErrors({ ...VALID, email: 'bbjhbvb@ewfw' })).toEqual({
      email: 'Please enter a valid email address (e.g. name@example.com)',
    });
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(registerErrors({ ...VALID, password: '123456' })).toEqual({
      password: 'Password must be at least 8 characters',
    });
  });

  it('rejects an empty (or whitespace-only) name', () => {
    expect(registerErrors({ ...VALID, name: '   ' })).toEqual({
      name: 'Please enter your name',
    });
  });

  it('rejects a missing name', () => {
    const { name: _omitted, ...withoutName } = VALID;
    expect(registerErrors(withoutName)).toEqual({ name: 'Please enter your name' });
  });

  it('reports every invalid field at once', () => {
    expect(registerErrors({ name: '', email: 'bbjhbvb@ewfw', password: '123456' })).toEqual({
      name: 'Please enter your name',
      email: 'Please enter a valid email address (e.g. name@example.com)',
      password: 'Password must be at least 8 characters',
    });
  });

  it('rejects an empty form with one message per field', () => {
    expect(registerErrors({ name: '', email: '', password: '' })).toEqual({
      name: 'Please enter your name',
      email: 'Please enter a valid email address (e.g. name@example.com)',
      password: 'Password must be at least 8 characters',
    });
  });

  it('never produces raw Zod output (no codes, formats or regex patterns)', () => {
    const messages = Object.values(
      registerErrors({ name: '', email: 'bbjhbvb@ewfw', password: '123456' }),
    ).join(' ');

    expect(messages).not.toMatch(/invalid_format|too_small|pattern|origin|"code"/);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: ' ada@test.dev ', password: 'password123' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ email: 'ada@test.dev', password: 'password123' });
  });

  it('reports an invalid email and a short password together', () => {
    const result = loginSchema.safeParse({ email: 'nope', password: 'short' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatZodErrors<'email' | 'password'>(result.error)).toEqual({
      email: 'Please enter a valid email address (e.g. name@example.com)',
      password: 'Password must be at least 8 characters',
    });
  });
});

describe('formatApiFieldErrors', () => {
  it('maps the server 400 shape to one message per field', () => {
    const apiError = {
      status: 400,
      data: {
        error: 'Validation failed',
        fieldErrors: { email: ['Please enter a valid email address (e.g. name@example.com)'] },
        formErrors: [],
      },
    };

    expect(formatApiFieldErrors<RegisterField>(apiError)).toEqual({
      email: 'Please enter a valid email address (e.g. name@example.com)',
    });
  });

  it('returns nothing for errors without a field mapping', () => {
    expect(formatApiFieldErrors(new Error('network down'))).toEqual({});
    expect(formatApiFieldErrors({ data: { error: 'Email already registered' } })).toEqual({});
    expect(formatApiFieldErrors({ data: { fieldErrors: 'not-an-object' } })).toEqual({});
  });
});

describe('formatFormErrorMessage', () => {
  const FALLBACK = 'Unable to create your account. Please try again.';

  it('passes a plain server message through (e.g. duplicate email)', () => {
    expect(formatFormErrorMessage({ data: { error: 'Email already registered' } }, FALLBACK)).toBe(
      'Email already registered',
    );
  });

  it('falls back when the error carries no message', () => {
    expect(formatFormErrorMessage(new Error('network down'), FALLBACK)).toBe(FALLBACK);
    expect(formatFormErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(formatFormErrorMessage({ data: { error: '   ' } }, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for status-only and raw payload messages', () => {
    expect(formatFormErrorMessage({ data: { error: 'Validation failed' } }, FALLBACK)).toBe(FALLBACK);
    expect(
      formatFormErrorMessage(
        { data: { error: '[{"code":"invalid_format","pattern":"/^(?!\\.)/"}]' } },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      formatFormErrorMessage({ data: { error: '{"code":"too_small","minimum":8}' } }, FALLBACK),
    ).toBe(FALLBACK);
  });

  it('falls back when the error field is not a string', () => {
    expect(formatFormErrorMessage({ data: { error: [{ code: 'too_small' }] } }, FALLBACK)).toBe(
      FALLBACK,
    );
  });

  it('falls back for the server\'s own failure copy and any HTML error page', () => {
    expect(formatFormErrorMessage({ data: { error: 'Internal server error' } }, FALLBACK)).toBe(
      FALLBACK,
    );
    expect(
      formatFormErrorMessage(
        { data: { error: '<!DOCTYPE html><html><pre>Error: ...</pre></html>' } },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });
});

describe('getHttpStatus', () => {
  it('reads the status of a thrown API error', () => {
    expect(getHttpStatus({ status: 409, data: {} })).toBe(409);
    expect(getHttpStatus({ status: 500 })).toBe(500);
  });

  it('is null when the request never reached the server', () => {
    expect(getHttpStatus(new TypeError('Failed to fetch'))).toBeNull();
    expect(getHttpStatus(undefined)).toBeNull();
    expect(getHttpStatus({ status: '409' })).toBeNull();
  });
});

describe('formatSubmitError', () => {
  const FALLBACK = 'Unable to create your account. Please try again.';
  const DUPLICATE = 'An account with this email already exists. Try signing in.';
  const options = { fallback: FALLBACK, statusMessages: { 409: DUPLICATE } };

  it('shows the duplicate-email copy for a 409', () => {
    expect(
      formatSubmitError(
        { status: 409, data: { error: 'An account with this email already exists' } },
        options,
      ),
    ).toBe(DUPLICATE);
  });

  it('says the server is unreachable when no response arrived at all', () => {
    expect(formatSubmitError(new TypeError('Failed to fetch'), options)).toBe(UNREACHABLE_MESSAGE);
    expect(formatSubmitError(new Error('network down'), options)).toBe(UNREACHABLE_MESSAGE);
  });

  it('treats a gateway failure (502/503/504) as unreachable too', () => {
    expect(
      formatSubmitError({ status: 503, data: { error: 'The API server is not reachable.' } }, options),
    ).toBe(UNREACHABLE_MESSAGE);
    expect(formatSubmitError({ status: 504, data: 'gateway timeout' }, options)).toBe(
      UNREACHABLE_MESSAGE,
    );
  });

  it('keeps the generic copy for a 500 whose body describes the server failure', () => {
    expect(
      formatSubmitError({ status: 500, data: { error: 'Internal server error' } }, options),
    ).toBe(FALLBACK);
  });

  it('passes other server messages (401, 429) through', () => {
    expect(
      formatSubmitError({ status: 401, data: { error: 'Invalid email or password' } }, options),
    ).toBe('Invalid email or password');
    expect(
      formatSubmitError(
        { status: 429, data: { error: 'Too many accounts created from this address, please try again later.' } },
        options,
      ),
    ).toBe('Too many accounts created from this address, please try again later.');
  });
});

describe('withoutFieldError', () => {
  it('drops only the edited field, leaving the others in place', () => {
    const errors: FieldErrors<RegisterField> = {
      name: 'Please enter your name',
      password: 'Password must be at least 8 characters',
    };

    expect(withoutFieldError(errors, 'name')).toEqual({
      password: 'Password must be at least 8 characters',
    });
    expect(errors).toHaveProperty('name');
  });

  it('returns the original object when the field has no error', () => {
    const errors: FieldErrors<RegisterField> = { name: 'Please enter your name' };
    expect(withoutFieldError(errors, 'email')).toBe(errors);
  });
});
