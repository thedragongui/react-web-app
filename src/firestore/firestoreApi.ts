import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy,
  onSnapshot, addDoc, serverTimestamp, DocumentReference, CollectionReference, deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import type { User } from 'firebase/auth';
import type { CongresDocument, ParticipantDocument } from './schema';

/** TYPES alignés au schéma Firestore */
export type Congres = CongresDocument;
export type Participant = ParticipantDocument;
export type Personne = {
  email?: string;
  displayName?: string;
  photoURL?: string;
  compagnie?: string;
  updatedAt?: any;
  [k: string]: any;
};

export type ParticipantRootDoc = {
  id: string;
  [k: string]: unknown;
};
export type ParticipantRootSubRow = {
  id: string;
  [k: string]: unknown;
};

/** HELPERS DE CHEMINS */
const congresDoc = (congresId: string) => doc(db, 'congres', congresId) as DocumentReference<Congres>;
const congresParticipantsCol = (congresId: string) =>
  collection(db, 'congres', congresId, 'participants') as CollectionReference<Participant>;
const sponsorsCol = collection(db, 'sponsors') as CollectionReference<any>;
const evenementsCol = collection(db, 'evenements') as CollectionReference<any>;
const personneDoc = (uid: string) => doc(db, 'personne', uid) as DocumentReference<Personne>;

/** Racine globale des participants (hors sous-collection de congrès) */
const rootParticipantDoc = (participantId: string) => doc(db, 'participants', participantId);
const rootParticipantSubcollection = (participantId: string, subcollection: string) =>
  collection(rootParticipantDoc(participantId), subcollection);

/** --- LECTURES PUBLIQUES --- */
export async function getCongres(congresId: string): Promise<(Congres & {id:string}) | null> {
  const snap = await getDoc(congresDoc(congresId));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Congres) } : null;
}
export async function listSponsors() {
  const q = query(sponsorsCol, orderBy('name', 'asc')); // si pas de champ "name", enlÃ¨ve orderBy
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function listEvenements() {
  const q = query(evenementsCol, orderBy('date', 'asc')); // ou enlÃ¨ve orderBy si champ absent
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** --- PARTICIPANTS Dâ€™UN CONGRES (auth requis par rÃ¨gle par dÃ©faut) --- */
export async function listParticipants(congresId: string) {
  const q = query(congresParticipantsCol(congresId), orderBy('id')); // si index requis, retire orderBy
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Participant;
    return { idDoc: d.id, ...data, id: data.id ?? d.id };
  });
}

export function watchParticipants(
  congresId: string,
  cb: (rows: Array<Participant & {idDoc:string}>) => void
) {
  const q = query(congresParticipantsCol(congresId), orderBy('id'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => {
      const data = d.data() as Participant;
      return { idDoc: d.id, ...data, id: data.id ?? d.id };
    }));
  });
}

// crÃ©ation / mise Ã  jour (les rÃ¨gles permettent write Ã  tout utilisateur connectÃ©)
export async function upsertParticipant(congresId: string, idDoc: string, data: Partial<Participant>) {
  const payload: Partial<Participant> = { ...data };
  if (payload.id == null) { payload.id = idDoc; }
  await setDoc(doc(congresParticipantsCol(congresId), idDoc), payload, { merge: true });
}

export async function createParticipant(
  congresId: string,
  data: Partial<Participant>,
  idDoc?: string,
): Promise<string> {
  const col = congresParticipantsCol(congresId);
  const ref = idDoc ? doc(col, idDoc) : doc(col);
  const payload: Partial<Participant> = { ...data };
  if (payload.id == null) {
    payload.id = ref.id;
  }
  await setDoc(ref, payload);
  return ref.id;
}

export async function deleteParticipant(congresId: string, idDoc: string): Promise<void> {
  await deleteDoc(doc(congresParticipantsCol(congresId), idDoc));
}

