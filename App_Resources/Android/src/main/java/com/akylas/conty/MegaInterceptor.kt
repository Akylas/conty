package com.akylas.conty

import okhttp3.MediaType.Companion.toMediaTypeOrNull

import android.util.Base64
import android.util.Log
import okhttp3.*
import okio.*
import org.json.JSONArray
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

class MegaInterceptor : Interceptor {

    companion object {
        private const val TAG = "MegaInterceptor"
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val url = request.url.toString()

        if (!url.contains("mega.nz/file/")) {
            return chain.proceed(request)
        }

        Log.d(TAG, "➡️ Intercepting Mega URL: $url")

        val megaLink = parseMegaUrl(url)
        val (downloadUrl, size) = getDownloadInfo(megaLink.fileId)

        Log.d(TAG, "Download URL: $downloadUrl")
        Log.d(TAG, "File size: $size")

        val newRequest = request.newBuilder()
            .url(downloadUrl)
            .build()

        val response = chain.proceed(newRequest)

        val decryptedBody = DecryptResponseBody(
            response.body!!,
            megaLink.key,
            size
        )

        return response.newBuilder()
            .body(decryptedBody)
            .build()
    }

    // -------------------------
    // Mega URL parsing
    // -------------------------
    private data class MegaLink(val fileId: String, val key: ByteArray)

    private fun parseMegaUrl(url: String): MegaLink {
        val regex = Regex("file/([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)")
        val match = regex.find(url) ?: error("Invalid Mega URL")

        val fileId = match.groupValues[1]
        val keyStr = match.groupValues[2]
        val key = base64UrlDecode(keyStr)

        Log.d(TAG, "Parsed fileId=$fileId, keyLength=${key.size}")

        return MegaLink(fileId, key)
    }

    private fun base64UrlDecode(data: String): ByteArray {
        var s = data.replace('-', '+').replace('_', '/')
        while (s.length % 4 != 0) s += "="
        return Base64.decode(s, Base64.DEFAULT)
    }

    // -------------------------
    // Mega API call
    // -------------------------
    private fun getDownloadInfo(fileId: String): Pair<String, Long> {
        val json = JSONArray().apply {
            put(org.json.JSONObject().apply {
                put("a", "g")
                put("g", 1)
                put("p", fileId)
            })
        }

        val requestBody = RequestBody.create(
            "application/json".toMediaTypeOrNull(),
            json.toString()
        )

        val client = OkHttpClient()
        val request = Request.Builder()
            .url("https://g.api.mega.co.nz/cs")
            .post(requestBody)
            .build()

        val response = client.newCall(request).execute()
        val body = response.body?.string() ?: error("Empty Mega API response")

        val obj = JSONArray(body).getJSONObject(0)
        if (obj.has("e")) {
            error("Mega API error: ${obj.getInt("e")}")
        }

        return Pair(obj.getString("g"), obj.getLong("s"))
    }

    // -------------------------
    // KEY FIX: derive AES key + IV
    // -------------------------
    private fun deriveKeyAndIv(key: ByteArray): Pair<ByteArray, ByteArray> {
        require(key.size == 32) { "Invalid Mega key length" }

        val k0 = key.copyOfRange(0, 8)
        val k1 = key.copyOfRange(8, 16)
        val k2 = key.copyOfRange(16, 24)
        val k3 = key.copyOfRange(24, 32)

        val aesKey = ByteArray(16)
        val iv = ByteArray(16)

        for (i in 0 until 8) {
            aesKey[i] = (k0[i].toInt() xor k2[i].toInt()).toByte()
            aesKey[8 + i] = (k1[i].toInt() xor k3[i].toInt()).toByte()
        }

        // IV = k2 + 8 zero bytes
        System.arraycopy(k2, 0, iv, 0, 8)

        Log.d(TAG, "Derived AES key + IV")

        return Pair(aesKey, iv)
    }

    // -------------------------
    // Decrypting ResponseBody
    // -------------------------
    private class DecryptResponseBody(
        private val original: ResponseBody,
        key: ByteArray,
        private val contentLength: Long
    ) : ResponseBody() {

        companion object {
            private const val TAG = "MegaDecrypt"
        }

        private val cipherStream: CipherInputStream

        init {
            val (aesKey, iv) = derive(key)

            val cipher = Cipher.getInstance("AES/CTR/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(aesKey, "AES"),
                IvParameterSpec(iv)
            )

            Log.d(TAG, "AES-CTR cipher initialized")

            cipherStream = CipherInputStream(original.byteStream(), cipher)
        }

        override fun contentType() = original.contentType()

        override fun contentLength() = contentLength

        override fun source(): BufferedSource {
            return object : ForwardingSource(cipherStream.source()) {
                var total = 0L

                override fun read(sink: Buffer, byteCount: Long): Long {
                    val read = super.read(sink, byteCount)
                    if (read > 0) {
                        total += read
                        Log.d(TAG, "Decrypted: $total / $contentLength")
                    }
                    return read
                }
            }.buffer()
        }

        override fun close() {
            Log.d(TAG, "Closing stream")
            cipherStream.close()
            original.close()
        }

        // local copy of derive function
        private fun derive(key: ByteArray): Pair<ByteArray, ByteArray> {
            val k0 = key.copyOfRange(0, 8)
            val k1 = key.copyOfRange(8, 16)
            val k2 = key.copyOfRange(16, 24)
            val k3 = key.copyOfRange(24, 32)

            val aesKey = ByteArray(16)
            val iv = ByteArray(16)

            for (i in 0 until 8) {
                aesKey[i] = (k0[i].toInt() xor k2[i].toInt()).toByte()
                aesKey[8 + i] = (k1[i].toInt() xor k3[i].toInt()).toByte()
            }

            System.arraycopy(k2, 0, iv, 0, 8)

            return Pair(aesKey, iv)
        }
    }
}