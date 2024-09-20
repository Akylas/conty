import Foundation
import UIKit

@objcMembers
@objc(ContyUtils)
class ContyUtils : NSObject {
    static func cleanFilenameString(_ str: String) -> String {
        let asciiData = yourString.data(using: .ascii, allowLossyConversion: true)
        return String(data: asciiData, encoding: .ascii)
    }
 }