import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';
import { watchCongres, updateCongres } from '../firestore/firestoreApi';
import type { ProgrammeItem } from '../firestore/schema';
import './programme.css';

function makeNewProgramme(): ProgrammeItem {
  return {
    id: `programme_${Date.now()}`,
    title: 'Nouveau programme',
    displayTitle: 'Nouveau programme',
    date: new Date().toISOString().slice(0, 10),
    lieu: '',
    ajouterAgenda: false,
    presentations: [],
    maitresDeConference: [],
  };
}

export default function ProgrammePage() {
  const { isAdmin } = useAuth();
  const [congresId, setCongresId] = useCongresId();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [programmes, setProgrammes] = useState<ProgrammeItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [editorValue, setEditorValue] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const unsub = watchCongres(
      congresId,
      (doc) => {
        const list = (doc?.listProgrammes ?? []) as ProgrammeItem[];
        setProgrammes(list);
        setLoading(false);
        setError(null);
        setStatus(null);
        setSelectedIndex((prev) => {
          if (list.length === 0) {
            if (!dirty) setEditorValue('');
            return -1;
          }
          const next = prev < 0 ? 0 : Math.min(prev, list.length - 1);
          if (!dirty) {
            setEditorValue(JSON.stringify(list[next], null, 2));
          }
          return next;
        });
      },
      (err) => {
        setError(err?.message ?? String(err));
        setLoading(false);
      },
    );
    return () => {
      if (typeof unsub === 'function') {
        unsub();
      }
    };
  }, [congresId, dirty]);

  const selectedProgramme = useMemo(() => {
    if (selectedIndex < 0) return null;
    return programmes[selectedIndex] ?? null;
  }, [programmes, selectedIndex]);

  const selectProgramme = (index: number) => {
    setSelectedIndex(index);
    const next = programmes[index];
    setEditorValue(next ? JSON.stringify(next, null, 2) : '');
    setDirty(false);
    setStatus(null);
    setError(null);
  };

  const handleEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setEditorValue(event.target.value);
    setDirty(true);
  };

  async function persist(nextList: ProgrammeItem[], message: string) {
    if (!isAdmin) {
      setError('Droits insuffisants.');
      return;
    }
    try {
      await updateCongres(congresId, { listProgrammes: nextList });
      setProgrammes(nextList);
      setDirty(false);
      setStatus(message);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  const handleSaveCurrent = async () => {
    if (selectedIndex < 0) return;
    try {
      const parsed = JSON.parse(editorValue);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Le contenu doit etre un objet JSON.');
      }
      const nextList = [...programmes];
      nextList[selectedIndex] = parsed as ProgrammeItem;
      await persist(nextList, 'Programme mis a jour.');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  const handleAddProgramme = async () => {
    const nextProgramme = makeNewProgramme();
    const nextList = [...programmes, nextProgramme];
    await persist(nextList, 'Programme ajoute.');
    selectProgramme(nextList.length - 1);
  };

  const handleDeleteProgramme = async () => {
    if (selectedIndex < 0) return;
    if (!window.confirm('Supprimer ce programme et ses presentations ?')) return;
    const nextList = programmes.filter((_, idx) => idx !== selectedIndex);
    const nextIndex = nextList.length === 0 ? -1 : Math.min(selectedIndex, nextList.length - 1);
    await persist(nextList, 'Programme supprime.');
    if (nextIndex >= 0) {
      selectProgramme(nextIndex);
    } else {
      setSelectedIndex(-1);
      setEditorValue('');
    }
  };

  return (
    <div className="programme-page">
      <header className="programme-header">
        <div className="programme-toolbar">
          <label>
            Congres ID
            <input value={congresId} onChange={(event) => setCongresId(event.target.value)} />
          </label>
          <div className="spacer" />
          <button className="btn-outline" onClick={() => selectProgramme(selectedIndex)} disabled={selectedIndex < 0 || !selectedProgramme}>
            Reinitialiser la vue
          </button>
          <button className="btn-primary" onClick={handleAddProgramme} disabled={!isAdmin}>+ Ajouter un programme</button>
          <button className="btn-danger" onClick={handleDeleteProgramme} disabled={!isAdmin || selectedIndex < 0}>Supprimer</button>
          <button className="btn-primary" onClick={handleSaveCurrent} disabled={!isAdmin || selectedIndex < 0}>
            Enregistrer ce programme
          </button>
        </div>
        {status && <div className="status success">{status}</div>}
        {error && <div className="status error">Erreur : {error}</div>}
      </header>

      {loading && <div className="programme-placeholder">Chargement des programmes...</div>}

      {!loading && (
        <div className="programme-grid">
          <aside className="programme-list">
            <h2>Liste des programmes ({programmes.length})</h2>
            <div className="list-container">
              {programmes.map((programme, idx) => (
                <button
                  key={programme.id ?? idx}
                  className={`programme-item ${idx === selectedIndex ? 'active' : ''}`}
                  onClick={() => selectProgramme(idx)}
                >
                  <span className="programme-title">{programme.title ?? programme.displayTitle ?? `Programme ${idx + 1}`}</span>
                  <span className="programme-info">
                    {programme.date ?? '-'}{programme.lieu ? ` - ${programme.lieu}` : ''}
                  </span>
                  <span className="programme-meta">
                    {(programme.presentations?.length ?? 0)} presentations
                  </span>
                </button>
              ))}
              {programmes.length === 0 && <div className="programme-empty">Aucun programme enregistre.</div>}
            </div>
          </aside>

          <section className="programme-editor">
            <h2>Details du programme</h2>
            {selectedProgramme ? (
              <>
                <div className="editor-hint">
                  Modifier le JSON ci-dessous pour ajuster le programme, ses presentations ou les maitres de conference.
                </div>
                <textarea
                  value={editorValue}
                  onChange={handleEditorChange}
                  spellCheck={false}
                />
                <div className="editor-footer">
                  {dirty && <span className="status info">Modifications non enregistrees.</span>}
                </div>
              </>
            ) : (
              <div className="programme-empty">Selectionnez un programme pour l'editer.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
