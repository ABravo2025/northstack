import { useTranslation } from 'react-i18next';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation('auth');
  return (
    <div className="auth-screen">
      <div className="auth-left">
        <div className="auth-left-inner">{children}</div>
      </div>
      <div className="auth-right">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-brand">
          <img src="/logo-horizontal-light.svg" alt="Northstack" className="auth-brand-logo" />
          <p className="auth-tagline">{t('tagline')}</p>
        </div>
      </div>
    </div>
  );
}
