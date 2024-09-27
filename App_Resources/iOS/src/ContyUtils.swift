import Foundation
import UIKit

@objcMembers
@objc(ContyUtils)
class ContyUtils : NSObject {
    static func cleanFilenameString(_ str: String) -> String? {
        let asciiData = str.data(using: .ascii, allowLossyConversion: true)
        if (asciiData != nil) {
            return String(data: asciiData!, encoding: .ascii)
        }
        return nil;
    }
 }
