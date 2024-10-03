package com.akylas.conty

import java.text.Normalizer

class Utils {
    companion object {
        fun cleanFilenameString(s: String): String {
            var normalized = Normalizer.normalize(s, Normalizer.Form.NFD)
            normalized = normalized.replace(Regex("\\p{InCombiningDiacriticalMarks}"), "")
            return normalized
        }
    }
}
