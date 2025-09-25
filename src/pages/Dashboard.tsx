import { useEffect, useState } from 'react';
// ⬇️ Corrige le chemin si ton fichier est à src/AuthContext.tsx
import { useAuth } from '../auth/AuthContext';
import {
  countSessions, countParticipants, countSponsors, countPresentationsInCongres,
} from '../firestore/firestoreApi';
import { storage } from '../firebase';
import { ref, listAll, getMetadata, getDownloadURL } from 'firebase/storage';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';
import './dashboard.css';

type ProgrammeStats = {
  count: number;
  latest?: { name: string; url: string | null; timeCreated: string | null } | null;
};


export default function Dashboard() {
  const { user } = useAuth();
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [sessions, setSessions] = useState(0);
  const [presentations, setPresentations] = useState(0);
  const [participants, setParticipants] = useState(0);
  const [sponsors, setSponsors] = useState(0);
  const [programme, setProgramme] = useState<ProgrammeStats>({ count: 0, latest: null });

  async function fetchProgrammeStats(): Promise<ProgrammeStats> {
    const baseRef = ref(storage, 'programme');
    const res = await listAll(baseRef);
    const detailed = await Promise.all(
      res.items.map(async (it) => {
        const [meta, url] = await Promise.allSettled([getMetadata(it), getDownloadURL(it)]);
        return {
          name: it.name,
          url: url.status === 'fulfilled' ? url.value : null,
          timeCreated: meta.status === 'fulfilled' ? meta.value.timeCreated ?? null : null,
        };
      })
    );
    const key = `_${congresId}_`;
    const altKey = `${congresId}_`;
    const filtered = detailed.filter(i => i.name.includes(key) || i.name.includes(altKey));
    filtered.sort((a, b) => (b.timeCreated ?? '').localeCompare(a.timeCreated ?? ''));
    return {
      count: filtered.length,
      latest: filtered[0] ? { name: filtered[0].name, url: filtered[0].url, timeCreated: filtered[0].timeCreated } : null,
    };
  }

  async function refresh() {
    try {
      setErr(null);
      setLoading(true);
      const [sCnt, pCnt, spCnt, prCnt, prog] = await Promise.all([
        countSessions(congresId),
        countParticipants(congresId),
        countSponsors(),
        countPresentationsInCongres(congresId),
        fetchProgrammeStats(),
      ]);
      setSessions(sCnt);
      setParticipants(pCnt);
      setSponsors(spCnt);
      setPresentations(prCnt);
      setProgramme(prog);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, congresId]);

  return (
    <div className="dash">
      <div className="dash-toolbar">
        <label>
          Congrès ID&nbsp;
          <input value={congresId} onChange={e => setCongresId(e.target.value)} />
        </label>
        <div className="spacer" />
        <button className="btn-ghost" onClick={refresh} disabled={loading}>↻ Actualiser</button>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="cards">
        <a className="card" href="/programme">
          <div className="card-title">Sessions</div>
          <div className="card-value">{loading ? '…' : sessions}</div>
          <div className="card-sub">Total de sessions</div>
        </a>

        <a className="card" href="/programme">
          <div className="card-title">Présentations</div>
          <div className="card-value">{loading ? '…' : presentations}</div>
          <div className="card-sub">Somme sur toutes les sessions</div>
        </a>

        <a className="card" href="/participants">
          <div className="card-title">Participants</div>
          <div className="card-value">{loading ? '…' : participants}</div>
          <div className="card-sub">Inscrits (congrès)</div>
        </a>

        <a className="card" href="/sponsors">
          <div className="card-title">Sponsors</div>
          <div className="card-value">{loading ? '…' : sponsors}</div>
          <div className="card-sub">Partenaires listés</div>
        </a>

        <a className="card wide" href="/importation-pdf">
          <div className="row-between">
            <div>
              <div className="card-title">Programme PDFs</div>
              <div className="card-value">{loading ? '…' : programme.count}</div>
              <div className="card-sub">
                {programme.latest?.timeCreated
                  ? `Dernier : ${new Date(programme.latest.timeCreated).toLocaleString('fr-FR')}`
                  : 'Dernier : —'}
              </div>
            </div>
            <div>
              {programme.latest?.url ? (
                <a className="btn-primary" href={programme.latest.url} target="_blank" rel="noreferrer">
                  Télécharger
                </a>
              ) : (
                <span className="hint">Aucun PDF</span>
              )}
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
