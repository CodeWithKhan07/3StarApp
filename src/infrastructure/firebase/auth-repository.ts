import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import type { AuthRepository, AuthSession } from "@/domain/repositories/repositories";
import { getFirebaseAuth } from "@/infrastructure/firebase/client";

export class FirebaseAuthRepository implements AuthRepository {
  async signIn(email: string, password: string): Promise<AuthSession> {
    const auth = getFirebaseAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: credential.user.displayName,
    };
  }

  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(getFirebaseAuth(), email);
  }

  signOut() {
    return firebaseSignOut(getFirebaseAuth());
  }
}
