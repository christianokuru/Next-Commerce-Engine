import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = (req: Request) => toNextJsHandler(auth().handler).POST(req);
export const GET = (req: Request) => toNextJsHandler(auth().handler).GET(req);
export const POST = handler;
