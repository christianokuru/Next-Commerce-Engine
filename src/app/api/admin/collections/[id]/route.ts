import { adminRoute } from "@/server/admin-api";
import { body } from "@/lib/http";
import { collectionUpdate } from "@/server/admin-schemas";
import { deleteCollection, updateCollection } from "@/modules/product/service";

type P = { id: string };
export const PATCH = adminRoute<P>(async (req, { params }) => { await updateCollection(params.id, await body(req, collectionUpdate)); return { ok: true }; });
export const DELETE = adminRoute<P>(async (_req, { params }) => { await deleteCollection(params.id); return { deleted: true }; });
