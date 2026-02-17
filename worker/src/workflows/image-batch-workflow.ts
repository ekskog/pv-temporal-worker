import { proxyActivities, log } from '@temporalio/workflow';
// Use type imports for the underlying function signatures
import type * as convertDeps from '../activities/convertImage';
import type * as persistDeps from '../activities/persistToMinio';

// 1. Unified type for the proxy. 
// Note: cleanupBatch MUST be exported in one of these files.
type AllActivities = typeof convertDeps & typeof persistDeps;

const { convertImage, persistToMinio, cleanupBatch } = proxyActivities<AllActivities>({
  startToCloseTimeout: '60 minutes',
  retry: { maximumAttempts: 5 }
});

// 2. Local Interfaces (Restored to prevent 'Cannot find name' errors)
export interface ImageFile {
  filename: string;
  path: string;
  contentType: string;
}

export interface BatchInput {
  batchId: string;
  batchDir: string;
  images: ImageFile[];
}

export interface BatchResult {
  totalImages: number;
  successful: number;
  failed: number;
  results: any[];
  processingTimeMs: number;
}

/**
 * Main workflow - orchestrates batch image conversion and MinIO persistence
 */
export async function processBatchImages(input: BatchInput): Promise<BatchResult> {
  const startTime = Date.now();
  const { batchId, batchDir, images } = input;
  
  log.info(`Starting batch ${batchId} with ${images.length} images`);
  
  // 3. Typed Map (Fixes 'image' implicitly has 'any' type)
  const conversionPromises = images.map(async (image: ImageFile) => {
    try {
      const result = await convertImage(image);
      
      // We check success and the presence of avifPath (returned by convertImage)
      if (result.success && 'avifPath' in result) {
        log.info(`↑ Uploading ${image.filename} to MinIO...`);
        
        const storageInfo = await persistToMinio(
          result.avifPath,
          image.filename, 
          batchId
        );
        
        return {
          ...result,
          minioPath: storageInfo.minioPath,
          avifPath: undefined 
        };
      }
      return result;
    } catch (error) {
      log.error(`✗ ${image.filename} crashed:`, { error: String(error) });
      return {
        filename: image.filename,
        success: false as const,
        error: String(error),
      };
    }
  });

  const results = await Promise.all(conversionPromises);
  
  // 4. Explicitly Typed Filters (Fixes 'r' implicitly has 'any' type)
  const successful = results.filter((r: any) => r?.success && 'minioPath' in r).length;
  const failed = results.filter((r: any) => !r?.success).length;
  const processingTimeMs = Date.now() - startTime;

  log.info(`Batch ${batchId} SUMMARY: ${successful} fully processed, ${failed} failed`);

  // 5. Cleanup only after all persistence is done
  try {
    await cleanupBatch(batchDir);
    log.info(`✓ Successfully cleaned up NFS directory: ${batchDir}`);
  } catch (err) {
    log.error(`File cleanup failed: ${String(err)}`);
  }

  return {
    totalImages: images.length,
    successful,
    failed,
    results,
    processingTimeMs
  };
}