import { addDoc, collection, getDocs, limit, query, where } from "firebase/firestore";
import type { Workspace } from "@/domain/entities/business";
import type { WorkspaceRepository } from "@/domain/repositories/repositories";
import { db } from "@/infrastructure/firebase/client";

export class FirebaseWorkspaceRepository implements WorkspaceRepository {
  async findByOwner(ownerId: string): Promise<Workspace | null> {
    const result = await getDocs(query(collection(db, "workspaces"), where("ownerId", "==", ownerId), limit(1)));
    const snapshot = result.docs[0];
    return snapshot ? ({ id: snapshot.id, ...snapshot.data() } as Workspace) : null;
  }

  async save(workspace: Omit<Workspace, "id">): Promise<Workspace> {
    const existing = await this.findByOwner(workspace.ownerId);
    if (existing) return existing;
    const result = await addDoc(collection(db, "workspaces"), workspace);
    return { id: result.id, ...workspace };
  }
}
