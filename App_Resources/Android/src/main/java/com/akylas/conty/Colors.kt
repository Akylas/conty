package com.akylas.conty

import android.graphics.Bitmap
import androidx.palette.graphics.Palette
import androidx.palette.graphics.Palette.Builder
import org.json.JSONObject
import com.akylas.conty.utils.FunctionCallback
import android.graphics.Color
import kotlin.math.sqrt
import kotlin.math.pow
import kotlin.concurrent.thread


class Colors {
    companion object {

        fun getPixels(bitmap: Bitmap): List<FloatArray> {
            val width = bitmap.width
            val height = bitmap.height
            val pixelsList = mutableListOf<FloatArray>()

            for (y in 0 until height) {
                for (x in 0 until width) {
                    val pixel = bitmap.getPixel(x, y)

                    // Extract RGB components and store them as a data point
                    val r = Color.red(pixel).toFloat()
                    val g = Color.green(pixel).toFloat()
                    val b = Color.blue(pixel).toFloat()

                    // Add the RGB values as a 3D point
                    pixelsList.add(floatArrayOf(r, g, b))
                }
            }

            return pixelsList
        }

        fun kMeansWithDominance(pixels: List<FloatArray>, k: Int, iterations: Int = 10): List<Pair<FloatArray, Int>> {
            val centroids = pixels.shuffled().take(k).toMutableList()  // Initialize centroids randomly
            val clusters = MutableList(k) { mutableListOf<FloatArray>() }
            val clusterSizes = MutableList(k) { 0 }  // To track the size of each cluster

            repeat(iterations) {
                // Assign each pixel to the nearest centroid
                for (pixel in pixels) {
                    val nearestCentroidIndex = centroids.indices.minByOrNull { index ->
                        euclideanDistance(pixel, centroids[index])
                    } ?: 0
                    clusters[nearestCentroidIndex].add(pixel)
                }

                // Update centroids and calculate cluster sizes
                for (i in centroids.indices) {
                    centroids[i] = calculateMean(clusters[i])
                    clusterSizes[i] = clusters[i].size  // Store the size of the cluster
                }

                // Clear clusters for the next iteration
                clusters.forEach { it.clear() }
            }

            // Return centroids along with their corresponding cluster sizes (dominance)
            return centroids.mapIndexed { index, centroid -> centroid to clusterSizes[index] }
        }
        fun euclideanDistance(p1: FloatArray, p2: FloatArray): Float {
            return sqrt((p1[0] - p2[0]).pow(2) + (p1[1] - p2[1]).pow(2) + (p1[2] - p2[2]).pow(2))
        }

        fun calculateMean(cluster: List<FloatArray>): FloatArray {
            val mean = FloatArray(3)
            if (cluster.isEmpty()) return mean

            for (point in cluster) {
                mean[0] += point[0]
                mean[1] += point[1]
                mean[2] += point[2]
            }
            mean[0] =  mean[0] / cluster.size
            mean[1] = mean[1] / cluster.size
            mean[2] = mean[2] / cluster.size

            return mean
        }

        @JvmOverloads
        fun getDominantColors(bitmap: Bitmap, k: Int, resizeThreshod: Int, iterations: Int = 10, callback: FunctionCallback) {
            thread(start = true) {
                try {
                    callback.onResult(null, getDominantColorsSync(bitmap, k, resizeThreshod, iterations))
                } catch (e: Exception) {
                    callback.onResult(e, null)
                }
            }
        }

        @JvmOverloads
        fun getDominantColorsSync(bitmap: Bitmap, k: Int, resizeThreshod: Int = -1, iterations: Int = 10): String {
            val scaledBitmap  = if (resizeThreshod > 0 && (bitmap.width > resizeThreshod || bitmap.height > resizeThreshod))  Bitmap.createScaledBitmap(bitmap, resizeThreshod, resizeThreshod, false) else bitmap
            val pixels = getPixels(scaledBitmap)
            val dominantColorsWithSize = kMeansWithDominance(pixels, k, iterations)
            val sortedColors = dominantColorsWithSize.sortedByDescending { it.second }
            return sortedColors.map {  (rgb, _) -> intColorToHex(Color.rgb(rgb[0].toInt(), rgb[1].toInt(), rgb[2].toInt()))}.joinToString(
                separator = "\",\"",
                prefix = "[\"",
                postfix = "\"]"
            )
        }


        fun intColorToHex(color: Int) = String.format("#%06X", (0xFFFFFF and color))
        fun paletteToJSON(palette: Palette?): String? {
            if (palette == null) {
                return null
            }
            var result = JSONObject()

            val swatchesTemp = palette!!.swatches
            val swatches = swatchesTemp.toMutableList()
            swatches.sortByDescending { it.population }
            result.put("dominant", intColorToHex(if (swatches.isNotEmpty()) swatches[0].rgb else 0))
            result.put("vibrant", intColorToHex(palette!!.getVibrantColor(0)))
            result.put("muted", intColorToHex(palette!!.getMutedColor(0)))
            result.put("darkVibrant", intColorToHex(palette!!.getDarkVibrantColor(0)))
            result.put("darkMuted", intColorToHex(palette!!.getDarkMutedColor(0)))
            result.put("lightVibrant", intColorToHex(palette!!.getLightVibrantColor(0)))
            result.put("lightMuted", intColorToHex(palette!!.getLightMutedColor(0)))
            return result.toString()
        }
        fun createPaletteSync(bitmap: Bitmap): String? {
            var palette = Palette.from(bitmap).generate()
            return paletteToJSON(palette)
        }

        // Generate palette asynchronously and use it on a different thread using onGenerated().
        fun createPalette(bitmap: Bitmap, callback: FunctionCallback? = null) {
            Palette.from(bitmap).generate { palette ->
                // Use generated instance.
                callback?.onResult(null, paletteToJSON(palette))
            }
        }
    }
}
