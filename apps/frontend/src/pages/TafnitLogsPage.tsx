import { useEffect, useState } from 'react';
import api from '../services/api';

interface TafnitLog {
  id: number;
  receivedAt: string;
  ip: string;
  orderNumber: string | null;
  rawBody: string;
  result: { created: string[]; skipped: string[]; failed: string[] } | null;
}

export default function TafnitLogsPage() {
  const [logs, setLogs] = useState<TafnitLog[]>([]);
  const [selected, setSelected] = useState<TafnitLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tafnit/logs?limit=200').then((r: any) => {
      setLogs(r.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const statusBadge = (log: TafnitLog) => {
    if (!log.result) return <span className="badge pending">ממתין</span>;
    if (log.result.created?.length) return <span className="badge success">נוצר</span>;
    if (log.result.skipped?.length) return <span className="badge skipped">כבר קיים</span>;
    if (log.result.failed?.length) return <span className="badge error">שגיאה</span>;
    return <span className="badge pending">–</span>;
  };

  return (
    <div style={{ padding: '24px', direction: 'rtl' }}>
      <h2 style={{ marginBottom: 16 }}>לוג קבלת הזמנות מתפנית</h2>

      {loading ? (
        <p>טוען...</p>
      ) : logs.length === 0 ? (
        <p>אין רשומות עדיין.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#fff' }}>
                <th style={th}>#</th>
                <th style={th}>זמן קבלה</th>
                <th style={th}>IP</th>
                <th style={th}>מספר הזמנה</th>
                <th style={th}>סטטוס</th>
                <th style={th}>JSON</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={td}>{log.id}</td>
                  <td style={td}>{new Date(log.receivedAt).toLocaleString('he-IL')}</td>
                  <td style={td}>{log.ip}</td>
                  <td style={td}>{log.orderNumber ?? '–'}</td>
                  <td style={td}>{statusBadge(log)}</td>
                  <td style={td}>
                    <button
                      onClick={() => setSelected(log)}
                      style={{ padding: '4px 12px', cursor: 'pointer', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc' }}
                    >
                      צפה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 800, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>הזמנה {selected.orderNumber} — {new Date(selected.receivedAt).toLocaleString('he-IL')}</strong>
              <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {selected.result && (
              <div style={{ fontSize: 13, color: '#475569' }}>
                {selected.result.created?.length > 0 && <span style={{ color: '#16a34a' }}>נוצר: {selected.result.created.join(', ')} </span>}
                {selected.result.skipped?.length > 0 && <span style={{ color: '#d97706' }}>כבר קיים: {selected.result.skipped.join(', ')} </span>}
                {selected.result.failed?.length > 0 && <span style={{ color: '#dc2626' }}>שגיאה: {selected.result.failed.join(', ')}</span>}
              </div>
            )}
            <pre style={{ background: '#f1f5f9', padding: 16, borderRadius: 6, overflowY: 'auto', flex: 1, fontSize: 12, textAlign: 'left', direction: 'ltr' }}>
              {selected.rawBody}
            </pre>
          </div>
        </div>
      )}

      <style>{`
        .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; }
        .badge.success { background: #dcfce7; color: #16a34a; }
        .badge.skipped { background: #fef9c3; color: #854d0e; }
        .badge.error { background: #fee2e2; color: #dc2626; }
        .badge.pending { background: #e2e8f0; color: #475569; }
      `}</style>
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 12px', textAlign: 'right' };
