import type { Timestamp } from 'firebase/firestore';

// Shared schema representations inferred from the Python import scripts.
export type FirestoreDate = Timestamp | Date | string | null | undefined;

export interface ParticipantPreference {
  isNotificationsEnabled?: boolean;
  [key: string]: unknown;
}

export interface ParticipantDocument {
  id: string;
  email?: string;
  nom?: string;
  prenom?: string;
  numero?: string;
  participe?: boolean;
  isAdmin?: boolean;
  category?: string;
  preference?: ParticipantPreference;
  abonnements?: unknown[];
  lieuDeTravail?: string;
  compagnie?: string;
  pays?: string;
  agenda?: unknown[];
  alreadyScanned?: boolean;
  [key: string]: unknown;
}

export interface NetworkingPerson {
  id: string;
  nom?: string;
  prenom?: string;
  photo?: string;
  compagnie?: string;
  pays?: string;
  [key: string]: unknown;
}

export interface ProgrammeSpeaker {
  id?: string;
  nom?: string;
  prenom?: string;
  lieuDeTravail?: string;
  imageAsset?: string;
  [key: string]: unknown;
}

export interface ProgrammePresentation {
  id?: string;
  titre?: string;
  displayTitle?: string;
  description?: string;
  date?: string;
  heureDebut?: FirestoreDate;
  heureFin?: FirestoreDate;
  maitresDeConference?: ProgrammeSpeaker[];
  [key: string]: unknown;
}

export interface ProgrammeItem {
  id: string;
  Session?: string;
  title?: string;
  displayTitle?: string;
  date?: string;
  lieu?: string;
  dateDebut?: FirestoreDate;
  dateFin?: FirestoreDate;
  ajouterAgenda?: boolean;
  presentations?: ProgrammePresentation[];
  maitresDeConference?: ProgrammeSpeaker[];
  ordre?: number;
  [key: string]: unknown;
}

export interface SponsorStandByDay {
  [isoDate: string]: number | string;
}

export interface SponsorItem {
  id: string;
  title: string;
  imageUrl?: string;
  imageUrlLogo?: string;
  numeroStand?: number | string;
  email?: string;
  adresse?: string;
  affichageBandeau?: boolean;
  bandeauURL?: string;
  standsByDay?: SponsorStandByDay;
  [key: string]: unknown;
}

export interface DashboardItem {
  id: string;
  title: string;
  iconeUrl?: string;
  activate?: boolean;
  route?: string;
  [key: string]: unknown;
}

export interface CongresDocument {
  id?: string;
  titre?: string;
  lieu?: string;
  dateDebut?: FirestoreDate;
  dateFin?: FirestoreDate;
  imageUrl?: string;
  backgroundColor?: string;
  listPersonnesPublic?: NetworkingPerson[];
  listProgrammes?: ProgrammeItem[];
  listSponsors?: SponsorItem[];
  dashBoardItems?: DashboardItem[];
  appTitle?: string;
  description?: string;
  [key: string]: unknown;
}