import Foundation
import AFNetworking
import CommonCrypto

@objc public class MegaDownloader: NSObject {

    private let manager: AFURLSessionManager

    @objc public init(manager: AFURLSessionManager) {
        self.manager = manager
        super.init()
    }

    /**
     Downloads a Mega URL or normal URL.

     - Parameters:
        - url: The file URL.
        - progress: Optional progress block (Progress object).
        - completion: Completion block called with decrypted local file URL or error.
        - taskHandler: Closure called with the underlying URLSessionDownloadTask once it is created.
     */
    @objc public func downloadMegaURL(
        _ url: URL,
        progress progressBlock: ((Progress) -> Void)?,
        completion completionBlock: @escaping (URLResponse?, URL?, Error?) -> Void,
        taskHandler: ((URLSessionDownloadTask?) -> Void)? = nil
    ) {

        // MARK: Normal URL fallback
        guard isMegaURL(url) else {
            let request = URLRequest(url: url)
            let task = manager.downloadTask(
                with: request,
                progress: progressBlock,
                destination: { _, _ in
                    let tmpDir = FileManager.default.temporaryDirectory
                    return tmpDir.appendingPathComponent(UUID().uuidString)
                },
                completionHandler: completionBlock
            )
            task.resume()
            taskHandler?(task)
            return
        }

        // MARK: Extract File ID + Key
        guard let fileId = extractFileId(url),
              let keyData = extractKey(url) else {
            completionBlock(nil, nil, NSError(domain: "Mega", code: 1,
                                              userInfo: [NSLocalizedDescriptionKey: "Invalid Mega URL"]))
            return
        }

        let (aesKey, iv) = deriveKeyAndIV(from: keyData)

        // MARK: Fetch Mega download URL asynchronously
        fetchMegaDownloadURL(fileId: fileId) { result in
            switch result {
            case .failure(let error):
                DispatchQueue.main.async {
                    completionBlock(nil, nil, error)
                }
            case .success(let downloadUrlString):
                guard let realURL = URL(string: downloadUrlString) else {
                    DispatchQueue.main.async {
                        completionBlock(nil, nil, NSError(domain: "Mega", code: 3,
                                                          userInfo: [NSLocalizedDescriptionKey: "Invalid Mega download URL"]))
                    }
                    return
                }

                let request = URLRequest(url: realURL)
                let task = self.manager.downloadTask(
                    with: request,
                    progress: progressBlock,
                    destination: { _, _ in
                        let tmpDir = FileManager.default.temporaryDirectory
                        return tmpDir.appendingPathComponent(UUID().uuidString)
                    },
                    completionHandler: { response, location, error in
                        DispatchQueue.main.async {
                            if let error = error {
                                completionBlock(response, nil, error)
                                return
                            }
                            guard let location = location else {
                                completionBlock(response, nil, NSError(domain: "Mega", code: 4,
                                                                       userInfo: [NSLocalizedDescriptionKey: "No file downloaded"]))
                                return
                            }
                            do {
                                let decryptedURL = try self.decryptFileStreaming(
                                    inputURL: location,
                                    aesKey: aesKey,
                                    iv: iv
                                )
                                completionBlock(response, decryptedURL, nil)
                            } catch {
                                completionBlock(response, nil, error)
                            }
                        }
                    }
                )

                task.resume()
                taskHandler?(task)
            }
        }
    }

    // MARK: - Fetch Mega URL
    private func fetchMegaDownloadURL(fileId: String, completion: @escaping (Result<String, Error>) -> Void) {
        let apiURL = URL(string: "https://g.api.mega.co.nz/cs")!
        let payload: [[String: Any]] = [["a":"g","g":1,"p":fileId]]

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                  let obj = json.first,
                  let urlStr = obj["g"] as? String else {
                completion(.failure(NSError(domain: "Mega", code: 2,
                                            userInfo: [NSLocalizedDescriptionKey: "Failed to fetch Mega URL"])))
                return
            }
            completion(.success(urlStr))
        }.resume()
    }

    // MARK: - Streaming decryption
    private func decryptFileStreaming(inputURL: URL, aesKey: Data, iv: Data) throws -> URL {
        let inputStream = InputStream(url: inputURL)!
        let tempURL = inputURL.deletingLastPathComponent().appendingPathComponent(UUID().uuidString)

        FileManager.default.createFile(atPath: tempURL.path, contents: nil)
        let outputHandle = try FileHandle(forWritingTo: tempURL)

        inputStream.open()
        defer {
            inputStream.close()
            try? outputHandle.close()
        }

        var cryptor: CCCryptorRef?
        CCCryptorCreateWithMode(
            CCOperation(kCCDecrypt),
            CCMode(kCCModeCTR),
            CCAlgorithm(kCCAlgorithmAES),
            CCPadding(ccNoPadding),
            (iv as NSData).bytes,
            (aesKey as NSData).bytes,
            aesKey.count,
            nil,
            0,
            0,
            CCModeOptions(0),
            &cryptor
        )

        let bufferSize = 64 * 1024
        var inputBuffer = [UInt8](repeating: 0, count: bufferSize)
        var outputBuffer = [UInt8](repeating: 0, count: bufferSize)

        while inputStream.hasBytesAvailable {
            let read = inputStream.read(&inputBuffer, maxLength: bufferSize)
            if read <= 0 { break }

            var outLen: size_t = 0
            CCCryptorUpdate(
                cryptor!,
                inputBuffer,
                read,
                &outputBuffer,
                bufferSize,
                &outLen
            )

            if outLen > 0 {
                outputHandle.write(Data(bytes: outputBuffer, count: outLen))
            }
        }

        CCCryptorRelease(cryptor)
        return tempURL
    }

    // MARK: - Helpers
    private func isMegaURL(_ url: URL) -> Bool {
        return url.absoluteString.contains("mega.nz/file/")
    }

    private func extractFileId(_ url: URL) -> String? {
        return url.absoluteString
            .components(separatedBy: "#")
            .first?
            .components(separatedBy: "/")
            .last
    }

    private func extractKey(_ url: URL) -> Data? {
        let parts = url.absoluteString.components(separatedBy: "#")
        guard parts.count > 1 else { return nil }

        var key = parts[1]
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        while key.count % 4 != 0 { key += "=" }

        return Data(base64Encoded: key)
    }

    private func deriveKeyAndIV(from keyData: Data) -> (Data, Data) {
        let k = [UInt8](keyData)
        var aes = [UInt8](repeating: 0, count: 16)
        var iv = [UInt8](repeating: 0, count: 16)

        // XOR as per Mega spec
        for i in 0..<8 {
            aes[i]     = k[i] ^ k[i + 16]
            aes[i + 8] = k[i + 8] ^ k[i + 24]
        }

        for i in 0..<8 { iv[i] = k[i + 16] }

        return (Data(aes), Data(iv))
    }
}