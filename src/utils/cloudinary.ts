import { v2 as cloudinary } from "cloudinary";

import { env } from "../config/env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export async function uploadImage(file: Express.Multer.File, folder = "courier"): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(file.buffer);
  });
  return result;
}

export { cloudinary };
