package com.akylas.conty

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile

import java.io.IOException
import java.io.InputStream
import java.io.BufferedInputStream

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream
import java.util.zip.ZipEntry

class FileUtils {
    companion object {

        fun copyFile(context: Context, inputFilePath: String, destFolder: String, fileName: String, mimeType: String, overwrite: Boolean): String {
            val outDocument =
                    DocumentFile.fromTreeUri(context, android.net.Uri.parse(destFolder))
                        ?: throw Exception("could not create access folder $destFolder")

            var outfile: DocumentFile
            if (overwrite) {
                outfile = outDocument.findFile(fileName) ?: outDocument.createFile(mimeType, fileName) ?: throw Exception("could not create file $fileName in $destFolder")
            } else {
                outfile = outDocument.createFile(mimeType, fileName) ?: outDocument.findFile(fileName) ?: throw Exception("could not create file $fileName in $destFolder")
            }
            val os = context.contentResolver.openOutputStream(outfile.uri)
                ?: throw Exception("could not open file ${outfile.uri} for writing")
            FileInputStream(java.io.File(inputFilePath)).use { input ->
                os.use { output ->
                    input.copyTo(output)
                }
            }
            return outfile.uri.toString()
        }

        fun getFolderSize(folder: File): Long {
            if (folder.isFile) return folder.length()

            var totalSize: Long = 0
            val files = folder.listFiles() ?: return 0

            for (file in files) {
                totalSize += when {
                    file.isFile -> file.length()
                    file.isDirectory -> getFolderSize(file)  // Recursively handle subfolders
                    else -> 0L
                }
            }

            return totalSize
        }

        fun startUnzippingProcess(context: Context, zipFileUri: Uri, destFolderUri: Uri) {
            // Use a background thread to unzip
            val executorService = Executors.newSingleThreadExecutor()
            executorService.execute {
                try {
                    unzipFileUsingSAF(context, zipFileUri, destFolderUri)
                } catch (e: IOException) {
                    e.printStackTrace()
                }
            }
        }

        @Throws(IOException::class)
        fun unzipFileUsingSAF(context: Context, zipFileUri: Uri, destFolderUri: Uri) {
            // Get the destination DocumentFile from Uri
            val destFolder = DocumentFile.fromTreeUri(context, destFolderUri)

            // Open the zip file input stream using SAF
            context.contentResolver.openInputStream(zipFileUri).use { zipInputStream ->
                ZipInputStream(BufferedInputStream(zipInputStream)).use { zis ->
                    var zipEntry: ZipEntry?

                    while (zis.nextEntry.also { zipEntry = it } != null) {
                        val fileName = zipEntry?.name ?: continue

                        if (zipEntry!!.isDirectory) {
                            // Create the directory in the destination folder
                            destFolder?.createDirectory(fileName)
                        } else {
                            // Create a new file in the destination folder
                            val newFile = destFolder?.createFile("*/*", fileName)

                            // Write the contents of the zip entry to the new file
                            context.contentResolver.openOutputStream(newFile!!.uri).use { outputStream ->
                                val buffer = ByteArray(1024)
                                var length: Int
                                while (zis.read(buffer).also { length = it } > 0) {
                                    outputStream?.write(buffer, 0, length)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}