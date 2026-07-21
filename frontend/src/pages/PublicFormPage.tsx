import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type PublicFormConfig } from '../api';
import AuthLayout from '../components/AuthLayout';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_ID = 'turnstile-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export default function PublicFormPage() {
  const { tenantSlug, formSlug } = useParams<{ tenantSlug: string; formSlug: string }>();
  const [config, setConfig] = useState<PublicFormConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState('');

  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantSlug || !formSlug) return;
    api
      .getPublicFormConfig(tenantSlug, formSlug)
      .then(setConfig)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [tenantSlug, formSlug]);

  useEffect(() => {
    if (!config) return;

    // Guard against React StrictMode's dev-only double-invoke of effects —
    // without this, Turnstile's render() gets called twice into the same
    // container and the second call corrupts the widget.
    const renderWidget = () => {
      if (window.turnstile && turnstileRef.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
        });
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else if (!document.getElementById(TURNSTILE_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.body.appendChild(script);
    }

    return () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [config]);

  const findCustomFieldDef = (key: string) => config?.customFieldDefs.find((f) => `cf:${f.id}` === key);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug || !formSlug || !config) return;
    if (!turnstileToken) {
      setError('Please complete the CAPTCHA challenge.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.submitPublicForm(tenantSlug, formSlug, {
        firstName,
        lastName,
        email,
        values,
        turnstileToken,
      });
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthLayout>
        <p>Loading...</p>
      </AuthLayout>
    );
  }

  if (notFound || !config) {
    return (
      <AuthLayout>
        <h2 className="auth-title">Form not found</h2>
        <p className="text-sm text-gray-500">
          This form doesn't exist or is no longer accepting submissions.
        </p>
      </AuthLayout>
    );
  }

  if (submitted) {
    return (
      <AuthLayout>
        <h2 className="auth-title">Thank you!</h2>
        <p className="text-sm text-gray-500">Your submission has been received.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="auth-title">{config.name}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="pf-firstName">First Name *</label>
          <input
            id="pf-firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={submitting}
          />
        </div>
        <div className="form-group">
          <label htmlFor="pf-lastName">Last Name *</label>
          <input
            id="pf-lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={submitting}
          />
        </div>
        <div className="form-group">
          <label htmlFor="pf-email">Email *</label>
          <input
            id="pf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={submitting}
          />
        </div>

        {config.fields.map((field) => {
          const customDef = findCustomFieldDef(field.key);
          const label = customDef
            ? customDef.name
            : field.key === 'department'
              ? 'Department'
              : field.key === 'company'
                ? 'Company'
                : field.key;
          const inputId = `pf-${field.key}`;
          const displayLabel = field.required ? `${label} *` : label;

          if (customDef?.fieldType === 'select') {
            return (
              <div className="form-group" key={field.key}>
                <label htmlFor={inputId}>{displayLabel}</label>
                <select
                  id={inputId}
                  value={values[field.key] || ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  required={field.required}
                  disabled={submitting}
                >
                  <option value="">-- select --</option>
                  {(JSON.parse(customDef.options || '[]') as string[]).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          const inputType =
            customDef?.fieldType === 'number'
              ? 'number'
              : customDef?.fieldType === 'date'
                ? 'date'
                : customDef?.fieldType === 'email'
                  ? 'email'
                  : 'text';

          return (
            <div className="form-group" key={field.key}>
              <label htmlFor={inputId}>{displayLabel}</label>
              <input
                id={inputId}
                type={inputType}
                value={values[field.key] || ''}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                required={field.required}
                disabled={submitting}
              />
            </div>
          );
        })}

        <div className="form-group">
          <div ref={turnstileRef} />
        </div>

        {error && <p className="alert-error mb-3">{error}</p>}

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </AuthLayout>
  );
}