export async function getParticipantDoc(congresId: string, participantId: string) {
  const ref = doc(congresParticipantsCol(congresId), participantId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Participant;
  return { idDoc: snap.id, ...data, id: data.id ?? snap.id };
}

export async function listParticipantSubcollection(
  congresId: string,
  participantId: string,
  subcollection: string,
) {
  const parent = doc(congresParticipantsCol(congresId), participantId);
  const col = collection(parent, subcollection);
  const snap = await getDocs(col);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getParticipantRootDoc(participantId: string): Promise<ParticipantRootDoc | null> {
  if (!participantId) return null;
  const snap = await getDoc(rootParticipantDoc(participantId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
}

export async function listParticipantRootSubcollection(
  participantId: string,
  subcollection: string,
): Promise<ParticipantRootSubRow[]> {
  if (!participantId || !subcollection) return [];
  const col = rootParticipantSubcollection(participantId, subcollection);
  const snap = await getDocs(col);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
}

/** --- PERSONNE: self-only (doc id == uid) --- */
export async function getMyProfile(user: User) {
  const snap = await getDoc(personneDoc(user.uid));
  return snap.exists() ? (snap.data() as Personne) : null;
}

export async function upsertMyProfile(user: User, patch: Partial<Personne>) {
  // Respecte la rÃ¨gle: on nâ€™Ã©crit QUE sur personne/{uid}
  await setDoc(personneDoc(user.uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

/** --- Ã‰CRITURES PROTÃ‰GÃ‰ES CÃ”TÃ‰ UI (facultatives) ---
 * Les rÃ¨gles autorisent nâ€™importe quel utilisateur connectÃ© Ã  Ã©crire dans
 * `congres`, `evenements`, `sponsors`. Si tu veux rÃ©server au rÃ´le "admin",
 * fais le contrÃ´le cÃ´tÃ© client avec isAdmin avant dâ€™appeler ces fonctions.
 */
export async function updateCongres(congresId: string, patch: Partial<Congres>) {
  await updateDoc(congresDoc(congresId), patch);
}
export async function addEvenement(data: any) {
  await addDoc(evenementsCol, { ...data, createdAt: serverTimestamp() });
}
export async function addSponsor(data: any) {
  await addDoc(sponsorsCol, { ...data, createdAt: serverTimestamp() });
}

import {
  collection as _collection, doc as _doc, onSnapshot as _onSnapshot, orderBy as _orderBy, query as _query,
  CollectionReference as _CollectionReference, DocumentReference as _DocumentReference
} from 'firebase/firestore';

// ========= PROGRAMME (sessions + prÃ©sentations) =========

export type Moderator = { firstName: string; lastName: string; cityCountry?: string };
export type Session = {
  id?: string; congresId: string; title: string;
  date: string;          // 'YYYY-MM-DD'
  start: string;         // 'HH:mm'
  end: string;           // 'HH:mm'
  room: string;
  moderators: Moderator[];
  order?: number;
  createdAt?: any; updatedAt?: any;
};
export type Presentation = {
  id?: string; index: number; title: string;
  speakerFirstName: string; speakerLastName: string; cityCountry?: string;
  start?: string; end?: string; room?: string;
  createdAt?: any; updatedAt?: any;
};

const sessionsCol = (congresId: string) =>
  _collection(db, 'congres', congresId, 'sessions') as _CollectionReference<Session>;
const sessionDoc = (congresId: string, sessionId: string) =>
  _doc(sessionsCol(congresId), sessionId) as _DocumentReference<Session>;
const presentationsCol = (congresId: string, sessionId: string) =>
  _collection(db, 'congres', congresId, 'sessions', sessionId, 'presentations') as _CollectionReference<Presentation>;
const presentationDoc = (congresId: string, sessionId: string, presId: string) =>
  _doc(presentationsCol(congresId, sessionId), presId) as _DocumentReference<Presentation>;

export function watchSessions(
  congresId: string,
  cb: (rows: Array<Session & { id: string }>) => void,
  onError?: (e: any) => void
) {
  const q = _query(sessionsCol(congresId)); // <-- pas de orderBy => pas d'index composite
  return _onSnapshot(
    q,
    (snap) => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as Session) }))),
    (err) => { (onError ?? console.error)('[watchSessions]', err); }
  );
}


export function watchPresentations(congresId: string, sessionId: string, cb: (rows: Presentation[]) => void) {
  const q = _query(presentationsCol(congresId, sessionId), _orderBy('index'));
  return _onSnapshot(q, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as Presentation) }))));
}

// ========= PROGRAMME (ajout modale) =========

import {
  addDoc as _addDoc, serverTimestamp as _serverTimestamp
} from 'firebase/firestore';

