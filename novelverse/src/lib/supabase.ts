// Supabase client for file storage

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. File upload features will not work.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Storage bucket names
export const BUCKETS = {
  COVERS: 'novel-covers',
  ILLUSTRATIONS: 'chapter-illustrations',
  PROFILES: 'user-profiles',
} as const;

// Helper function to upload a file
export async function uploadFile(
  bucket: keyof typeof BUCKETS,
  path: string,
  file: File | Blob
): Promise<{ url: string | null; error: string | null }> {
  try {
    const bucketName = BUCKETS[bucket];

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      return { url: null, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return { url: urlData.publicUrl, error: null };
  } catch (err) {
    return { url: null, error: 'Failed to upload file' };
  }
}

// Helper function to delete a file
export async function deleteFile(
  bucket: keyof typeof BUCKETS,
  path: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const bucketName = BUCKETS[bucket];

    const { error } = await supabase.storage
      .from(bucketName)
      .remove([path]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: 'Failed to delete file' };
  }
}

// Helper function to get file URL
export function getFileUrl(bucket: keyof typeof BUCKETS, path: string): string {
  const bucketName = BUCKETS[bucket];
  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data.publicUrl;
}

// Upload base64 image (for AI generated images)
export async function uploadBase64Image(
  bucket: keyof typeof BUCKETS,
  path: string,
  base64Data: string,
  contentType: string = 'image/png'
): Promise<{ url: string | null; error: string | null }> {
  try {
    // Convert base64 to blob
    const base64Response = await fetch(`data:${contentType};base64,${base64Data}`);
    const blob = await base64Response.blob();

    return uploadFile(bucket, path, blob);
  } catch (err) {
    return { url: null, error: 'Failed to process base64 image' };
  }
}

export default supabase;
