import type { ReactNode } from 'react';

// Deliberately not a full markdown parser (no headers/lists/links/code) — the
// spec asks for "resaltar partes" (highlight parts), i.e. bold/italic
// emphasis inside an otherwise plain-text Note description. Renders to real
// React elements (never dangerouslySetInnerHTML), so there's no XSS surface
// from user-supplied text.
function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={`${keyPrefix}-${i++}`}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<em key={`${keyPrefix}-${i++}`}>{match[2]}</em>);
    else nodes.push(<em key={`${keyPrefix}-${i++}`}>{match[3]}</em>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function renderNoteDescription(description: string): ReactNode {
  return description.split('\n').map((line, i) => (
    <p key={i} className="note-body-line">
      {line.trim() ? renderInlineMarkdown(line, `l${i}`) : ' '}
    </p>
  ));
}
