import Foundation
import AFNetworking
import CommonCrypto

@objc public class MegaDownloaderBridge: NSObject {

    private let manager: AFURLSessionManager
    private var tasksByTag: [String: CancelableMegaDownloadTask] = [:]

    @objc public init(manager: AFURLSessionManager) {
        self.manager = manager
        super.init()
    }

    @objc public func download(
        _ urlString: String,
        _ tag: String,
        _ downloadPath: String,
        _ onProgress: @escaping (Int64, Int64) -> Void,
        _ completion: @escaping (String?, Error?) -> Void
    ) {

        guard let url = URL(string: urlString) else {
            completion(nil, NSError(domain: "Mega", code: 1,
                                    userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
            return
        }

        let downloader = MegaDownloader(manager: manager)
        downloader.downloadMegaURL(
            url,
            progress: { prog in
                // Ensure main thread
                DispatchQueue.main.async {
                    onProgress(prog.completedUnitCount, prog.totalUnitCount)
                }
            },
            completion: { response, location, error in
                DispatchQueue.main.async {
                    defer { self.tasksByTag.removeValue(forKey: tag) }

                    if let error = error {
                        completion(nil, error)
                        return
                    }

                    guard let location = location else {
                        completion(nil, NSError(domain: "Mega", code: 2,
                                                userInfo: [NSLocalizedDescriptionKey: "No file downloaded"]))
                        return
                    }

                    let destURL = URL(fileURLWithPath: downloadPath)
                    try? FileManager.default.removeItem(at: destURL)

                    do {
                        try FileManager.default.moveItem(at: location, to: destURL)
                        completion(downloadPath, nil)
                    } catch {
                        completion(nil, error)
                    }
                }
            },
            taskHandler: { task in
                // Wrap task to allow cancellation
                if let task = task {
                    let cancelable = CancelableMegaDownloadTask(task: task)
                    self.tasksByTag[tag] = cancelable
                }
            }
        )
    }

    @objc public func cancel(tag: String) {
        if let task = tasksByTag[tag] {
            task.cancel()
            tasksByTag.removeValue(forKey: tag)
        }
    }
}

// MARK: - Cancelable Wrapper
@objc public class CancelableMegaDownloadTask: NSObject {
    private let task: URLSessionDownloadTask

    init(task: URLSessionDownloadTask) {
        self.task = task
        super.init()
    }

    @objc public func cancel() {
        task.cancel()
    }
}