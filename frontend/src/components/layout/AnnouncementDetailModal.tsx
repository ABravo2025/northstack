import { useState } from 'react';
import Modal from '../common/Modal';
import LegalDocumentModal from '../common/LegalDocumentModal';
import type { LegalPolicyType, PlatformAnnouncement } from '../../api';

const POLICY_DOC: Record<LegalPolicyType, { doc: 'terms' | 'privacy' | 'refund'; label: string }> = {
  terms_of_service: { doc: 'terms', label: 'Terms of Service' },
  privacy_policy: { doc: 'privacy', label: 'Privacy Policy' },
  refund_policy: { doc: 'refund', label: 'Refund Policy' },
};

interface AnnouncementDetailModalProps {
  announcement: PlatformAnnouncement;
  onClose: () => void;
}

// Reuses LegalDocumentModal (already fetches the live document from joinnorthstack.com,
// which itself carries an "Effective Date" line) instead of duplicating policy text here —
// this modal's own `body` is just a summary of what changed, not the document itself.
export default function AnnouncementDetailModal({ announcement, onClose }: AnnouncementDetailModalProps) {
  const [viewingDoc, setViewingDoc] = useState(false);
  const policyDoc = announcement.policyType ? POLICY_DOC[announcement.policyType] : null;

  return (
    <>
      <Modal open={!viewingDoc} title={announcement.title} onClose={onClose}>
        <p className="text-ink-muted text-xs mb-2">
          {new Date(announcement.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <p className="whitespace-pre-line">{announcement.body}</p>
        {policyDoc && (
          <button type="button" className="table-link text-sm mt-3" onClick={() => setViewingDoc(true)}>
            View the full {policyDoc.label}
          </button>
        )}
      </Modal>
      {viewingDoc && policyDoc && <LegalDocumentModal initialDoc={policyDoc.doc} onClose={() => setViewingDoc(false)} />}
    </>
  );
}
