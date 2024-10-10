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
        val CONTENT_PATH = "content://"

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


        fun getFolderSize(context: Context, folderStr: String): Long {
            if (folderStr.startsWith(CONTENT_PATH)) {
                val outDocument =
                    DocumentFile.fromTreeUri(context, android.net.Uri.parse(folderStr))
                        ?: throw Exception("could not create access folder $folderStr")
                return getFolderSizeDocument(outDocument)
            } else {
                return getFolderSizeFile(File(folderStr))
            }
        }
        fun getFolderSizeFile(folder: File): Long {
            if (folder.isFile) return folder.length()

            var totalSize: Long = 0
            val files = folder.listFiles() ?: return 0

            for (file in files) {
                totalSize += when {
                    file.isFile -> file.length()
                    file.isDirectory -> getFolderSizeFile(file)  // Recursively handle subfolders
                    else -> 0L
                }
            }
            return totalSize
        }
        fun getFolderSizeDocument(folder: DocumentFile): Long {
            if (folder.isFile()) return folder.length()

            var totalSize: Long = 0
            val files = folder.listFiles() ?: return 0

            for (file in files) {
                totalSize += when {
                    file.isFile() -> file.length()
                    file.isDirectory() -> getFolderSizeDocument(file)  // Recursively handle subfolders
                    else -> 0L
                }
            }
            return totalSize
        }
    }
}