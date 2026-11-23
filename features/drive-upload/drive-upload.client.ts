import {getAppConfig} from '../config/env';
import type {DriveUploadGateway, UploadedGeminiFile} from './drive-upload.types';

export class HttpDriveUploadClient implements DriveUploadGateway {
  async uploadDriveFileToGemini(fileId: string): Promise<UploadedGeminiFile> {
    const cfg = getAppConfig();
    const endpoint = cfg.driveUpload.endpointUrl;
    const secret = cfg.driveUpload.webhookSecret;

    if (!endpoint) {
      throw new Error('DRIVE_TO_GEMINI_UPLOAD_URL is not configured');
    }
    if (!secret) {
      throw new Error('DRIVE_TO_GEMINI_WEBHOOK_SECRET is not configured');
    }
    if (!fileId.trim()) {
      throw new Error('Cannot upload Drive file: empty fileId');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.pipeline.requestTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        redirect: 'follow',
        body: JSON.stringify({
          secret,
          fileId: fileId.trim(),
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(
          `Drive upload bridge returned HTTP ${response.status}: ${rawText.slice(0, 200)}`
        );
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Drive upload bridge returned non-JSON response: ${rawText.slice(0, 200)}`
        );
      }

      if (typeof parsed.error === 'string' && parsed.error) {
        throw new Error(`Drive upload bridge error: ${parsed.error}`);
      }

      const fileUri = typeof parsed.fileUri === 'string' ? parsed.fileUri.trim() : '';
      const mimeType =
        typeof parsed.mimeType === 'string' && parsed.mimeType.trim()
          ? parsed.mimeType.trim()
          : 'application/pdf';
      const fileName =
        typeof parsed.fileName === 'string' && parsed.fileName.trim()
          ? parsed.fileName.trim()
          : `${fileId}.pdf`;

      if (!fileUri) {
        throw new Error('Drive upload bridge response missing fileUri');
      }

      return {fileUri, mimeType, fileName};
    } finally {
      clearTimeout(timer);
    }
  }
}

export const driveUploadClient = new HttpDriveUploadClient();
