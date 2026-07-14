import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let cachedApp: FirebaseApp | null = null;

// Firebase is browser infrastructure. Lazy access prevents Next.js static
// prerender from evaluating Auth with missing deployment environment values.
export function getFirebaseApp() {
  if (typeof window === "undefined") {
    throw new Error("Firebase is only available in the browser.");
  }
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Add the required NEXT_PUBLIC_FIREBASE_* environment variables.",
    );
  }
  cachedApp ??= getApps().length ? getApp() : initializeApp(firebaseConfig);
  return cachedApp;
}

export const getFirebaseAuth = () => getAuth(getFirebaseApp());
export const getFirebaseDb = () => getFirestore(getFirebaseApp());