// CrÃ©er une session (Ã©criture cÃ´tÃ© UI rÃ©servÃ©e aux admins)
export async function createSession(
  congresId: string,
  data: Omit<Session, 'id' | 'congresId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await _addDoc(sessionsCol(congresId), {
    ...data,
    congresId,
    createdAt: _serverTimestamp(),
    updatedAt: _serverTimestamp(),
  });
  return ref.id;
}

// ==== PrÃ©sentation : index auto ====
import {
   limit as _limit
} from 'firebase/firestore';

/** Retourne le prochain index pour la session (max(index)+1) */
export async function getNextPresentationIndex(congresId: string, sessionId: string): Promise<number> {
  const q = _query(presentationsCol(congresId, sessionId), _orderBy('index', 'desc'), _limit(1));
  const snap = await _getDocs(q);
  const max = snap.empty ? 0 : (snap.docs[0].data().index ?? 0);
  const num = typeof max === 'number' ? max : parseInt(String(max), 10) || 0;
  return num + 1;
}

/** CrÃ©e une prÃ©sentation ; si index non fourni, il est auto-calculÃ© */
export async function addPresentation(
  congresId: string,
  sessionId: string,
  data: Omit<Presentation, 'id' | 'createdAt' | 'updatedAt' | 'index'> & { index?: number }
): Promise<string> {
  const index = data.index ?? await getNextPresentationIndex(congresId, sessionId);
  const ref = await _addDoc(presentationsCol(congresId, sessionId), {
    ...data,
    index,
    createdAt: _serverTimestamp(),
    updatedAt: _serverTimestamp(),
  });
  return ref.id;
}

// ====== EDIT / DELETE Sessions & Presentations ======
import {
  updateDoc as _updateDoc, deleteDoc as _deleteDoc, getDocs as _getDocs,
  writeBatch as _writeBatch
} from 'firebase/firestore';

// Mettre Ã  jour une session
export async function updateSession(
  congresId: string, sessionId: string, patch: Partial<Session>
) {
  await _updateDoc(sessionDoc(congresId, sessionId), {
    ...patch,
    updatedAt: _serverTimestamp?.() // si tu as dÃ©jÃ  importÃ© serverTimestamp
  } as any);
}

// Supprimer une session + ses prÃ©sentations (cascade cÃ´tÃ© client)
export async function deleteSessionCascade(congresId: string, sessionId: string) {
  // RÃ©cupÃ¨re toutes les prÃ©sentations, supprime-les par batch, puis la session
  const presSnap = await _getDocs(_query(presentationsCol(congresId, sessionId)));
  const batch = _writeBatch(db);
  presSnap.forEach(d => batch.delete(d.ref));
  batch.delete(sessionDoc(congresId, sessionId));
  await batch.commit();
}

// Mettre Ã  jour une prÃ©sentation
export async function updatePresentation(
  congresId: string, sessionId: string, presId: string, patch: Partial<Presentation>
) {
  await _updateDoc(presentationDoc(congresId, sessionId, presId), {
    ...patch,
    updatedAt: _serverTimestamp?.()
  } as any);
}

// Supprimer une prÃ©sentation
export async function deletePresentation(congresId: string, sessionId: string, presId: string) {
  await _deleteDoc(presentationDoc(congresId, sessionId, presId));
}

// ====== COUNTS pour Dashboard ======
import {
  getCountFromServer as _getCountFromServer,
} from 'firebase/firestore';

/** # sessions dans congres/{id}/sessions */
export async function countSessions(congresId: string): Promise<number> {
  const snap = await _getCountFromServer(sessionsCol(congresId));
  return snap.data().count;
}

/** # participants dans congres/{id}/participants */
export async function countParticipants(congresId: string): Promise<number> {
  const col = collection(db, 'congres', congresId, 'participants'); // tu as dÃ©jÃ  importÃ© 'collection' en haut
  const snap = await _getCountFromServer(col);
  return snap.data().count;
}

/** # sponsors (collection racine) */
export async function countSponsors(): Promise<number> {
  const snap = await _getCountFromServer(sponsorsCol);
  return snap.data().count;
}

/** # prÃ©sentations pour un congrÃ¨s (somme sur toutes les sessions) */
export async function countPresentationsInCongres(congresId: string): Promise<number> {
  const sessionsSnap = await _getDocs(_query(sessionsCol(congresId))); // sans tri pour aller vite
  let total = 0;
  for (const s of sessionsSnap.docs) {
    const cnt = await _getCountFromServer(presentationsCol(congresId, s.id));
    total += cnt.data().count;
  }
  return total;
}

