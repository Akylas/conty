import Foundation
import CommonCrypto

@objc(MegaURLProtocol)
class MegaURLProtocol: URLProtocol, URLSessionDataDelegate {

    private var task: URLSessionDataTask?
    private var cryptor: CCCryptorRef?

    private var aesKey = Data(count: 16)
    private var iv = Data(count: 16)

    // MARK: - Intercept

    override class func canInit(with request: URLRequest) -> Bool {
        return request.url?.absoluteString.contains("mega.nz/file/") == true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    override func startLoading() {
        guard let urlStr = request.url?.absoluteString else { return }

        print("[Mega] Intercepting: \(urlStr)")

        guard let fileId = extractFileId(urlStr),
              let keyData = extractKey(urlStr) else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "Mega", code: -1))
            return
        }

        deriveKeyAndIV(from: keyData)

        fetchDownloadURL(fileId: fileId) { [weak self] downloadUrl, _ in
            guard let self = self, let downloadUrl = downloadUrl else { return }

            let req = URLRequest(url: URL(string: downloadUrl)!)
            let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)

            self.task = session.dataTask(with: req)
            self.task?.resume()
        }
    }

    override func stopLoading() {
        task?.cancel()
        if let cryptor = cryptor {
            CCCryptorRelease(cryptor)
        }
    }

    // MARK: - URL parsing

    private func extractFileId(_ url: String) -> String? {
        let regex = try! NSRegularExpression(pattern: "file/([^#]+)#")
        let match = regex.firstMatch(in: url, range: NSRange(url.startIndex..., in: url))
        guard let range = match?.range(at: 1) else { return nil }
        return String(url[Range(range, in: url)!])
    }

    private func extractKey(_ url: String) -> Data? {
        let regex = try! NSRegularExpression(pattern: "#(.+)$")
        let match = regex.firstMatch(in: url, range: NSRange(url.startIndex..., in: url))
        guard let range = match?.range(at: 1) else { return nil }

        var key = String(url[Range(range, in: url)!])
        key = key.replacingOccurrences(of: "-", with: "+")
                 .replacingOccurrences(of: "_", with: "/")

        while key.count % 4 != 0 { key += "=" }

        return Data(base64Encoded: key)
    }

    // MARK: - KEY DERIVATION (CRITICAL)

    private func deriveKeyAndIV(from key: Data) {
        precondition(key.count == 32)

        let k = [UInt8](key)

        var aes = [UInt8](repeating: 0, count: 16)
        var ivBytes = [UInt8](repeating: 0, count: 16)

        for i in 0..<8 {
            aes[i]     = k[i] ^ k[i + 16]
            aes[i + 8] = k[i + 8] ^ k[i + 24]
        }

        for i in 0..<8 {
            ivBytes[i] = k[i + 16]
        }

        self.aesKey = Data(aes)
        self.iv = Data(ivBytes)

        print("[Mega] Derived AES key + IV")

        setupCryptor()
    }

    private func setupCryptor() {
        let keyBytes = [UInt8](aesKey)
        let ivBytes = [UInt8](iv)

        CCCryptorCreateWithMode(
            CCOperation(kCCDecrypt),
            CCMode(kCCModeCTR),
            CCAlgorithm(kCCAlgorithmAES),
            CCPadding(ccNoPadding),
            ivBytes,
            keyBytes,
            keyBytes.count,
            nil,
            0,
            0,
            CCModeOptions(kCCModeOptionCTR_BE),
            &cryptor
        )

        print("[Mega] Cryptor initialized")
    }

    // MARK: - Mega API

    private func fetchDownloadURL(fileId: String, completion: @escaping (String?, Int64) -> Void) {

        let url = URL(string: "https://g.api.mega.co.nz/cs")!
        let payload: [[String: Any]] = [["a": "g", "g": 1, "p": fileId]]

        let body = try! JSONSerialization.data(withJSONObject: payload)

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.httpBody = body

        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let obj = json.first,
                  let g = obj["g"] as? String,
                  let s = obj["s"] as? Int64 else {
                completion(nil, 0)
                return
            }

            completion(g, s)
        }.resume()
    }

    // MARK: - Streaming

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {

        guard let cryptor = cryptor else { return }

        var outLength = data.count
        var outData = Data(count: data.count)

        data.withUnsafeBytes { inBytes in
            outData.withUnsafeMutableBytes { outBytes in
                CCCryptorUpdate(
                    cryptor,
                    inBytes.baseAddress,
                    data.count,
                    outBytes.baseAddress,
                    outLength,
                    &outLength
                )
            }
        }

        client?.urlProtocol(self, didLoad: outData)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {

        if let error = error {
            client?.urlProtocol(self, didFailWithError: error)
        } else {
            client?.urlProtocolDidFinishLoading(self)
        }

        if let cryptor = cryptor {
            CCCryptorRelease(cryptor)
        }
    }
}