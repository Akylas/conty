package com.akylas.conty

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import android.content.Context
import android.net.Uri

class FileUtils {
    companion object {

        fun copyFile(context: Context, inputFilePath: String, destFolder: String, fileName: String, mimeType: String, overwrite: Boolean): String {
            val outDocument =
                    androidx.documentfile.provider.DocumentFile.fromTreeUri(context, android.net.Uri.parse(destFolder))
                        ?: throw Exception("could not create access folder $destFolder")

            var outfile: androidx.documentfile.provider.DocumentFile
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