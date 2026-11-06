export interface AudioSelection {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds: number | null;
  source: "recording" | "file";
}