// ========= SPONSORS =========
export type Sponsor = {
  id?: string;
  name: string;
  website?: string;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'partner';
  description?: string;
  logoUrl?: string;   // URL de tÃ©lÃ©chargement
  logoPath?: string;  // chemin Storage pour pouvoir supprimer/remplacer
  createdAt?: any;
  updatedAt?: any;
};

// Live list (tri par nom)
export function watchSponsors(cb: (rows: Sponsor[]) => void) {
  const q = query(sponsorsCol, orderBy('name', 'asc'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Sponsor) })))
  );
}

// CrÃ©ation
export async function createSponsor(data: Omit<Sponsor, 'id' | 'createdAt' | 'updatedAt'>) {
  const ref = await addDoc(sponsorsCol, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Mise Ã  jour
export async function updateSponsor(id: string, patch: Partial<Sponsor>) {
  await updateDoc(doc(sponsorsCol, id), { ...patch, updatedAt: serverTimestamp() });
}

// Suppression
export async function deleteSponsor(id: string) {
  await deleteDoc(doc(sponsorsCol, id));
}

// ========= LIENS =========
import {
  writeBatch
} from 'firebase/firestore';

export type LinkItem = {
  id?: string;
  title: string;
  url: string;
  category?: string;
  order?: number;         // tri manuel
  isExternal?: boolean;   // ouvre dans un nouvel onglet
  createdAt?: any;
  updatedAt?: any;
};

const liensCol = collection(db, 'liens') as CollectionReference<LinkItem>;

// Live list (tri par 'order', puis titre)
export function watchLinks(cb: (rows: LinkItem[]) => void) {
  const q = query(liensCol, orderBy('order', 'asc'), orderBy('title', 'asc')); // si Firestore demande un index, suis le lien
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as LinkItem) })));
  });
}

async function getNextLinkOrder(): Promise<number> {
  const q = query(liensCol, orderBy('order', 'desc'), _limit(1));
  const snap = await getDocs(q);
  const max = snap.empty ? 0 : (snap.docs[0].data().order ?? 0);
  const num = typeof max === 'number' ? max : parseInt(String(max), 10) || 0;
  return num + 1;
}

