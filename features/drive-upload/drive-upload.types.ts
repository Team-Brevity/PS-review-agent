export interface UploadedGeminiFile {
  fileUri: string;
  mimeType: string;
  fileName: string;
}

export interface DriveUploadGateway {
  uploadDriveFileToGemini(fileId: string): Promise<UploadedGeminiFile>;
}
