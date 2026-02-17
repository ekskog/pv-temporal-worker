import { promises as fs } from 'fs';
import path from 'path';

export interface ImageFile {
  filename: string;
  path: string;
  contentType: string;
}

export interface ConversionResult {
  filename: string;
  success: true;
  metrics: {
    conversionTimeSec: number;
  };
  avifSizeBytes: number;
  avifPath: string;   // <--- Changed from avifData: string to avifPath
}

export interface ConversionFailure {
  filename: string;
  success: false;
  error: string;
}

export type ProcessResult = ConversionResult | ConversionFailure;

interface ConverterResponse {
  success: boolean;
  metrics: {
    memoryBeforeMB: any;
    memoryAfterMB: any;
    peakMemoryMB: number;
    conversionTimeSec: number;
  };
  data: {
    filename: string;
    content: string;
    size: number;
    mimetype: string;
  };
}

const AVIF_CONVERTER_URL = process.env.AVIF_CONVERTER_URL ||
  'http://avif-converter-service.photovault.svc.cluster.local:3000';

export async function convertImage(image: ImageFile): Promise<ConversionResult> {
  console.log(`[Activity] ===== Starting conversion =====`);
  
  try {
    const imageBuffer = await fs.readFile(image.path);
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: image.contentType });
    formData.set('image', blob, image.filename);

    const response = await fetch(`${AVIF_CONVERTER_URL}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Converter returned ${response.status}: ${errorText}`);
    }

    const result = await response.json() as ConverterResponse;

    // Write the AVIF to NFS so we don't pass the base64 string through Temporal
    const avifPath = `${image.path}.avif`;
    await fs.writeFile(avifPath, Buffer.from(result.data.content, 'base64'));

    console.log(`[Activity] ✓ Converted and saved to NFS: ${avifPath}`);

    return {
      filename: image.filename,
      success: true,
      metrics: result.metrics,
      avifSizeBytes: result.data.size,
      avifPath: avifPath // Returning the path string
    };
  } catch (error) {
    console.error(`[Activity] ✗ Failed ${image.filename}:`, error);
    throw error;
  }
}