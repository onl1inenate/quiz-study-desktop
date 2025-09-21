import Vapor

final class FoldersController {
    func boot(routes: RoutesBuilder) throws {
        routes.get(use: list)
        routes.post(use: create)
        routes.put(":id", use: rename)
        routes.delete(":id", use: remove)
    }

    func list(req: Request) async throws -> FolderListResponse {
        throw Abort(.notImplemented)
    }

    func create(req: Request) async throws -> CreateFolderResponse {
        throw Abort(.notImplemented)
    }

    func rename(req: Request) async throws -> OKResponse {
        throw Abort(.notImplemented)
    }

    func remove(req: Request) async throws -> OKResponse {
        throw Abort(.notImplemented)
    }
}

struct FolderListResponse: Content {
    let folders: [FolderSummary]
}

struct FolderSummary: Content {
    let id: UUID
    let name: String
    let decks: [FolderDeckSummary]
}

struct FolderDeckSummary: Content {
    let id: UUID
    let name: String
    let totalQuestions: Int
    let completed: Int
    let mastered: Int
    let unmastered: Int
}

struct CreateFolderResponse: Content {
    let id: UUID
}
