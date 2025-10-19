import dotenv from "dotenv";

dotenv.config();

import { db } from "@/server/db/db";
import { boardMemberHistory } from "@db/tables";
import { eq } from "drizzle-orm";
import { imageUrls } from "@/client/assets/imageUrls";
import imageData from '@/client/assets/image_data.json' with { type: 'json' };


type ImageData = {
  name: string;
  key: string;
  url: string;
  size: number;
  customId: any,
  uploadedAt: string;
};

const images: ImageData[] = imageData;

for (const [fileName, url] of Object.entries(imageUrls)) {
  const match: ImageData | undefined = images.find(f => f.name === fileName);

  if (match) {
    const newImage = {
      name: fileName,
      key: match.key,
      url: url,
      size: match.size,
      uploadedAt: match.uploadedAt
    }

    await db.insert(boardMemberHistory).values(newImage);
  }
  
}