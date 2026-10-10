'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flattenTree, type TreeNode, type TreeSection } from '../../lib/tree.ts';
import { Modal } from '../ui/dialogs';
import { StatusDot, cx } from '../ui/primitives';

/**
 * Find any node: partners, QR points, printers, people, and every section. On a
 * phone it is a full sheet, with the keyboard closed until the field is tapped.
 * Arrow keys move, Enter opens, Escape closes.
 */
export function Palette({ open, onClose, sections, onPick }: { open: boolean; onClose: () => void; sections: TreeSection[]; onPick: (href: string) => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const nodes = useMemo(() => flattenTree(sections), [sections]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? nodes.filter((n) => `${n.label} ${n.meta ?? ''} ${n.href}`.toLowerCase().includes(q))
      : nodes.filter((n) => !n.children || n.children.length === 0).slice(0, 12);
    return matches.slice(0, 40);
  }, [nodes, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  const pick = (node: TreeNode | undefined) => {
    if (!node) return;
    onPick(node.href);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Find" full>
      <div className="flex min-h-0 flex-col gap-3">
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[index] ? `${listId}-${index}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(results[index]);
            }
          }}
          placeholder="A partner, QR point code, printer ID or email"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-h-[48px] rounded-2xl border border-line bg-bg px-4 text-ink placeholder:text-mute/80 focus:border-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/40"
        />

        <ul id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-mute">Nothing matches “{query}”.</li>}
          {results.map((node, i) => (
            <li
              key={node.id + node.href}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => pick(node)}
              className={cx('flex min-h-[52px] cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px]', i === index ? 'bg-brand text-brand-ink' : 'text-ink hover:bg-raised')}
            >
              {node.tone ? <StatusDot tone={i === index ? 'muted' : node.tone} /> : <span className="w-2.5" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{node.label}</span>
              {node.meta && <span className={cx('shrink-0 truncate text-xs', i === index ? 'text-brand-ink/80' : 'text-mute')}>{node.meta}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
