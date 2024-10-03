package com.akylas.conty

import java.io.File
import java.io.FileInputStream
import android.content.Context
import androidx.documentfile.provider.DocumentFile

class FileUtils {
    interface ProgressCallback {
        fun onProgress(bytesDecompressed: Long, writeSpeed: Int, fileCount: Int)
    }
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
    }
}