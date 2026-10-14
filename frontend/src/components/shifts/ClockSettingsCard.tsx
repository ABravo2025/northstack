import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ClockLocationConfig, type ClockMethod } from '../../api';
import { useToast } from '../common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';
import Modal from '../common/Modal';
import QrCode, { qrSvg } from '../common/QrCode';
import { currentPosition } from '../../lib/geo';
import { publicOrigin } from '../../lib/publicUrl';

const METHODS: ClockMethod[] = ['off', 'qr', 'app', 'qr_or_app'];

const clockUrl = (code: string) => `${publicOrigin()}/clock/${code}`;

// Settings → Shifts → Clock-in (spec-shifts-fase2.md §B, Growth): per location, how people clock in
// (printed QR, the app, both, or off), the QR sheet to print, and the optional position check.
export default function ClockSettingsCard({ token }: { token: string }) {
  const { t } = useTranslation('shifts');
  const toast = useToast();
  const { features } = usePermissions();
  const [rows, setRows] = useState<ClockLocationConfig[] | null>(null);
  const [qrFor, setQrFor] = useState<ClockLocationConfig | null>(null);

  useEffect(() => {
    if (!features.clockIn) return;
    api
      .listClockLocations(token)
      .then((r) => setRows(r.locations.filter((l) => l.isActive)))
      .catch(() => setRows([]));
  }, [token, features.clockIn]);

  const patch = async (row: ClockLocationConfig, data: Partial<ClockLocationConfig>) => {
    try {
      const u = await api.updateClockLocation(token, row.id, data);
      setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, ...u } : r)) ?? prev);
    } catch (e) {
      toast.error(t('clock.failed', { message: (e as Error).message }));
    }
  };

  const takePosition = async (row: ClockLocationConfig) => {
    const geo = await currentPosition();
    if (!geo) return toast.error(t('clock.settings.noPosition'));
    await patch(row, { latitude: geo.lat, longitude: geo.lng, requireLocation: true });
    toast.success(t('clock.settings.positionSaved'));
  };

  const printSheet = async (row: ClockLocationConfig) => {
    if (!row.clockCode) return;
    const svg = await qrSvg(clockUrl(row.clockCode));
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return toast.error(t('clock.settings.popupBlocked'));
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(row.name)}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#111}h1{font-size:34px;margin:0 0 8px}p{font-size:18px;margin:6px 0}.qr{width:420px;height:420px;margin:28px auto}.qr svg{width:100%;height:100%}.small{font-size:13px;color:#555}</style>
</head><body><h1>${esc(t('clock.settings.sheetTitle'))}</h1><p>${esc(row.name)}</p><div class="qr">${svg}</div>
<p>${esc(t('clock.settings.sheetStep'))}</p><p class="small">${esc(clockUrl(row.clockCode))}</p>
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  if (!features.clockIn) {
    return (
      <section className="card rules-card">
        <h3 className="card-title">{t('clock.settings.title')}</h3>
        <p className="rules-note">{t('clock.settings.growthOnly')}</p>
      </section>
    );
  }

  return (
    <section className="card rules-card">
      <h3 className="card-title">{t('clock.settings.title')}</h3>
      <p className="rules-lead">{t('clock.settings.lead')}</p>
      <div className="flex flex-col gap-4">
        {(rows ?? []).map((row) => (
          <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-line p-3 dark:border-dark-line">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{row.name}</span>
              <div className="mini-toggle-row" role="group" aria-label={t('clock.settings.method')}>
                {METHODS.map((m) => (
                  <button key={m} type="button" className={`mini-toggle-opt ${row.clockMethod === m ? 'active' : ''}`} onClick={() => patch(row, { clockMethod: m })}>
                    {t(`clock.method.${m}`)}
                  </button>
                ))}
              </div>
            </div>
            {row.clockMethod !== 'off' && (
              <>
                {(row.clockMethod === 'qr' || row.clockMethod === 'qr_or_app') && row.clockCode && (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="to-link text-sm" onClick={() => setQrFor(row)}>
                      {t('clock.settings.showQr')}
                    </button>
                    <button type="button" className="to-link text-sm" onClick={() => printSheet(row)}>
                      {t('clock.settings.print')}
                    </button>
                  </div>
                )}
                <label className="rules-switch">
                  <input
                    type="checkbox"
                    checked={row.requireLocation}
                    onChange={() => (row.latitude === null && !row.requireLocation ? takePosition(row) : patch(row, { requireLocation: !row.requireLocation }))}
                  />
                  {t('clock.settings.checkPosition')}
                </label>
                {row.requireLocation && (
                  <div className="flex flex-wrap items-end gap-3 pl-1">
                    <small className="text-ink-muted dark:text-dark-ink-muted">
                      {row.latitude !== null ? t('clock.settings.positionSet', { latitude: row.latitude.toFixed(5), longitude: row.longitude!.toFixed(5) }) : t('clock.settings.positionMissing')}
                    </small>
                    <button type="button" className="to-link text-xs" onClick={() => takePosition(row)}>
                      {t('clock.settings.useMyPosition')}
                    </button>
                    <div className="form-group !mb-0">
                      <label htmlFor={`radius-${row.id}`}>{t('clock.settings.radius')}</label>
                      <select id={`radius-${row.id}`} className="!w-auto" value={row.radiusMeters} onChange={(e) => patch(row, { radiusMeters: Number(e.target.value) })}>
                        {[50, 100, 150, 250, 500, 1000].map((m) => (
                          <option key={m} value={m}>
                            {m} m
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <Modal
        open={qrFor !== null}
        title={qrFor ? t('clock.settings.qrTitle', { name: qrFor.name }) : ''}
        onClose={() => setQrFor(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary mr-auto"
              onClick={async () => {
                if (!qrFor) return;
                const r = await api.regenerateClockCode(token, qrFor.id);
                setRows((prev) => prev?.map((x) => (x.id === r.id ? { ...x, clockCode: r.clockCode } : x)) ?? prev);
                setQrFor({ ...qrFor, clockCode: r.clockCode });
                toast.success(t('clock.settings.regenerated'));
              }}
            >
              {t('clock.settings.regenerate')}
            </button>
            <button type="button" className="btn-primary" onClick={() => qrFor && printSheet(qrFor)}>
              {t('clock.settings.print')}
            </button>
          </>
        }
      >
        {qrFor?.clockCode && (
          <div className="flex flex-col items-center gap-3 text-center">
            <QrCode value={clockUrl(qrFor.clockCode)} size={240} label={t('clock.settings.qrTitle', { name: qrFor.name })} />
            <p className="m-0 text-sm">{t('clock.settings.sheetStep')}</p>
            <p className="rules-hint m-0">{t('clock.settings.regenerateHint')}</p>
          </div>
        )}
      </Modal>
    </section>
  );
}
