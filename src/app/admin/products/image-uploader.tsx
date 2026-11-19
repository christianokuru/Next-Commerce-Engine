"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { addImageAction } from "../actions";

export function ImageUploader({ productId }: { productId: string }) {
	const ref = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const router = useRouter();
	async function onFiles(files: FileList | null) {
		if (!files?.length) return;
		setBusy(true);
		try {
			for (const file of Array.from(files).slice(0, 10)) {
				const fd = new FormData();
				fd.append("file", file);
				const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
				const data = (await res.json()) as { url: string; key: string; error?: { message?: string } };
				if (!res.ok) { toast.error(data?.error?.message ?? "Upload failed"); continue; }
				const r = await addImageAction({ productId, url: data.url, key: data.key });
				if (!r?.ok) toast.error(r?.error ?? "Could not attach image");
				else toast.success("Image added");
			}
			router.refresh();
		} finally {
			setBusy(false);
			if (ref.current) ref.current.value = "";
		}
	}
	return (
		<button
			type="button"
			onClick={() => ref.current?.click()}
			disabled={busy}
			className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
		>
			{busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
			{busy ? "Uploading…" : "Add images"}
			<input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple hidden onChange={(e) => onFiles(e.target.files)} />
		</button>
	);
}
