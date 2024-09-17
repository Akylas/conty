package com.akylas.conty;

import android.media.MediaDataSource;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.util.zip.ZipFile;
import java.util.zip.ZipEntry;
import java.io.StringWriter;
import java.io.InputStreamReader;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import androidx.annotation.Nullable;
import android.os.Handler;
import android.os.Looper;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.util.Log;
import android.content.Context;
import java.util.zip.ZipInputStream;
import java.io.BufferedInputStream;

public class ZipMediaDataSource extends MediaDataSource {
    private final static String TAG = "ZipMediaDataSource";
    public interface Callback {
		void onError(Exception exception);

		void onSuccess(@Nullable Object result);
	}
    public static void readTextFromAsset(Context context, String zipFilePath, String asset, @Nullable String encoding, Callback callback) throws IOException {
        final Handler handler = new Handler(Looper.myLooper());
        Executors.newSingleThreadExecutor().execute(() -> {
            ZipInputStream zis = null;
            ZipFile zipFile = null;
            InputStream inputStream = null;
            try {
                if (zipFilePath.startsWith("content:/")) {
                    long startTime = System.nanoTime();
                    zis = new ZipInputStream(new BufferedInputStream(context.getContentResolver().openInputStream(android.net.Uri.parse(zipFilePath))));
                    ZipEntry ze = null;
                    while((ze = zis.getNextEntry()) != null) {
                        if (ze.getName().equals(asset)) {
                            inputStream = zis;
                            break;
                        }
                    }
                } else {
                    zipFile = new ZipFile(zipFilePath);
                    ZipEntry ze = zipFile.getEntry(asset);
                    inputStream = zipFile.getInputStream(ze);
                }
                if (inputStream == null) {
				    handler.post(() -> callback.onSuccess(null));
                    return;
                }
                // inputStream = zipFile.getInputStream(ze);
				String characterSet = encoding;
                if (characterSet == null) {
                    characterSet = "UTF-8";
                }

                int n = 0;
                char[] buf = new char[inputStream.available()];
                InputStreamReader isr = new InputStreamReader(inputStream, characterSet);
                StringWriter writer = new StringWriter();
                while (-1 != (n = isr.read(buf))) writer.write(buf, 0, n);
                
				handler.post(() -> callback.onSuccess(writer.toString()));
			} catch (Exception e) {
			    handler.post(() -> callback.onError(e));
			} finally {
                if(zipFile != null) {
                    try {
                        zipFile.close();
                    } catch(Exception e){}
                    zipFile = null;
                }
                if(zis != null) {
                    try {
                        zis.close();
                    } catch(Exception e){}
                    zis = null;
                }
                inputStream = null;
            }
		});
    }
    public static void readBitmapFromAsset(Context context, String zipFilePath, String asset, Callback callback) throws IOException {
        final Handler handler = new Handler(Looper.myLooper());
        Executors.newSingleThreadExecutor().execute(() -> {
			try {
                Bitmap bmp = readBitmapFromAssetSync(context, zipFilePath, asset);
				handler.post(() -> callback.onSuccess(bmp));
			} catch (Exception e) {
                e.printStackTrace();
		        handler.post(() -> callback.onError(e));
			}
		});
    }
    public static Bitmap readBitmapFromAssetSync(Context context, String zipFilePath, String asset) throws IOException {
        ZipInputStream zis = null;
        ZipFile zipFile = null;
        InputStream inputStream = null;
        try {
            if (zipFilePath.startsWith("content:/")) {
                long startTime = System.nanoTime();
                zis = new ZipInputStream(new BufferedInputStream(context.getContentResolver().openInputStream(android.net.Uri.parse(zipFilePath))));
                ZipEntry ze = null;
                while((ze = zis.getNextEntry()) != null) {
                    if (ze.getName().equals(asset)) {
                        inputStream = zis;
                        break;
                    }
                }
            } else {
                zipFile = new ZipFile(zipFilePath);
                ZipEntry ze = zipFile.getEntry(asset);
                inputStream = zipFile.getInputStream(ze);
            }
            if (inputStream == null) {
                return null;
            }
            Bitmap bmp = BitmapFactory.decodeStream(inputStream);
            return bmp;
       } catch (Exception e) {
                e.printStackTrace();
                throw e;
        } finally {
            if(zipFile != null) {
                try {
                    zipFile.close();
                } catch(Exception e){}
                zipFile = null;
            }
            if(zis != null) {
                try {
                    zis.close();
                } catch(Exception e){}
                zis = null;
            }
            inputStream = null;
        }
    }

    private InputStream inputStream;
    private ZipFile zipFile;
    private String zipFilePath;
    private String asset;


    public ZipMediaDataSource(String zipFilePath, String asset) throws IOException {
        this.zipFilePath = zipFilePath;
        this.asset = asset;
    }

    @Override
    public int readAt(long position, byte[] buffer, int offset, int size) throws IOException {
        if (inputStream == null) {
            if (zipFile == null) {
                zipFile = new ZipFile(zipFilePath);
            }
            ZipEntry ze = zipFile.getEntry(asset);
            inputStream = zipFile.getInputStream(ze);

        }
        return inputStream.read(buffer, offset, size);
    }

    @Override
    public long getSize() throws IOException {
        return inputStream.available();
    }

    @Override
    public void close() throws IOException {
        if (inputStream != null) {
            inputStream.close();
            inputStream = null;
        }
        if (zipFile != null) {
            zipFile.close();
            zipFile = null;
        }
    }
}