package com.akylas.conty

import com.akylas.conty.utils.FunctionCallback

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.BufferedInputStream
import java.io.IOException

import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream
import java.util.zip.ZipEntry

import android.content.Context
import android.net.Uri
import android.util.Log

import androidx.documentfile.provider.DocumentFile

import com.anggrayudi.storage.file.decompressZip
import com.anggrayudi.storage.result.ZipDecompressionResult

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.launch

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
        
        @JvmStatic
        fun unzip(context: Context, zipFile: String, destFolder: String, callback: FunctionCallback? = null, progress: ProgressCallback? = null) {
            GlobalScope.launch(Dispatchers.IO)  {
                val targetFolder = DocumentFile.fromTreeUri(context, Uri.parse(destFolder))
                val srcFile = DocumentFile.fromSingleUri(context, Uri.parse(zipFile))
                srcFile!!.decompressZip(context, targetFolder!!)
                    .onCompletion  {
                        if (it is CancellationException) {
                            callback?.onResult(Exception("Decompression is aborted"), null)
                        }
                    }.collect {
                        when (it) {
                            is ZipDecompressionResult.Decompressing ->  {
                                progress?.onProgress(it.bytesDecompressed, it.writeSpeed, it.fileCount)
                            }
                            is ZipDecompressionResult.Completed ->  {
                                callback?.onResult(null, true)
                            }

                            is ZipDecompressionResult.Error ->  {
                                callback?.onResult(Exception("error while decompressing zip ${it.errorCode.name}: ${it.message}"), null)
                            }

                            ZipDecompressionResult.Validating ->  {
                            }
                        }
                    }
            }
        }
    }
}