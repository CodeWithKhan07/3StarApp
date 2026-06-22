import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import type { AuthRepository, AuthSession } from "@/domain/repositories/repositories";
import { auth } from "@/infrastructure/firebase/client";

export class FirebaseAuthRepository implements AuthRepository {
  async signIn(email: string, password: string): Promise<AuthSession> {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: credential.user.displayName,
    };
  }

  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  signOut() {
    return firebaseSignOut(auth);
  }
}
