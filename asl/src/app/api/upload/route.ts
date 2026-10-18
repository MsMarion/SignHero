import { NextRequest, NextResponse } from "next/server";
import {
    uploadFile,
    uploadBase64,
    deleteFile,
    getPresignedUploadUrl,
    generateUniqueKey,
    getPublicUrl,
} from "~/lib/s3";
import { devmodeGuard } from "~/server/devmode-guard";

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "video/mp4",
    "video/webm",
    "application/pdf",
];

/**
 * POST /api/upload
 * Upload a file to DigitalOcean Spaces
 *
 * Accepts either:
 * - multipart/form-data with a "file" field
 * - JSON with { base64: string, filename: string, contentType: string }
 */
export async function POST(request: NextRequest) {
  const disabled = devmodeGuard();
  if (disabled) return disabled;

    try {
        const contentType = request.headers.get("content-type") ?? "";

        if (contentType.includes("multipart/form-data")) {
            // Handle multipart form data upload
            const formData = await request.formData();
            const file = formData.get("file") as File | null;
            const folder = formData.get("folder") as string | null;

            if (!file) {
                return NextResponse.json(
                    { error: "No file provided" },
                    { status: 400 }
                );
            }

            if (file.size > MAX_FILE_SIZE) {
                return NextResponse.json(
                    { error: "File too large. Maximum size is 10MB" },
                    { status: 400 }
                );
            }

            if (!ALLOWED_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { error: "File type not allowed" },
                    { status: 400 }
                );
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            const key = generateUniqueKey(file.name, folder ?? undefined);

            const result = await uploadFile(key, buffer, file.type, true);

            if (result.success) {
                return NextResponse.json({
                    success: true,
                    key: result.key,
                    url: result.url,
                });
            } else {
                return NextResponse.json(
                    { error: result.error ?? "Upload failed" },
                    { status: 500 }
                );
            }
        } else if (contentType.includes("application/json")) {
            // Handle base64 upload
            const body = await request.json();
            const { base64, filename, contentType: fileType, folder } = body as {
                base64?: string;
                filename?: string;
                contentType?: string;
                folder?: string;
            };

            if (!base64 || !filename || !fileType) {
                return NextResponse.json(
                    { error: "Missing required fields: base64, filename, contentType" },
                    { status: 400 }
                );
            }

            if (!ALLOWED_TYPES.includes(fileType)) {
                return NextResponse.json(
                    { error: "File type not allowed" },
                    { status: 400 }
                );
            }

            const key = generateUniqueKey(filename, folder);
            const result = await uploadBase64(key, base64, fileType, true);

            if (result.success) {
                return NextResponse.json({
                    success: true,
                    key: result.key,
                    url: result.url,
                });
            } else {
                return NextResponse.json(
                    { error: result.error ?? "Upload failed" },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json(
            { error: "Invalid content type" },
            { status: 400 }
        );
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/upload?key=path/to/file.jpg
 * Delete a file from DigitalOcean Spaces
 */
export async function DELETE(request: NextRequest) {
  const disabled = devmodeGuard();
  if (disabled) return disabled;

    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key) {
            return NextResponse.json(
                { error: "Missing key parameter" },
                { status: 400 }
            );
        }

        const success = await deleteFile(key);

        if (success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { error: "Failed to delete file" },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Delete error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/upload/presign?filename=test.jpg&contentType=image/jpeg&folder=uploads
 * Get a presigned URL for direct upload to DigitalOcean Spaces
 */
export async function GET(request: NextRequest) {
  const disabled = devmodeGuard();
  if (disabled) return disabled;

    try {
        const { searchParams } = new URL(request.url);
        const filename = searchParams.get("filename");
        const contentType = searchParams.get("contentType");
        const folder = searchParams.get("folder");

        if (!filename || !contentType) {
            return NextResponse.json(
                { error: "Missing filename or contentType parameter" },
                { status: 400 }
            );
        }

        if (!ALLOWED_TYPES.includes(contentType)) {
            return NextResponse.json(
                { error: "File type not allowed" },
                { status: 400 }
            );
        }

        const key = generateUniqueKey(filename, folder ?? undefined);
        const presignedUrl = await getPresignedUploadUrl(key, contentType, 3600);

        if (presignedUrl) {
            return NextResponse.json({
                success: true,
                presignedUrl,
                key,
                publicUrl: getPublicUrl(key),
            });
        } else {
            return NextResponse.json(
                { error: "Failed to generate presigned URL" },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Presign error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
