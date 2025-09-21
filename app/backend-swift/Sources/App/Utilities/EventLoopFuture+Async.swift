import Foundation
import NIOCore

extension EventLoopFuture {
    func get() async throws -> Value {
        try await withCheckedThrowingContinuation { continuation in
            whenComplete { result in
                switch result {
                case .success(let value):
                    continuation.resume(returning: value)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}
