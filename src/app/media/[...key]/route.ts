import { serveImage } from "@/modules/media/service";

export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
	const { key } = await ctx.params;
	return serveImage(req, key.map(decodeURIComponent).join("/"));
}
