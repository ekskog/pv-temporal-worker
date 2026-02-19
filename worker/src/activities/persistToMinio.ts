import * as Minio from 'minio';
import { promises as fs } from 'fs';
import path from 'path'; // Add this at the top if not there

const minioClient = new Minio.Client({
  endPoint: 'mjolnir', 
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'lucarv',
  secretKey: process.env.MINIO_SECRET_KEY || 'lucaPWD4MinI0-MJR',
});

const DEFAULT_BUCKET = 'slask';

/**
 * Moves the converted file from the NFS scratchpad to MinIO storage.
 */
export async function persistToMinio(
  avifPath: string,
  filename: string,
  folder: string
): Promise<{ minioPath: string }> {
  // Use path.parse to get the name without the extension (e.g., "003.JPG" -> "003")
  const fileNameWithoutExt = path.parse(filename).name;
  const objectName = `${folder}/${fileNameWithoutExt}.avif`;

  try {
    const avifBuffer = await fs.readFile(avifPath);

    await minioClient.putObject(
      DEFAULT_BUCKET,
      objectName,
      avifBuffer,
      avifBuffer.length,
      { 'Content-Type': 'image/avif' }
    );

    console.log(`✓ Persisted to MinIO: ${objectName}`);
    return {
      minioPath: `${DEFAULT_BUCKET}/${objectName}`
    };
  } catch (error) {
    console.error(`Failed MinIO upload:`, error);
    throw error;
  }
}

export async function cleanupBatch(batchDir: string): Promise<void> {
  await fs.rm(batchDir, { recursive: true, force: true });
}