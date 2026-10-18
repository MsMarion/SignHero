import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";
import { mediaUrlForKey, resolveMediaUrl } from "~/server/media";

// Initialize S3 client based on STORAGE_MODE
const isLocal = env.STORAGE_MODE === "local";

const endpoint = isLocal 
    ? `http://${env.LOCAL_STORAGE_ENDPOINT || "localhost:9000"}`
    : (env.DO_SPACES_ENDPOINT ? `https://${env.DO_SPACES_ENDPOINT}` : undefined);

const s3Client = new S3Client({
    endpoint,
    region: isLocal ? "us-east-1" : (env.DO_SPACES_REGION ?? "nyc3"),
    credentials: {
        accessKeyId: isLocal ? (env.LOCAL_STORAGE_KEY || "admin") : (env.DO_SPACES_KEY || ""),
        secretAccessKey: isLocal ? (env.LOCAL_STORAGE_SECRET || "password") : (env.DO_SPACES_SECRET || ""),
    },
    forcePathStyle: isLocal, // Required for MinIO
});

const BUCKET = isLocal ? (env.LOCAL_STORAGE_BUCKET || "signhero") : (env.DO_SPACES_BUCKET || "");

export interface UploadResult {
    success: boolean;
    key?: string;
    url?: string;
    error?: string;
}

export interface FileInfo {
    key: string;
    size?: number;
    lastModified?: Date;
    contentType?: string;
}

/**
 * Upload a file to DigitalOcean Spaces
 */
export async function uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string,
    isPublic: boolean = true
): Promise<UploadResult> {
    try {
        // Security Sanitization: Prevent directory traversal (../../) in storage keys
        const sanitizedKey = key.replace(/\.{2,}\//g, "").replace(/^\/+/, "");

        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: sanitizedKey,
            Body: body,
            ContentType: contentType,
            ACL: isPublic ? "public-read" : "private",
        });

        await s3Client.send(command);

        const url = getPublicUrl(key);

        return {
            success: true,
            key,
            url,
        };
    } catch (error) {
        console.error("Error uploading file:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Upload a file from a base64 string
 */
export async function uploadBase64(
    key: string,
    base64Data: string,
    contentType: string,
    isPublic: boolean = true
): Promise<UploadResult> {
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Content = base64Data.includes(",")
        ? base64Data.split(",")[1]!
        : base64Data;

    const buffer = Buffer.from(base64Content, "base64");
    return uploadFile(key, buffer, contentType, isPublic);
}

/**
 * Get a file from DigitalOcean Spaces
 */
export async function getFile(key: string): Promise<Buffer | null> {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const response = await s3Client.send(command);

        if (response.Body) {
            const chunks: Uint8Array[] = [];
            const stream = response.Body as AsyncIterable<Uint8Array>;
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }

        return null;
    } catch (error) {
        console.error("Error getting file:", error);
        return null;
    }
}

/**
 * Delete a file from DigitalOcean Spaces
 */
export async function deleteFile(key: string): Promise<boolean> {
    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        await s3Client.send(command);
        return true;
    } catch (error) {
        console.error("Error deleting file:", error);
        return false;
    }
}

/**
 * List files in a directory/prefix
 */
export async function listFiles(
    prefix?: string,
    maxKeys: number = 1000
): Promise<FileInfo[]> {
    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            MaxKeys: maxKeys,
        });

        const response = await s3Client.send(command);

        return (response.Contents ?? []).map((item) => ({
            key: item.Key ?? "",
            size: item.Size,
            lastModified: item.LastModified,
        }));
    } catch (error) {
        console.error("Error listing files:", error);
        return [];
    }
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
    try {
        const command = new HeadObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        await s3Client.send(command);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get file metadata
 */
export async function getFileInfo(key: string): Promise<FileInfo | null> {
    try {
        const command = new HeadObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const response = await s3Client.send(command);

        return {
            key,
            size: response.ContentLength,
            lastModified: response.LastModified,
            contentType: response.ContentType,
        };
    } catch {
        return null;
    }
}

/**
 * Generate a presigned URL for uploading (PUT)
 */
export async function getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600 // 1 hour default
): Promise<string | null> {
    try {
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: contentType,
        });

        return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
        console.error("Error generating presigned upload URL:", error);
        return null;
    }
}

/**
 * Generate a presigned URL for downloading (GET)
 */
export async function getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600 // 1 hour default
): Promise<string | null> {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
        console.error("Error generating presigned download URL:", error);
        return null;
    }
}

/**
 * Get the public URL for a file
 */
export function getPublicUrl(key: string): string {
    if (isLocal) {
        // MinIO is only reachable from this machine; the site serves objects itself (see app/api/media).
        return mediaUrlForKey(key);
    }
    return `https://${BUCKET}.${env.DO_SPACES_REGION}.digitaloceanspaces.com/${key}`;
}

/** What to send a browser for a stored song image/audio value (see server/media.ts). */
export function songMediaUrl(value: string | null | undefined): string | null {
    return resolveMediaUrl(value, {
        bucket: BUCKET,
        minioPort: (env.LOCAL_STORAGE_ENDPOINT ?? "localhost:4003").split(":")[1],
        fallback: getPublicUrl,
    });
}

/**
 * Get the CDN URL for a file
 */
export function getCdnUrl(key: string): string {
    if (isLocal) {
        return mediaUrlForKey(key);
    }
    return `https://${BUCKET}.${env.DO_SPACES_REGION}.cdn.digitaloceanspaces.com/${key}`;
}

/**
 * Generate a unique filename with timestamp
 */
export function generateUniqueKey(
    originalFilename: string,
    folder?: string
): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const extension = originalFilename.split(".").pop() ?? "";
    const baseName = originalFilename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-");

    const key = `${baseName}-${timestamp}-${randomString}${extension ? `.${extension}` : ""}`;

    return folder ? `${folder}/${key}` : key;
}

export { s3Client, BUCKET };