export async function createLink(
  data: Omit<LinkItem, 'id' | 'createdAt' | 'updatedAt' | 'order'> & { order?: number }
): Promise<string> {
  const ord = data.order ?? await getNextLinkOrder();
  const ref = await addDoc(liensCol, {
    ...data,
    order: ord,
    isExternal: data.isExternal ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLink(id: string, patch: Partial<LinkItem>) {
  await updateDoc(doc(liensCol, id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteLink(id: string) {
  await deleteDoc(doc(liensCol, id));
}

/** Ã‰change les 'order' de deux Ã©lÃ©ments (pour Up/Down) */
export async function swapLinkOrder(a: { id: string; order?: number }, b: { id: string; order?: number }) {
  const ao = a.order ?? 0, bo = b.order ?? 0;
  const batch = writeBatch(db);
  batch.update(doc(liensCol, a.id), { order: bo });
  batch.update(doc(liensCol, b.id), { order: ao });
  await batch.commit();
}

// --- TYPES
export type Personnes = {
  email?: string;
  displayName?: string;
  photoURL?: string;
  photoPath?: string;   // <â€” nouveau (chemin Storage de lâ€™avatar)
  compagnie?: string;
  updatedAt?: any;
  [k: string]: any;
};

// --- WATCH SELF
export function watchMyProfile(user: User, cb: (p: Personne | null) => void) {
  return onSnapshot(personneDoc(user.uid), (snap) => {
    cb(snap.exists() ? (snap.data() as Personne) : null);
  });
}

export function watchCongres(
  congresId: string,
  cb: (data: (Congres & { id: string }) | null) => void,
  onError?: (e: any) => void,
) {
  return onSnapshot(
    congresDoc(congresId),
    (snap) => {
      cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Congres) }) : null);
    },
    (err) => {
      (onError ?? console.error)("[watchCongres]", err);
    }
  );
}

// ========= APP CONFIG =========
export type AppIdentity = {
  primaryColor?: string; secondaryColor?: string;
  backgroundColor?: string; textColor?: string;
  logoUrl?: string; logoPath?: string;
  updatedAt?: any;
};
export type AppStoreInfo = {
  appName: string;
  shortDescription?: string;
  longDescription?: string;
  bannerUrl?: string; bannerPath?: string;
  splashUrl?: string;  splashPath?: string;
  updatedAt?: any;
};
export type AppConfig = { identity?: AppIdentity; store?: AppStoreInfo; updatedAt?: any };

const appConfigDoc = (congresId: string) =>
  doc(db, 'congres', congresId, 'appConfig', 'config') as DocumentReference<AppConfig>;

export async function getAppConfig(congresId: string): Promise<AppConfig | null> {
  const s = await getDoc(appConfigDoc(congresId));
  return s.exists() ? (s.data() as AppConfig) : null;
}
export function watchAppConfig(
  congresId: string,
  cb: (cfg: AppConfig | null) => void,
  onError?: (e: any) => void
) {
  if (!congresId) { cb(null); return () => {}; }
  return onSnapshot(appConfigDoc(congresId),
    (snap) => cb(snap.exists() ? (snap.data() as AppConfig) : null),
    (err) => onError?.(err)
  );
}
export async function saveAppConfig(congresId: string, patch: Partial<AppConfig>) {
  await setDoc(appConfigDoc(congresId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// ========= NOTIFICATIONS =========
export type NotificationStatus = 'scheduled' | 'sent' | 'deleted';
export type AppNotification = {
  id?: string;
  title: string;
  message: string;
  scheduledDate?: string | null;  // YYYY-MM-DD
  scheduledTime?: string | null;  // HH:mm
  scheduledAt?: any;
  status?: NotificationStatus;
  createdAt?: any;
  updatedAt?: any;
  sentAt?: any;
};

const notificationsCol = (congresId: string) =>
  collection(db, 'congres', congresId, 'notifications') as CollectionReference<AppNotification>;
const notificationDoc = (congresId: string, notificationId: string) =>
  doc(notificationsCol(congresId), notificationId);

function buildScheduledAt(dateStr?: string | null, timeStr?: string | null) {
  if (!dateStr || !timeStr) return null;
  const trimmedDate = dateStr.trim();
  const trimmedTime = timeStr.trim();
  if (!trimmedDate || !trimmedTime) return null;
  const normalizedTime = trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime;
  const candidate = new Date(`${trimmedDate}T${normalizedTime}`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

export function watchNotifications(
  congresId: string,
  cb: (rows: Array<AppNotification & { id: string }>) => void,
  onError?: (e: any) => void,
) {
  if (!congresId) { cb([]); return () => {}; }
  const q = query(
    notificationsCol(congresId),
    orderBy('scheduledAt', 'asc'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((docSnap) => {
        const data = docSnap.data() as AppNotification;
        return { id: docSnap.id, ...data };
      }),
    );
  }, (error) => {
    (onError ?? console.error)('[watchNotifications]', error);
  });
}

type WriteableNotification = Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt' | 'scheduledAt' | 'sentAt'> & {
  status?: NotificationStatus;
};

export async function createNotification(
  congresId: string,
  data: WriteableNotification,
): Promise<string> {
  const scheduledAt = buildScheduledAt(data.scheduledDate, data.scheduledTime);
  const ref = await addDoc(notificationsCol(congresId), {
    title: data.title,
    message: data.message,
    scheduledDate: data.scheduledDate ?? null,
    scheduledTime: data.scheduledTime ?? null,
    scheduledAt,
    status: data.status ?? 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateNotification(
  congresId: string,
  notificationId: string,
  patch: Partial<WriteableNotification>,
) {
  const payload: Record<string, any> = { ...patch, updatedAt: serverTimestamp() };
  if ('scheduledDate' in patch || 'scheduledTime' in patch) {
    const scheduledAt = buildScheduledAt(patch.scheduledDate ?? null, patch.scheduledTime ?? null);
    payload.scheduledAt = scheduledAt;
  }
  await updateDoc(notificationDoc(congresId, notificationId), payload);
}

export async function markNotificationStatus(
  congresId: string,
  notificationId: string,
  status: NotificationStatus,
) {
  const payload: Record<string, any> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (status === 'sent') {
    payload.sentAt = serverTimestamp();
  }
  await updateDoc(notificationDoc(congresId, notificationId), payload);
}

export async function removeNotification(congresId: string, notificationId: string) {
  await deleteDoc(notificationDoc(congresId, notificationId));
}
