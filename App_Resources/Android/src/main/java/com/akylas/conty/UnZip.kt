package com.akylas.conty

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.anggrayudi.storage.file.findFolder
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.InvalidParameterException
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream

class UnZip {
    interface ZipCallback {

        enum class Mode {
            ZIP,
            UNZIP
        }
        fun onStart(worker: String, mode: Mode)

        fun onUnzipComplete(worker: String, extractedFolder: String)
        fun onError(worker: String, e: Exception, mode: Mode)
    }

    internal class WUnzipWorker(
        private val context: Context,
        private val zipFile: File,
        private val destinationFolder: File,
        private val workerIdentifier: String,
        private val callback: ZipCallback
    ) : Thread() {
        override fun run() {
            if (!destinationFolder.exists()) {
                destinationFolder.mkdirs()
            }
            val buffer = ByteArray(1024)
            val zipInputStream = ZipInputStream(FileInputStream(zipFile))
            try {
                var zipEntry: ZipEntry? = zipInputStream.nextEntry
                while (zipEntry != null) {
                    val newFile = File(destinationFolder, zipEntry.name)

                    // If it's a directory, create it
                    if (zipEntry.isDirectory) {
                        newFile.mkdirs()
                    } else {
                        // Create parent directories if needed
                        newFile.parentFile?.mkdirs()

                        // Write file content
                        val fileOutputStream = FileOutputStream(newFile)
                        var len: Int
                        while (zipInputStream.read(buffer).also { len = it } > 0) {
                            fileOutputStream.write(buffer, 0, len)
                        }
                        fileOutputStream.close()
                    }
                    zipInputStream.closeEntry()
                    zipEntry = zipInputStream.nextEntry
                }
                callback.onUnzipComplete(workerIdentifier, destinationFolder.path)
            } catch (e: IOException) {
                callback.onError(workerIdentifier, e, ZipCallback.Mode.UNZIP)
            } finally {
                zipInputStream.close()
            }
        }
    }
    internal class WUnzipWorkerSAF(
        private val context: Context,
        private val zipFile: String,
        private val destinationFolder: String,
        private val workerIdentifier: String,
        private val callback: ZipCallback
    ) : Thread() {
        override fun run() {
            var outputIsSaf = destinationFolder.startsWith(CONTENT_PATH)
            var destinationFolderDocFile: DocumentFile? = null
            var destinationFolderFile: File? = null
            if (outputIsSaf) {
                destinationFolderDocFile = DocumentFile.fromTreeUri(context, Uri.parse(destinationFolder))
                if (destinationFolderDocFile == null) {
                    callback.onError(workerIdentifier, Exception("zip cannot unzip to destination: $destinationFolder"), ZipCallback.Mode.UNZIP)
                    return
                }
            } else {
                destinationFolderFile = File(destinationFolder)
                destinationFolderFile.mkdirs()
            }
            var inputStream: InputStream? = null
            if (zipFile.startsWith(CONTENT_PATH)) {
                var documentFile = DocumentFile.fromSingleUri(context, Uri.parse(zipFile))
                if (documentFile == null) {
                    callback.onError(workerIdentifier, Exception("zip not existing: $zipFile"), ZipCallback.Mode.UNZIP)
                    return
                }
                inputStream = context.contentResolver.openInputStream(documentFile!!.uri)
            } else {
                inputStream = FileInputStream(File(zipFile))
            }
            inputStream!!.use { zipFileInputStream ->
                ZipInputStream(zipFileInputStream).use { zis ->
                    try {
                        val buffer = ByteArray(1024)
                        callback.onStart(workerIdentifier, ZipCallback.Mode.UNZIP)
                        var zipEntry = zis.nextEntry
                        while (zipEntry != null) {
                            if (zipEntry.isDirectory) {
                                val name = if (zipEntry.name.endsWith("/") ) zipEntry.name.dropLast(1) else zipEntry.name
                                File(destinationFolderFile, name)?.mkdirs()

                                var destFolder =  destinationFolderDocFile
                                name.split("/").forEach{
                                    destFolder = destFolder?.findFolder(it) ?: destFolder?.createDirectory(it)
                                }
                            } else {
                                if (destinationFolderFile != null) {
                                    // Create parent directories if needed

                                    val newFile = File(destinationFolder, zipEntry.name)
                                    newFile.parentFile?.mkdirs()
                                    // Write file content
                                    val fileOutputStream = FileOutputStream(newFile)
                                    var len: Int
                                    while (zis.read(buffer).also { len = it } > 0) {
                                        fileOutputStream.write(buffer, 0, len)
                                    }
                                    fileOutputStream.close()
                                }
                                if (destinationFolderDocFile != null) {
                                    // Create a new file in the target folder
                                    val paths = zipEntry.name.split("/")
                                    val name =paths.last()
                                    var destFolder =  destinationFolderDocFile
                                    paths.dropLast(1).forEach {
                                        destFolder = destFolder?.findFolder(it) ?: destFolder?.createDirectory(it)
                                    }
                                    val newFile = destFolder?.findFile(name) ?:  destFolder?.createFile("*/*",  name)

                                    newFile?.uri?.let { fileUri ->
                                        // Write the file content
                                        context.contentResolver.openOutputStream(fileUri)?.use { outputStream ->
                                            var len: Int
                                            while (zis.read(buffer).also { len = it } > 0) {
                                                outputStream.write(buffer, 0, len)
                                            }
                                        }
                                    }
                                }
                            }
                            zipEntry = zis.nextEntry
                        }
                        callback.onUnzipComplete(workerIdentifier, destinationFolder)
                    } catch (exception: Exception) {
                        callback.onError(workerIdentifier, exception, ZipCallback.Mode.UNZIP)
                    }
                }
            }
        }
    }
    companion object {
        val CONTENT_PATH = "content://"
        /**
         * Method to extract the contents of the ZIP file
         * @param zipFile Zip file to extract
         * @param destinationFolder Where to extract
         * @param workerIdentifier Background thread identifier
         * @param callback Callback method
         */
        @JvmStatic
        fun unzip(
            context: Context,
            zipFile: String,
            destinationFolder: String,
            workerIdentifier: String,
            callback: ZipCallback
        ) {
            if (!zipFile.startsWith(CONTENT_PATH) && !destinationFolder.startsWith(CONTENT_PATH)) {
                WUnzipWorker(context, File(zipFile), File(destinationFolder), workerIdentifier, callback).run {
                    start()
                }
            } else {
                WUnzipWorkerSAF(context, zipFile, destinationFolder, workerIdentifier, callback).run {
                    start()
                }
            }
        }
    }
}