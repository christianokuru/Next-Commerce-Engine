import { route, rateLimit } from "@/lib/http";
import { assertAdmin } from "@/server/session";
import { uploadImage } from "@/modules/media/service";
import { invalid } from "@/lib/errors";

export const POST = route(async (req) => {
	await assertAdmin();
	await rateLimit(req, "upload");
	const form = await req.formData();
	const file = form.get("file");
	if (!(file instanceof File)) throw invalid("Missing file");
	return uploadImage(file);
});
