import { useEffect, useRef, useState } from 'react';
import { markNotificationsRead, type NotificationItem } from '../api';
import { relativeTime } from '../format';
import { Icon } from './Icon';

/** Bell + dropdown feed. Opening it marks everything read. */
export function Notifications({ feed, onRead }: { feed: { unread: number; items: NotificationItem[] }; onRead: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && feed.unread > 0) {
      void markNotificationsRead().then(onRead, () => {});
    }
  };

  return (
    <div className="notes" ref={ref}>
      <button className="bell" onClick={toggle} aria-expanded={open} aria-label={`Notifications${feed.unread ? `, ${feed.unread} unread` : ''}`}>
        <Icon name="bell" />
        {feed.unread > 0 && <span className="bell-count">{feed.unread > 99 ? '99+' : feed.unread}</span>}
      </button>
      {open && (
        <div className="notes-panel" role="dialog" aria-label="Notifications">
          {feed.items.length === 0 ? (
            <p className="muted small notes-empty">No notifications yet. Pick hits, misses and bets ready to sync show up here.</p>
          ) : (
            <ul>
              {feed.items.map((n) => (
                <li key={n.id} className={`note note-${n.kind.toLowerCase()} ${n.readAt ? '' : 'unread'}`}>
                  <div className="note-title">{n.title}</div>
                  <div className="note-body muted">{n.body}</div>
                  <div className="note-time muted">{relativeTime(n.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
