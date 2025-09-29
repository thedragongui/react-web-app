import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';
import {
  getCongres,
  listParticipants,
  getParticipantDoc,
  listParticipantSubcollection,
  type Participant,
  type Congres,
} from '../firestore/firestoreApi';
import './data-inspector.css';

type ParticipantRow = Participant & { idDoc: string };

type SubcollectionRow = { id: string; [key: string]: unknown };

export default function DataInspectorPage() {
  const { isAdmin } = useAuth();
  const [congresId, setCongresId] = useCongresId();

  const [loading, setLoading] = useState(false);
  const [docData, setDocData] = useState<(Congres & { id: string }) | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedData, setSelectedData] = useState<ParticipantRow | null>(null);
  const [subcollection, setSubcollection] = useState<string>('');
  const [subRows, setSubRows] = useState<SubcollectionRow[]>([]);
  const [subError, setSubError] = useState<string | null>(null);

  async function loadAll(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [docInfo, participantList] = await Promise.all([
        getCongres(id),
        listParticipants(id),
      ]);
      setDocData(docInfo);
      setParticipants(participantList);
      if (participantList.length > 0) {
        setSelectedId(participantList[0].idDoc);
      } else {
        setSelectedId('');
        setSelectedData(null);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (congresId) {
      loadAll(congresId);
    }
  }, [congresId]);

  useEffect(() => {
    let ignore = false;
    async function loadParticipant() {
      if (!selectedId) {
        setSelectedData(null);
        setSubRows([]);
        setSubError(null);
        return;
      }
      try {
        const data = await getParticipantDoc(congresId, selectedId);
        if (!ignore) {
          setSelectedData(data);
        }
      } catch (err: any) {
        if (!ignore) setSubError(err?.message ?? String(err));
      }
    }
    loadParticipant();
    return () => { ignore = true; };
  }, [congresId, selectedId]);

  const filteredParticipants = useMemo(() => participants, [participants]);

  async function handleRefresh() {
    await loadAll(congresId);
  }

  async function handleFetchSubcollection() {
    setSubError(null);
    setSubRows([]);
    if (!selectedId || !subcollection.trim()) return;
    try {
      const rows = await listParticipantSubcollection(congresId, selectedId, subcollection.trim());
      setSubRows(rows as SubcollectionRow[]);
    } catch (err: any) {
      setSubError(err?.message ?? String(err));
    }
  }

  return (
    <div className="inspector-page">
      <header className="inspector-header">
        <h1>Data Inspector</h1>
        <div className="inspector-controls">
          <label>
            Congres ID
            <input value={congresId} onChange={(event) => setCongresId(event.target.value)} />
          </label>
          <button className="btn-primary" onClick={handleRefresh} disabled={loading}>Actualiser</button>
          {!isAdmin && <span className="hint">Lecture seule (non admin).</span>}
        </div>
        {loading && <div className="hint">Chargement...</div>}
        {error && <div className="alert error">Erreur : {error}</div>}
      </header>

      <section className="inspector-section">
        <h2>Document congres/{congresId}</h2>
        <pre className="json-viewer">{docData ? JSON.stringify(docData, null, 2) : 'Aucune donnée'}</pre>
      </section>

      <section className="inspector-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Participants ({filteredParticipants.length})</h3>
          </div>
          <div className="participant-list">
            {filteredParticipants.map((row) => (
              <button
                key={row.idDoc}
                className={`participant-item ${selectedId === row.idDoc ? 'active' : ''}`}
                onClick={() => setSelectedId(row.idDoc)}
              >
                <span className="id">{row.id ?? row.idDoc}</span>
                <span className="name">{[row.prenom, row.nom].filter(Boolean).join(' ') || row.email}</span>
              </button>
            ))}
            {filteredParticipants.length === 0 && <div className="hint">Aucun participant.</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Données participant</h3>
            {selectedId && <span className="hint">Doc ID : {selectedId}</span>}
          </div>
          <pre className="json-viewer">{selectedData ? JSON.stringify(selectedData, null, 2) : 'Selectionnez un participant.'}</pre>
          <div className="panel-sub">
            <label>
              Sous-collection
              <input
                value={subcollection}
                onChange={(event) => setSubcollection(event.target.value)}
                placeholder="ex: agenda"
              />
            </label>
            <button className="btn-outline" onClick={handleFetchSubcollection} disabled={!selectedId || !subcollection.trim()}>
              Charger la sous-collection
            </button>
            {subError && <div className="alert error">{subError}</div>}
            {subRows.length > 0 && (
              <pre className="json-viewer">{JSON.stringify(subRows, null, 2)}</pre>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}