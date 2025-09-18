import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import type { User } from 'firebase/auth';

export type StorageArea =
  | 'qrcodes' | 'qrcodesCarteDeVisite' | 'photos' | 'badges'
  | 'intervenants' // <- dossier perso: intervenants/{uid}/{file}
  | 'imgIntervenants' | 'imgSponsors' // admin only write
  | 'programme' | 'abstracts' | 'plan'; // admin only write

const userOwned: StorageArea[] = ['qrcodes','qrcodesCarteDeVisite','photos','badges','intervenants'];
const adminOnlyWrite: StorageArea[] = ['imgIntervenants','imgSponsors','programme','abstracts','plan'];

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

function pathFor(area: StorageArea, user: User | null, fileName: string) {
  const fn = sanitizeFileName(fileName);
  const ts = Date.now();
  if (userOwned.includes(area)) {
    if (!user) throw new Error('Utilisateur requis pour cette zone.');
    const uid = user.uid;
    if (area === 'intervenants') return `intervenants/${uid}/${ts}_${fn}`;
    if (area === 'photos') return `photos/${uid}/${ts}_${fn}`;
    if (area === 'qrcodes') return `qrcodes/${uid}/${ts}_${fn}`;
    if (area === 'qrcodesCarteDeVisite') return `qrcodesCarteDeVisite/${uid}/${ts}_${fn}`;
    if (area === 'badges') return `badges/${uid}/${ts}_${fn}`;
  }
  // zones "partagées" (lecture pour tous les connectés), écriture admin only
  return `${area}/${ts}_${fn}`;
}

export async function uploadToArea(area: StorageArea, file: File, user: User | null, isAdmin: boolean): Promise<string> {
  // Contrôle côté client (pour éviter des essais inutiles)
  if (adminOnlyWrite.includes(area) && !isAdmin) {
    throw new Error('Vous n’avez pas les droits pour envoyer un fichier dans cette zone (admin requis).');
  }
  const p = pathFor(area, user, file.name);
  const r = ref(storage, p);
  const snap = await uploadBytes(r, file);
  return await getDownloadURL(snap.ref); // URL téléchargeable
}

// Listage : renvoie noms + URLs (si possibles)
export async function listArea(area: StorageArea, user?: User | null) {
  const base =
    user && userOwned.includes(area)
      ? (area === 'intervenants'
          ? `intervenants/${user.uid}/`
          : area === 'photos'
            ? `photos/${user.uid}/`
            : area === 'qrcodes'
              ? `qrcodes/${user.uid}/`
              : area === 'qrcodesCarteDeVisite'
                ? `qrcodesCarteDeVisite/${user.uid}/`
                : `badges/${user.uid}/`)
      : `${area}/`;

  const r = ref(storage, base);
  const res = await listAll(r); // filtrera les objets non autorisés
  const items = await Promise.all(
    res.items.map(async (itemRef) => ({
      name: itemRef.name,
      path: itemRef.fullPath,
      url: await getDownloadURL(itemRef).catch(() => null),
    }))
  );
  return { prefix: base, items, prefixes: res.prefixes.map(p => p.fullPath) };
}
