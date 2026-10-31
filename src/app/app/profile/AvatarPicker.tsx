"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";

/** Choose a photo; it is cropped to a square and shrunk to 320 px in the browser before upload. */
export function AvatarPicker({ name, url }: { name: string; url: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(url);
  const [error, setError] = useState<string | null>(null);

  function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    const src = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight), size = Math.min(320, side);
      const c = document.createElement("canvas"); c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(src);
      c.toBlob((b) => {
        if (!b || !input.current) return;
        const dt = new DataTransfer(); dt.items.add(new File([b], "photo.jpg", { type: "image/jpeg" }));
        input.current.files = dt.files;
        setPreview(URL.createObjectURL(b));
      }, "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(src); setError("We couldn't read that picture. Try a JPG or PNG."); };
    img.src = src;
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={preview} size={72} />
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="photo">Profile picture</label>
        <input ref={input} id="photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" className="input py-2" onChange={(e) => choose(e.target.files?.[0])} />
        {error && <p role="alert" className="mt-1 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}
