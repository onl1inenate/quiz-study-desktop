import Vapor

final class DecksController {
    func boot(routes: RoutesBuilder) throws {
        routes.get(use: list)
        routes.post(use: create)
        routes.get(":id", use: fetch)
        routes.put(":id", use: update)
        routes.post(":id", "reset", use: reset)
        routes.delete(":id", use: remove)
    }

    func list(req: Request) async throws -> DeckListResponse {
        throw Abort(.notImplemented)
    }

    func create(req: Request) async throws -> CreateDeckResponse {
        throw Abort(.notImplemented)
    }

    func fetch(req: Request) async throws -> DeckDetailResponse {
        throw Abort(.notImplemented)
    }

    func update(req: Request) async throws -> UpdateDeckResponse {
        throw Abort(.notImplemented)
    }

    func reset(req: Request) async throws -> OKResponse {
        throw Abort(.notImplemented)
    }

    func remove(req: Request) async throws -> OKResponse {
        throw Abort(.notImplemented)
    }
}

struct DeckListResponse: Content {
    let decks: [DeckSummary]
}

struct DeckSummary: Content {
    let id: UUID
    let name: String
    let totalQuestions: Int
    let mastered: Int
    let completed: Int
    let unmastered: Int
}

struct CreateDeckResponse: Content {
    let deckId: UUID
    let countsByType: [QuestionTypeCount]
}

struct QuestionTypeCount: Content {
    let type: String
    let n: Int
}

struct DeckDetailResponse: Content {
    let id: UUID
    let name: String
    let text: String
    let folderId: UUID?
    let totalQuestions: Int
    let completed: Int
    let mastered: Int
    let unmastered: Int
}

struct UpdateDeckResponse: Content {
    let ok: Bool
    let total: Int?
    let countsByType: [QuestionTypeCount]?
}

struct OKResponse: Content {
    let ok: Bool
    init(ok: Bool = true) {
        self.ok = ok
    }
}
