import { adminRoute } from "@/server/admin-api";
import { rateLimit } from "@/lib/http";
import { uploadImage } from "@/modules/media/service";
import { invalid } from "@/lib/errors";

export const POST = adminRoute(async (req) => {
	await rateLimit(req, "upload");
	const file = (await req.formData()).get("file");
	if (!(file instanceof File)) throw invalid("Missing file");
	return uploadImage(file);
});
