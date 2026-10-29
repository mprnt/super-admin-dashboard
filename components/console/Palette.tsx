'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TreeNode } from '../../lib/tree.ts';
import { Modal } from '../ui/dialogs';
import { StatusDot, cx } from '../ui/primitives';

/**
 * Find anything: partners, QR points, printers, people and every page. Arrow keys
 * move, Enter opens, Escape closes. On a phone it is a full sheet.
 */
export function Palette({ open, onClose, index, onPick }: { open: boolean; onClose: () => void; index: TreeNode[]; onPick: (href: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? index.filter((n) => `${n.label} ${n.meta ?? ''} ${n.kind ?? ''} ${n.href}`.toLowerCase().includes(q))
      : index.filter((n) => n.kind === 'Partner' || n.kind === 'Page');
    return matches.slice(0, 40);
  }, [index, query]);

  // Reset on each opening. Setting state here, rather than in an effect, keeps the
  // list from flashing the previous search.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }

  useEffect(() => setActive(0), [query]);

  const pick = (node: TreeNode | undefined) => {
    if (!node) return;
    onPick(node.href);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Find" full focusField>
      <div className="flex min-h-0 flex-col gap-3">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(results[active]);
            }
          }}
          placeholder="A partner, QR point code, printer ID or email"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-lg border border-line-strong bg-bg px-4 text-ink placeholder:text-mute/80 focus:border-brand-text focus:outline-none focus:ring-2 focus:ring-brand-text/20"
        />

        <ul id={listId} role="listbox" aria-label="Results" className="thin-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-mute">Nothing matches “{query}”.</li>}
          {results.map((node, i) => {
            const on = i === active;
            return (
              <li
                key={node.id + node.href}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(node)}
                className={cx(
                  'relative flex min-h-[46px] cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-[14px]',
                  on ? 'bg-brand-soft text-ink' : 'text-ink hover:bg-raised'
                )}
              >
                {on && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-text" />}
                {node.tone ? <StatusDot tone={node.tone} /> : <span className="w-2" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{node.label}</span>
                  {node.meta && <span className="block truncate text-[12px] text-mute">{node.meta}</span>}
                </span>
                {node.kind && (
                  <span className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mute">
                    {node.kind}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
